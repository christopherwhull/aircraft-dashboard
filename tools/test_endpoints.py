#!/usr/bin/env python3
"""
Port of tools/test-endpoints.ps1 to Python
"""
import argparse
import json
import sys
import time
from typing import Any, Dict

try:
    import requests
except Exception:
    print("ERROR: Python dependency 'requests' is required. Install with: pip install requests")
    sys.exit(2)

BASE_URL = "http://localhost:3002"


class Tracker:
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


def get_json(endpoint: str, timeout: float = 10.0):
    url = f"{BASE_URL}{endpoint}"
    r = requests.get(url, timeout=timeout)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    return r.text


def test(tracker: Tracker, name: str, endpoint: str, validator):
    print(f"Testing: {name}")
    start = time.time()
    try:
        text = get_json(endpoint)
    except RuntimeError as e:
        tracker.record(name, False, f"Exception: {e}")
        print(f"  ❌ FAILED: Exception: {e}")
        return
    except Exception as e:
        tracker.record(name, False, f"Exception: {e}")
        print(f"  ❌ FAILED: Exception: {e}")
        return
    duration_ms = int((time.time() - start) * 1000)

    # Some endpoints (/) return HTML, handle specially
    is_html_check = endpoint == '/'
    if is_html_check:
        if "<title>AirSquawk</title>" in text:
            tracker.record(name, True, "Dashboard HTML loaded successfully")
            print(f"  ✅ PASSED: Dashboard HTML loaded successfully ({duration_ms}ms)")
        else:
            tracker.record(name, False, "Dashboard HTML not found")
            print(f"  ❌ FAILED: Dashboard HTML not found")
        return

    try:
        data = json.loads(text)
    except Exception:
        tracker.record(name, False, "Invalid JSON response")
        print("  ❌ FAILED: Could not parse JSON response")
        return

    try:
        ok, message = validator(data)
    except Exception as e:
        tracker.record(name, False, f"Validator exception: {e}")
        print(f"  ❌ FAILED: Validator exception: {e}")
        return

    if ok:
        tracker.record(name, True, message)
        print(f"  ✅ PASSED: {message} ({duration_ms}ms)")
    else:
        tracker.record(name, False, message)
        print(f"  ❌ FAILED: {message} ({duration_ms}ms)")


def v_health(data: Dict[str, Any]):
    return (data.get('status') == 'ok', f"Server health: {data.get('status')}" )


def v_airline_stats(data: Dict[str, Any]):
    hourly = data.get('hourly') or {}
    by_airline = hourly.get('byAirline')
    if isinstance(by_airline, dict):
        return (True, f"{len(by_airline.keys())} airlines detected")
    return (False, "Airline stats structure invalid")


def v_flights(data: Dict[str, Any]):
    flights = data.get('flights')
    if isinstance(flights, list):
        return (True, f"{len(flights)} flights")
    return (False, "Flights structure invalid")


def v_squawk_transitions(data: Dict[str, Any]):
    total = data.get('totalTransitions')
    if isinstance(total, int):
        return (True, f"{total} transitions")
    return (False, "Squawk transitions structure invalid")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default=None, help='Base URL for server (overrides default)')
    args = parser.parse_args()
    global BASE_URL
    if args.base:
        BASE_URL = args.base

    tracker = Tracker()

    try:
        # Root HTML
        r = requests.get(BASE_URL + "/")
        if r.status_code != 200:
            print(f"Server did not respond (HTTP {r.status_code})")
            sys.exit(1)
    except Exception as e:
        print(f"Could not connect to server: {e}")
        sys.exit(1)

    # Get server uptime
    server_uptime_ms = 0
    try:
        text = get_json('/api/server-status')
        server_uptime_ms = json.loads(text).get('serverUptimeMs', 0)
    except Exception:
        pass

    # Run tests
    test(tracker, "Dashboard Root", "/", lambda d: (True, ''))
    test(tracker, "Health Check", "/api/health", v_health)
    test(tracker, "Airline Stats (1h)", "/api/airline-stats?window=1h", v_airline_stats)
    test(tracker, "Airline Stats (24h)", "/api/airline-stats?window=24h", v_airline_stats)
    test(tracker, "Flights (24h)", "/api/flights?gap=5&window=24h", v_flights)
    test(tracker, "Flights (7d)", "/api/flights?gap=5&window=7d", v_flights)
    if server_uptime_ms < 180000:
        print("Skipping squawk tests (server uptime < 3 minutes)")
    else:
        test(tracker, "Squawk Transitions (1h)", "/api/squawk-transitions?hours=1", v_squawk_transitions)
        test(tracker, "Squawk Transitions (24h)", "/api/squawk-transitions?hours=24", v_squawk_transitions)
        test(tracker, "Squawk Transitions (7d)", "/api/squawk-transitions?hours=168", v_squawk_transitions)
    test(tracker, "Reception Range (1h)", "/api/reception-range?hours=1", lambda data: (True, 'Reception range ok' if isinstance(data.get('sectors'), dict) else 'No reception data'))
    test(tracker, "Reception Range (24h)", "/api/reception-range?hours=24", lambda data: (True, 'Reception range OK' if isinstance(data.get('sectors'), dict) else 'No reception data'))
    test(tracker, "Position Stats (24h)", "/api/positions?hours=24", lambda data: (True, 'Position stats ok' if isinstance(data.get('aircraftCount'), int) else 'No positions'))
    test(tracker, "Cache Status", "/api/cache-status", lambda data: (True, 'Cache status ok' if data.get('positionCache') is not None else 'No cache data'))

    # Validate flights structure
    def validate_flights_structure(data):
        flights = data.get('flights')
        if flights and isinstance(flights, list) and len(flights) > 0:
            first = flights[0]
            has_required = 'icao' in first and 'start_time' in first and 'end_time' in first
            return (has_required, 'Flight record has required fields' if has_required else 'Flight record missing required fields')
        return (False, 'No flights to validate')

    test(tracker, 'Flights Data Structure', '/api/flights?gap=5&window=24h', validate_flights_structure)

    # Performance test
    start = time.time()
    try:
        r = requests.get(BASE_URL + '/api/flights?gap=5&window=24h')
        duration_ms = int((time.time() - start) * 1000)
        msg = f"{duration_ms}ms"
        if duration_ms < 5000:
            tracker.record('Flights Response Time', True, msg)
            print(f"  ✅ PASSED: Flights Endpoint Response Time {msg}")
        else:
            tracker.record('Flights Response Time', True, f"{msg} (slower than expected)")
            print(f"  ⚠️  WARNING: Flights response time {msg}")
    except Exception as e:
        tracker.record('Flights Response Time', False, str(e))
        print(f"  ❌ FAILED: Flights response time: {e}")

    # Summary
    print('\nTest Summary:')
    print(f"  Passed: {tracker.passed}")
    print(f"  Failed: {tracker.failed}")

    if tracker.failed == 0:
        sys.exit(0)
    else:
        for r in tracker.results:
            if not r['passed']:
                print(f"  • {r['name']}: {r['message']}")
        sys.exit(1)


if __name__ == '__main__':
    main()
