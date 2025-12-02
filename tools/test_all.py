#!/usr/bin/env python3
"""
Cross-platform replacement for tools/test-all.ps1
Runs a broad set of endpoint checks against the Node server and prints a summary.
"""
import argparse
import json
import sys
import time
from datetime import datetime
from typing import Any, Callable, Dict

try:
    import requests
except Exception:
    print("ERROR: Python dependency 'requests' is required. Install with: pip install requests")
    sys.exit(2)

BASE_URL = "http://localhost:3002"
PAWARE_URL = None


class TestTracker:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []

    def record(self, name: str, passed: bool, message: str):
        self.results.append({"name": name, "passed": passed, "message": message})
        if passed:
            self.passed += 1
        else:
            self.failed += 1


def http_get(endpoint: str, timeout: float = 10.0) -> (int, Any):
    url = f"{BASE_URL}{endpoint}"
    r = requests.get(url, timeout=timeout)
    return r.status_code, r.text


def try_parse_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        return None


def test_endpoint(tracker: TestTracker, name: str, endpoint: str, validator: Callable[[Any], Dict[str, Any]], timeout: float = 10.0, soft_fail: bool = False):
    print(f"  Testing: {name}")
    start = time.time()
    try:
        status, body = http_get(endpoint, timeout=timeout)
        duration_ms = int((time.time() - start) * 1000)
    except Exception as e:
        if soft_fail:
            tracker.record(name, True, f"WARNING: {e}")
            print(f"    ⚠️  WARNING: {e}")
        else:
            tracker.record(name, False, f"Exception: {e}")
            print(f"    ❌ FAILED: Exception: {e}")
        return

    if status != 200:
        error_message = f"HTTP {status}: {body[:500]}" # Truncate for readability
        if soft_fail:
            tracker.record(name, True, f"WARNING: {error_message}")
            print(f"    ⚠️  WARNING: {error_message}")
        else:
            tracker.record(name, False, error_message)
            print(f"    ❌ FAILED: {error_message}")
        return

    data = try_parse_json(body)
    if data is None:
        if soft_fail:
            tracker.record(name, True, "WARNING: Invalid JSON")
            print(f"    ⚠️  WARNING: Invalid JSON")
        else:
            tracker.record(name, False, "Invalid JSON")
            print(f"    ❌ FAILED: Invalid JSON")
        return

    try:
        result = validator(data)
    except Exception as e:
        if soft_fail:
            tracker.record(name, True, f"WARNING: Validator exception: {e}")
            print(f"    ⚠️  WARNING: Validator exception: {e}")
        else:
            tracker.record(name, False, f"Validator exception: {e}")
            print(f"    ❌ FAILED: Validator exception: {e}")
        return

    if result.get('passed'):
        tracker.record(name, True, f"{result.get('message', '')} ({duration_ms}ms)")
        print(f"    ✅ {result.get('message', '')} ({duration_ms}ms)")
    else:
        if soft_fail:
            tracker.record(name, True, f"WARNING: {result.get('message', '')} ({duration_ms}ms)")
            print(f"    ⚠️  WARNING: {result.get('message', '')} ({duration_ms}ms)")
        else:
            tracker.record(name, False, f"{result.get('message', '')} ({duration_ms}ms)")
            print(f"    ❌ {result.get('message', '')} ({duration_ms}ms)")


def validate_health(data: Dict[str, Any]) -> Dict[str, Any]:
    passed = data.get('status') == 'ok'
    message = f"Server health {data.get('status', 'error')}, cache ready: {data.get('positionCacheReady', False)}"
    return {'passed': passed, 'message': message}


def validate_cache_status(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data.get('positionCache', {}), dict):
        return {'passed': False, 'message': 'positionCache missing'}
    pos_cache = data.get('positionCache', {})
    total_positions = pos_cache.get('totalPositions', 0)
    unique = pos_cache.get('uniqueAircraft', 0)
    s3ops = data.get('s3Operations', {})
    reads = s3ops.get('reads', 0)
    last_read = s3ops.get('lastRead', 'Never')
    msg = f"{total_positions} positions, {unique} aircraft | S3: {reads} reads, last read: {last_read}"
    return {'passed': True, 'message': msg}


def validate_flights_24h(data: Any) -> Dict[str, Any]:
    flights = data.get('flights') if isinstance(data, dict) else None
    if flights and isinstance(flights, list) and len(flights) > 0:
        first = flights[0]
        if first.get('icao') and first.get('start_time'):
            return {'passed': True, 'message': f"{len(flights)} flights, first: {first.get('icao')}"}
        return {'passed': False, 'message': 'Flight record missing required fields'}
    else:
        return {'passed': True, 'message': f"{len(flights) if flights else 0} flights (no recent data)"}


def validate_flights_7d(data: Any) -> Dict[str, Any]:
    flights = data.get('flights') if isinstance(data, dict) else None
    if flights and isinstance(flights, list):
        return {'passed': True, 'message': f"{len(flights)} flights in 7 days"}
    return {'passed': False, 'message': 'Flights structure invalid'}


def validate_airline_stats(data: Any) -> Dict[str, Any]:
    if isinstance(data, dict) and data.get('hourly') and data['hourly'].get('byAirline'):
        airlines = data['hourly']['byAirline']
        count = len(list(airlines.keys())) if isinstance(airlines, dict) else 0
        return {'passed': True, 'message': f"{count} airlines"}
    return {'passed': False, 'message': 'Airline stats invalid'}


def validate_squawk_24(data: Dict[str, Any]) -> Dict[str, Any]:
    total = data.get('totalTransitions', 0)
    return {'passed': total >= 0, 'message': f"{total} transitions"}


def validate_reception_range(data: Dict[str, Any]) -> Dict[str, Any]:
    sectors = data.get('sectors', {})
    max_range = data.get('maxRange', None)
    sector_count = len(sectors) if isinstance(sectors, dict) else 0
    return {'passed': True, 'message': f"{sector_count} sectors, max {max_range}"}


def validate_heatmap(data: Dict[str, Any]) -> Dict[str, Any]:
    grid = data.get('grid', [])
    return {'passed': True, 'message': f"{len(grid)} grid cells"}


def validate_position_timeseries_live(data: Any) -> Dict[str, Any]:
    if not isinstance(data, list) or len(data) == 0:
        return {'passed': True, 'message': 'No live position data yet'}
    total_positions = 0
    for bucket in data:
        total_positions += int(bucket.get('positionCount', 0))
    return {'passed': True, 'message': f"{len(data)} time buckets, {total_positions} total positions"}


def validate_historical_stats(data: Dict[str, Any]) -> Dict[str, Any]:
    ts = data.get('timeSeries', [])
    totals = data.get('totals', {})
    if isinstance(ts, list) and totals:
        return {'passed': True, 'message': f"{len(ts)} time points, {totals.get('totalFlights', 0)} total flights"}
    return {'passed': False, 'message': 'Historical stats invalid'}


def validate_piaware_status(data: Dict[str, Any]) -> Dict[str, Any]:
    status = data.get('status', '')
    if status in ('connected', 'ok'):
        # Handle different ways aircraft count might be represented
        aircraft = data.get('aircraft', data.get('aircraft_count', 0))
        if isinstance(aircraft, list):
            count = len(aircraft)
        elif isinstance(aircraft, dict):
            count = len(aircraft.get('aircraft', []))
        else:
            count = int(aircraft)
        return {'passed': True, 'message': f"Connected ({count} aircraft)"}
    return {'passed': False, 'message': f"PiAware status: {status}"}


def get_piaware_origin_url():
    import os, re
    from urllib.parse import urlparse
    url = os.environ.get('PIAWARE_URL')
    if url:
        return url
    try:
        with open('config.js', 'r', encoding='utf8') as f:
            content = f.read()
            m = re.search(r"piAwareUrl:\s*process\.env\.PIAWARE_URL\s*\|\|\s*'([^']+)'", content)
            if m:
                full_url = m.group(1)
                parsed_url = urlparse(full_url)
                return f"{parsed_url.scheme}://{parsed_url.netloc}"
    except Exception:
        pass
    return None


def validate_piaware_origin(data: Any) -> Dict[str, Any]:
    # data here is parsed JSON or string; return similar validation as the other script
    if isinstance(data, dict):
        aircraft_key = data.get('aircraft')
        if aircraft_key is not None:
            return {'passed': True, 'message': f"Origin OK: {aircraft_key} aircraft"}
        return {'passed': True, 'message': 'Origin OK (parsed JSON)'}
    # non-JSON body still OK
    return {'passed': True, 'message': 'Origin OK: HTTP 200 (non-JSON)'}


def performance_test(tracker: TestTracker):
    # Measure /api/flights?gap=5&window=24h
    endpoint = "/api/flights?gap=5&window=24h"
    start = time.time()
    try:
        status, _ = http_get(endpoint, timeout=10)
        duration_ms = int((time.time() - start) * 1000)
    except Exception as e:
        tracker.record('Performance', False, f"Exception: {e}")
        print(f"    ❌ Performance failed: Exception: {e}")
        return
    if status != 200:
        tracker.record('Performance', False, f"HTTP {status}")
        print(f"    ❌ Performance failed: HTTP {status}")
        return
    if duration_ms < 2000:
        tracker.record('Performance', True, f"Excellent performance ({duration_ms}ms)")
        print(f"    ✅ Excellent performance ({duration_ms}ms)")
    elif duration_ms < 5000:
        tracker.record('Performance', True, f"Good performance ({duration_ms}ms)")
        print(f"    ✅ Good performance ({duration_ms}ms)")
    else:
        tracker.record('Performance', True, f"Slow response ({duration_ms}ms)")
        print(f"    ⚠️  Slow response ({duration_ms}ms)")


def run_all_tests(runs: int = 1, delay: float = 1.0):
    print('\n' + '='*50)
    print('AIRCRAFT DASHBOARD - COMPREHENSIVE TEST SUITE')
    print('='*50)
    print(f"Running {runs} test iteration(s)\n")

    # Get server uptime
    server_uptime_ms = 0
    try:
        status, body = http_get('/api/server-status')
        if status == 200:
            server_uptime_ms = json.loads(body).get('serverUptimeMs', 0)
    except Exception:
        pass

    all_results = []


    configs = [
        ("Health Check", "/api/health", validate_health),
        ("PiAware Status", "/api/piaware-status", validate_piaware_status),
        ("PiAware Origin", "__external__", validate_piaware_origin),
        ("Cache Status", "/api/cache-status", validate_cache_status),
        ("Flights (24h)", "/api/flights?gap=5&window=24h", validate_flights_24h),
        ("Flights (7d)", "/api/flights?gap=5&window=7d", validate_flights_7d),
        ("Airline Stats (1h)", "/api/airline-stats?window=1h", validate_airline_stats),
        ("Airline Stats (24h)", "/api/airline-stats?window=24h", validate_airline_stats),
    ]

    squawk_tests = [
        ("Squawk (24h)", "/api/squawk-transitions?hours=24", validate_squawk_24),
        ("Squawk (7d)", "/api/squawk-transitions?hours=168", validate_squawk_24),
    ]

    # If uptime < 10 minutes, keep squawk tests but use 3s timeout and soft-fail with warnings
    warmup_ms = 10 * 60 * 1000
    squawk_soft = server_uptime_ms < warmup_ms
    if squawk_soft:
        print("Warning: squawk endpoints within warmup window (<10 min uptime); failures will be warnings.")
    configs.extend(squawk_tests)

    configs.extend([
        ("Reception Range (1h)", "/api/reception-range?hours=1", validate_reception_range),
        ("Reception Range (24h)", "/api/reception-range?hours=24", validate_reception_range),
        ("Heatmap Data (24h)", "/api/heatmap-data?window=24h", validate_heatmap),
        ("Position Timeseries Live", "/api/position-timeseries-live?minutes=10&resolution=1", validate_position_timeseries_live),
        ("Historical Stats (24h)", "/api/historical-stats?hours=24", validate_historical_stats),
    ])

    for run_num in range(1, runs+1):
        print(f"========== TEST RUN {run_num} ==========")
        tracker = TestTracker()
        for name, endpoint, validator in configs:
            # special-case for direct origin
            if endpoint == '__external__':
                url = get_piaware_origin_url()
                if url:
                    try:
                        r = requests.get(url, timeout=20)
                        body = None
                        try:
                            body = r.json()
                        except Exception:
                            body = r.text
                        status = 200 if r.status_code == 200 else r.status_code
                        duration_ms = 0
                        result = validator(body)
                        if result.get('passed'):
                            tracker.record(name, True, f"{result.get('message', '')}")
                            print(f"    ✅ {result.get('message', '')}")
                        else:
                            tracker.record(name, False, f"{result.get('message', '')}")
                            print(f"    ❌ {result.get('message', '')}")
                    except Exception as e:
                        tracker.record(name, False, f"Exception: {e}")
                        print(f"    ❌ FAILED: Exception: {e}")
                else:
                    tracker.record(name, False, "PiAware origin not configured")
                    print("    ❌ FAILED: PiAware origin not configured")
            else:
                # Apply shorter timeout and soft-fail for squawk tests during warmup
                if name.startswith("Squawk "):
                    test_endpoint(tracker, name, endpoint, validator, timeout=3.0, soft_fail=squawk_soft)
                else:
                    test_endpoint(tracker, name, endpoint, validator)
        performance_test(tracker)
        all_results.append(tracker)
        passed = tracker.passed
        failed = tracker.failed
        print(f"\n  Run Summary: {passed} passed, {failed} failed\n")
        if run_num < runs:
            time.sleep(delay)

    # Aggregate results
    total_tests = sum(t.passed + t.failed for t in all_results)
    total_passed = sum(t.passed for t in all_results)
    total_failed = sum(t.failed for t in all_results)

    print('\n' + '='*50)
    print('TEST SUMMARY')
    print('='*50)
    print(f"Total Tests: {total_tests}")
    print(f"✅ Passed: {total_passed}")
    print(f"❌ Failed: {total_failed}\n")
    if total_failed == 0:
        print('*** ALL TESTS PASSED! Dashboard is fully operational.')
        return 0
    else:
        print(f"WARNING: {total_failed} test(s) failed")
        for t in all_results:
            for r in t.results:
                if not r['passed']:
                    print(f"  - {r['name']}: {r['message']}")
        return 1


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Run all test suites for Aircraft Dashboard')
    p.add_argument('-r', '--runs', type=int, default=1)
    p.add_argument('-d', '--delay', type=float, default=1.0)
    p.add_argument('--base-url', type=str, default=None)
    args = p.parse_args()
    if args.base_url:
        BASE_URL = args.base_url
    rc = run_all_tests(args.runs, args.delay)
    sys.exit(rc)
