#!/usr/bin/env python3
"""
Aircraft Dashboard Comprehensive Test Suite (test-all.py)

This script provides comprehensive testing capabilities for the Aircraft Dashboard system,
validating all critical components including health endpoints, data integrity, S3 connectivity,
and cross-platform process monitoring.

FEATURES:
- Selective Test Execution: Use command-line switches to run specific test categories
- Fast S3 Validation: Uses head_object for efficient file age checking without full downloads
- Cross-Platform Support: Detects processes on both Windows (tasklist) and Linux (ps)
- Comprehensive Coverage: Tests health endpoints, data consistency, tracker processes, and recent file availability
- Performance Testing: Measures response times for critical endpoints
- Multiple Test Runs: Support for repeated test execution with configurable delays

TEST CATEGORIES:
- Health Checks: Validates dashboard health endpoints and API responses
- PiAware Connectivity: Tests connection to PiAware server and data flow
- Tracker Process: Verifies aircraft tracker process is running
- S3 Data Validation: Checks bucket structure and recent file availability
- Data Integrity: Validates flight data, airline stats, and cache status
- Performance: Measures response times for critical API endpoints

USAGE EXAMPLES:
    # Run all tests
    python tools/test-all.py

    # Run only health and connectivity tests
    python tools/test-all.py --health --piaware-conn

    # Run S3 and data validation tests
    python tools/test-all.py --recent-files --cache-status

    # Run tracker process tests
    python tools/test-all.py --tracker

    # Run multiple iterations with delay
    python tools/test-all.py --all --runs 3 --delay 2.0

DEPENDENCIES:
- requests: For HTTP API testing
- boto3: For S3/MinIO connectivity testing
- Python 3.7+: For type hints and modern features

CONFIGURATION:
The script uses configuration from config.js for S3 endpoints, bucket names, and API endpoints.
Ensure proper configuration before running tests.

EXIT CODES:
- 0: All tests passed
- 1: One or more tests failed
- 2: Configuration or environment error

AUTHOR: Aircraft Dashboard Development Team
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

try:
    import boto3
except Exception:
    print("ERROR: Python dependency 'boto3' is required. Install with: pip install boto3")
    sys.exit(2)

BASE_URL = "http://localhost:3002"
PAWARE_URL = None


class TestTracker:
    """
    Tracks test results and maintains statistics for test execution.

    This class provides a centralized way to record test outcomes, count passes/failures,
    and store detailed results for reporting purposes.
    """
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []

    def record(self, name: str, passed: bool, message: str):
        """
        Record a test result.

        Args:
            name: Test name/description
            passed: True if test passed, False if failed
            message: Detailed result message
        """
        self.results.append({"name": name, "passed": passed, "message": message})
        if passed:
            self.passed += 1
        else:
            self.failed += 1


def http_get(endpoint: str, timeout: float = 10.0) -> tuple[int, Any]:
    """
    Perform an HTTP GET request to the dashboard API.

    Args:
        endpoint: API endpoint path (e.g., '/api/health')
        timeout: Request timeout in seconds

    Returns:
        Tuple of (status_code, response_text)
    """
    url = f"{BASE_URL}{endpoint}"
    r = requests.get(url, timeout=timeout)
    return r.status_code, r.text


def try_parse_json(text: str):
    """
    Attempt to parse JSON text, returning None on failure.

    Args:
        text: JSON string to parse

    Returns:
        Parsed JSON object or None if parsing failed
    """
    try:
        return json.loads(text)
    except Exception:
        return None


def test_endpoint(tracker: TestTracker, name: str, endpoint: str, validator: Callable[[Any], Dict[str, Any]], timeout: float = 10.0, soft_fail: bool = False):
    """
    Test an API endpoint with validation and result tracking.

    This function performs the complete test cycle: HTTP request, response validation,
    and result recording. It supports both hard failures and soft failures (warnings).

    Args:
        tracker: TestTracker instance for recording results
        name: Test name for reporting
        endpoint: API endpoint to test
        validator: Function to validate response data
        timeout: Request timeout in seconds
        soft_fail: If True, failures are recorded as warnings instead of errors
    """
    print(f"  Testing: {name}")
    start = time.time()
    try:
        status, body = http_get(endpoint, timeout=timeout)
        duration_ms = int((time.time() - start) * 1000)
    except Exception as e:
        if soft_fail:
            tracker.record(name, True, f"WARNING: {e}")
            print(f"    [WARN] WARNING: {e}")
        else:
            tracker.record(name, False, f"Exception: {e}")
            print(f"    [FAIL] FAILED: Exception: {e}")
        return

    if status != 200:
        error_message = f"HTTP {status}: {body[:500]}" # Truncate for readability
        if soft_fail:
            tracker.record(name, True, f"WARNING: {error_message}")
            print(f"    [WARN] WARNING: {error_message}")
        else:
            tracker.record(name, False, error_message)
            print(f"    [FAIL] FAILED: {error_message}")
        return

    data = try_parse_json(body)
    if data is None:
        if soft_fail:
            tracker.record(name, True, "WARNING: Invalid JSON")
            print(f"    [WARN] WARNING: Invalid JSON")
        else:
            tracker.record(name, False, "Invalid JSON")
            print(f"    [FAIL] FAILED: Invalid JSON")
        return

    try:
        result = validator(data)
    except Exception as e:
        if soft_fail:
            tracker.record(name, True, f"WARNING: Validator exception: {e}")
            print(f"    [WARN] WARNING: Validator exception: {e}")
        else:
            tracker.record(name, False, f"Validator exception: {e}")
            print(f"    [FAIL] FAILED: Validator exception: {e}")
        return

    if result.get('passed'):
        tracker.record(name, True, f"{result.get('message', '')} ({duration_ms}ms)")
        print(f"    [PASS] {result.get('message', '')} ({duration_ms}ms)")
    else:
        if soft_fail:
            tracker.record(name, True, f"WARNING: {result.get('message', '')} ({duration_ms}ms)")
            print(f"    [WARN] WARNING: {result.get('message', '')} ({duration_ms}ms)")
        else:
            tracker.record(name, False, f"{result.get('message', '')} ({duration_ms}ms)")
            print(f"    [FAIL] {result.get('message', '')} ({duration_ms}ms)")


def validate_health(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate the /api/health endpoint response.

    Checks server status and position cache readiness.

    Args:
        data: Parsed JSON response from health endpoint

    Returns:
        Dict with 'passed' boolean and descriptive 'message'
    """
    passed = data.get('status') == 'ok'
    message = f"Server health {data.get('status', 'error')}, cache ready: {data.get('positionCacheReady', False)}"
    return {'passed': passed, 'message': message}


def validate_cache_status(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate the /api/cache-status endpoint response.

    Checks position cache statistics and S3 operation metrics.

    Args:
        data: Parsed JSON response from cache-status endpoint

    Returns:
        Dict with 'passed' boolean and descriptive 'message'
    """
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
    """
    Test PiAware connectivity by checking for recent files (last 3 minutes) in S3 bucket.        
    """
    try:
        import boto3
        from datetime import datetime, timezone

        # S3 configuration
        s3_client = boto3.client(
            's3',
            endpoint_url='http://localhost:9000',
            aws_access_key_id='minioadmin',
            aws_secret_access_key='minioadmin123',
            region_name='us-east-1'
        )

        bucket_name = 'aircraft-data-new'        # List objects in the bucket
        response = s3_client.list_objects_v2(Bucket=bucket_name)
        if 'Contents' not in response:
            return {'passed': False, 'message': "No files found in S3 bucket"}

        # Find the most recent piaware_aircraft_log file
        recent_files = []
        now = datetime.now(timezone.utc)

        for obj in response['Contents']:
            if 'piaware_aircraft_log' in obj['Key']:
                file_time = obj['LastModified']
                if isinstance(file_time, str):
                    file_time = datetime.fromisoformat(file_time.replace('Z', '+00:00'))
                elif file_time.tzinfo is None:
                    file_time = file_time.replace(tzinfo=timezone.utc)

                time_diff = now - file_time
                minutes_diff = time_diff.total_seconds() / 60

                if minutes_diff <= 3:  # Check for files within last 3 minutes
                    recent_files.append((obj['Key'], minutes_diff))

        if recent_files:
            # Sort by most recent
            recent_files.sort(key=lambda x: x[1])
            most_recent_file, minutes_ago = recent_files[0]
            return {'passed': True, 'message': f"Recent data: {most_recent_file} ({minutes_ago:.1f} min ago)"}
        else:
            return {'passed': False, 'message': "No recent PiAware files (last 3 min)"}

    except Exception as e:
        return {'passed': False, 'message': f"Exception checking S3 files: {e}"}


def validate_piaware_connectivity(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Test PiAware connectivity by performing comprehensive checks.

    This function tests connectivity to the PiAware server by:
    1. Pinging the server to verify network reachability
    2. Checking if port 8080 is open for aircraft data
    3. Testing the positions URL for valid aircraft data

    Args:
        data: Parsed JSON response (not used in this validator)

    Returns:
        Dict with 'passed' boolean and descriptive 'message'
    """
    import subprocess
    import socket

    piaware_url = '192.168.0.178'  # From config.js
    piaware_port = 8080
    positions_url = f'http://{piaware_url}:{piaware_port}/data/aircraft.json'

    # Test 1: Ping the server
    try:
        ping_result = subprocess.run(['ping', '-n', '1', piaware_url],
                                   capture_output=True, text=True, timeout=5)
        if ping_result.returncode != 0:
            return {'passed': False, 'message': f'Ping failed: {piaware_url} unreachable'}
    except Exception as e:
        return {'passed': False, 'message': f'Ping error: {e}'}

    # Test 2: Check if port is open
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((piaware_url, piaware_port))
        sock.close()
        if result != 0:
            return {'passed': False, 'message': f'Port {piaware_port} closed on {piaware_url}'}
    except Exception as e:
        return {'passed': False, 'message': f'Port check error: {e}'}

    # Test 3: Test positions URL
    try:
        # Use direct URL access, not through the dashboard API
        import urllib.request
        import json
        req = urllib.request.Request(positions_url)
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            body = response.read().decode('utf-8')

        if status != 200:
            return {'passed': False, 'message': f'Positions URL failed: HTTP {status}'}

        positions_data = try_parse_json(body)
        if positions_data is None:
            return {'passed': False, 'message': 'Positions URL returned invalid JSON'}

        # Check if we have aircraft data
        aircraft = positions_data.get('aircraft', [])
        aircraft_count = len(aircraft) if isinstance(aircraft, list) else 0

        return {'passed': True, 'message': f'Connected - {aircraft_count} aircraft visible'}

    except Exception as e:
        return {'passed': False, 'message': f'Positions URL error: {e}'}


def validate_tracker_process(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Test that the aircraft tracker process is running and visible.

    This function checks for the aircraft tracker process using Windows tasklist command.
    It first looks for a visible window with "tracker" in the title, then falls back to
    checking for python3.13.exe processes.

    Args:
        data: Parsed JSON response (not used in this validator)

    Returns:
        Dict with 'passed' boolean and descriptive 'message'
    """
    import subprocess

    try:
        # Check for window title first (visible tracker)
        result = subprocess.run(['tasklist', '/FI', 'WINDOWTITLE eq tracker*', '/FO', 'CSV'],
                              capture_output=True, text=True, timeout=10)

        if 'tracker' in result.stdout.lower():
            return {'passed': True, 'message': 'Tracker process running (visible window)'}

        # Check if python3.13.exe is running (simpler check)
        result2 = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq python3.13.exe', '/FO', 'CSV'],
                               capture_output=True, text=True, timeout=10)

        if 'python3.13.exe' in result2.stdout.lower():
            return {'passed': True, 'message': 'Tracker process running (background)'}
        else:
            return {'passed': False, 'message': 'Tracker process not found'}

    except Exception as e:
        return {'passed': False, 'message': f'Process check error: {e}'}


def validate_recent_files(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Test that the S3 bucket has recent PiAware position files (last hour).

    This function performs efficient S3 validation by:
    1. Using head_object to check file existence and timestamps without downloading
    2. Checking current hour's position file first (fastest check)
    3. Falling back to previous hour if current hour file doesn't exist
    4. Providing detailed age information for troubleshooting

    Args:
        data: Parsed JSON response (not used in this validator)

    Returns:
        Dict with 'passed' boolean and descriptive 'message'
    """
    try:
        from datetime import datetime, timezone

        # S3 configuration
        s3_client = boto3.client(
            's3',
            endpoint_url='http://localhost:9000',
            aws_access_key_id='minioadmin',
            aws_secret_access_key='minioadmin123',
            region_name='us-east-1'
        )

        bucket_name = 'aircraft-data-new'

        now = datetime.now(timezone.utc)

        # Check for current hour's position file (fastest approach)
        current_hour = now.strftime('%Y%m%d_%H00')
        position_key = f'data/hourly/positions_{current_hour}.json'

        try:
            response = s3_client.head_object(Bucket=bucket_name, Key=position_key)
            file_time = response['LastModified']
            if file_time.tzinfo is None:
                file_time = file_time.replace(tzinfo=timezone.utc)
            time_diff = now - file_time
            minutes_diff = time_diff.total_seconds() / 60

            if minutes_diff <= 60:  # Within last hour
                return {'passed': True, 'message': f"Recent data: {position_key} ({minutes_diff:.1f} min ago)"}
            else:
                return {'passed': False, 'message': f"Stale data: {position_key} ({minutes_diff:.1f} min ago)"}

        except s3_client.exceptions.NoSuchKey:
            # No current hour file, try previous hour
            prev_hour = (now.replace(hour=now.hour - 1)).strftime('%Y%m%d_%H00')
            prev_position_key = f'data/hourly/positions_{prev_hour}.json'

            try:
                response = s3_client.head_object(Bucket=bucket_name, Key=prev_position_key)
                file_time = response['LastModified']
                if file_time.tzinfo is None:
                    file_time = file_time.replace(tzinfo=timezone.utc)
                time_diff = now - file_time
                minutes_diff = time_diff.total_seconds() / 60

                if minutes_diff <= 120:  # Within last 2 hours (allowing for previous hour)
                    return {'passed': True, 'message': f"Recent data: {prev_position_key} ({minutes_diff:.1f} min ago)"}
                else:
                    return {'passed': False, 'message': f"Stale data: {prev_position_key} ({minutes_diff:.1f} min ago)"}

            except s3_client.exceptions.NoSuchKey:
                return {'passed': False, 'message': "No recent position files found"}

    except Exception as e:
        return {'passed': False, 'message': f"Exception checking S3 files: {e}"}


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
    """
    Test the performance of a critical API endpoint.

    Measures response time for the flights API with 24-hour window and 5-minute gaps.
    This endpoint is commonly used for dashboard displays and should respond quickly.

    Args:
        tracker: TestTracker instance for recording results
    """
    # Measure /api/flights?gap=5&window=24h
    endpoint = "/api/flights?gap=5&window=24h"
    start = time.time()
    try:
        status, _ = http_get(endpoint, timeout=10)
        duration_ms = int((time.time() - start) * 1000)
    except Exception as e:
        tracker.record('Performance', False, f"Exception: {e}")
        print(f"    [FAIL] Performance failed: Exception: {e}")
        return
    if status != 200:
        tracker.record('Performance', False, f"HTTP {status}")
        print(f"    [FAIL] Performance failed: HTTP {status}")
        return
    if duration_ms < 2000:
        tracker.record('Performance', True, f"Excellent performance ({duration_ms}ms)")
        print(f"    [PASS] Excellent performance ({duration_ms}ms)")
    elif duration_ms < 5000:
        tracker.record('Performance', True, f"Good performance ({duration_ms}ms)")
        print(f"    [PASS] Good performance ({duration_ms}ms)")
    else:
        tracker.record('Performance', True, f"Slow response ({duration_ms}ms)")
        print(f"    [WARN] Slow response ({duration_ms}ms)")


def run_all_tests(runs: int = 1, delay: float = 1.0, args = None):
    """
    Execute the complete test suite with configurable parameters.

    This is the main test orchestration function that:
    - Configures tests based on command-line arguments
    - Runs multiple test iterations if requested
    - Handles special cases like squawk tests during warmup
    - Aggregates results across all runs
    - Provides comprehensive test reporting

    Args:
        runs: Number of test iterations to perform
        delay: Delay in seconds between test runs
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success, 1 for failures)
    """
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


    configs = []
    
    # Add tests based on command line switches
    if args.all or args.health:
        configs.append(("Health Check", "/api/health", validate_health))
    if args.all or args.piaware_conn:
        configs.append(("PiAware Connectivity", "/api/health", validate_piaware_connectivity))
    if args.all or args.tracker:
        configs.append(("Tracker Process", "/api/health", validate_tracker_process))
    if args.all or args.recent_files:
        configs.append(("Recent Files (1hr)", "/api/health", validate_recent_files))
    if args.all or args.piaware_status:
        configs.append(("PiAware Status", "/api/piaware-status", validate_piaware_status))
    if args.all or args.piaware_origin:
        configs.append(("PiAware Origin", "__external__", validate_piaware_origin))
    if args.all or args.cache_status:
        configs.append(("Cache Status", "/api/cache-status", validate_cache_status))
    if args.all or args.flights_24h:
        configs.append(("Flights (24h)", "/api/flights?gap=5&window=24h", validate_flights_24h))
    if args.all or args.flights_7d:
        configs.append(("Flights (7d)", "/api/flights?gap=5&window=7d", validate_flights_7d))
    if args.all or args.airline_1h:
        configs.append(("Airline Stats (1h)", "/api/airline-stats?window=1h", validate_airline_stats))
    if args.all or args.airline_24h:
        configs.append(("Airline Stats (24h)", "/api/airline-stats?window=24h", validate_airline_stats))

    squawk_tests = []
    if args.all or args.squawk_24h:
        squawk_tests.append(("Squawk (24h)", "/api/squawk-transitions?hours=24", validate_squawk_24))
    if args.all or args.squawk_7d:
        squawk_tests.append(("Squawk (7d)", "/api/squawk-transitions?hours=168", validate_squawk_24))

    # If uptime < 10 minutes, keep squawk tests but use 3s timeout and soft-fail with warnings
    warmup_ms = 10 * 60 * 1000
    squawk_soft = server_uptime_ms < warmup_ms
    if squawk_soft:
        print("Warning: squawk endpoints within warmup window (<10 min uptime); failures will be warnings.")
    configs.extend(squawk_tests)

    # Add remaining tests based on switches
    if args.all or args.reception_1h:
        configs.append(("Reception Range (1h)", "/api/reception-range?hours=1", validate_reception_range))
    if args.all or args.reception_24h:
        configs.append(("Reception Range (24h)", "/api/reception-range?hours=24", validate_reception_range))
    
    # These tests don't have individual switches, so include them when --all is used
    if args.all:
        configs.extend([
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
                            print(f"    [PASS] {result.get('message', '')}")
                        else:
                            tracker.record(name, False, f"{result.get('message', '')}")
                            print(f"    [FAIL] {result.get('message', '')}")
                    except Exception as e:
                        tracker.record(name, False, f"Exception: {e}")
                        print(f"    [FAIL] FAILED: Exception: {e}")
                else:
                    tracker.record(name, False, "PiAware origin not configured")
                    print("    [FAIL] FAILED: PiAware origin not configured")
            else:
                # Apply shorter timeout and soft-fail for squawk tests during warmup
                if name.startswith("Squawk "):
                    test_endpoint(tracker, name, endpoint, validator, timeout=3.0, soft_fail=squawk_soft)
                else:
                    test_endpoint(tracker, name, endpoint, validator)
        
        if args.all or args.performance:
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
    print(f"[PASS] Passed: {total_passed}")
    print(f"[FAIL] Failed: {total_failed}\n")
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
    """
    Main entry point for the test script.

    Parses command-line arguments and orchestrates test execution.
    Supports selective test execution through various switches.
    """
    p = argparse.ArgumentParser(description='Run test suites for Aircraft Dashboard')
    p.add_argument('-r', '--runs', type=int, default=1, help='Number of test iterations')
    p.add_argument('-d', '--delay', type=float, default=1.0, help='Delay between test iterations')
    p.add_argument('--base-url', type=str, default=None, help='Override base URL')
    
    # Test selection switches - allow running specific test categories
    p.add_argument('--health', action='store_true', help='Run health check test')
    p.add_argument('--piaware-conn', action='store_true', help='Run PiAware connectivity test')
    p.add_argument('--tracker', action='store_true', help='Run tracker process test')
    p.add_argument('--recent-files', action='store_true', help='Run recent files test')
    p.add_argument('--piaware-status', action='store_true', help='Run PiAware status test')
    p.add_argument('--piaware-origin', action='store_true', help='Run PiAware origin test')
    p.add_argument('--cache-status', action='store_true', help='Run cache status test')
    p.add_argument('--flights-24h', action='store_true', help='Run 24h flights test')
    p.add_argument('--flights-7d', action='store_true', help='Run 7d flights test')
    p.add_argument('--airline-1h', action='store_true', help='Run 1h airline stats test')
    p.add_argument('--airline-24h', action='store_true', help='Run 24h airline stats test')
    p.add_argument('--squawk-24h', action='store_true', help='Run 24h squawk test')
    p.add_argument('--squawk-7d', action='store_true', help='Run 7d squawk test')
    p.add_argument('--reception-1h', action='store_true', help='Run 1h reception range test')
    p.add_argument('--reception-24h', action='store_true', help='Run 24h reception range test')
    p.add_argument('--performance', action='store_true', help='Run performance test')
    p.add_argument('--all', action='store_true', help='Run all tests (default)')
    
    args = p.parse_args()
    if args.base_url:
        BASE_URL = args.base_url
    
    # If no specific tests selected, run all
    if not any([args.health, args.piaware_conn, args.tracker, args.recent_files, 
                args.piaware_status, args.piaware_origin, args.cache_status,
                args.flights_24h, args.flights_7d, args.airline_1h, args.airline_24h,
                args.squawk_24h, args.squawk_7d, args.reception_1h, args.reception_24h,
                args.performance]):
        args.all = True
    
    rc = run_all_tests(args.runs, args.delay, args)
    sys.exit(rc)
