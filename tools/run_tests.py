#!/usr/bin/env python3
"""
AirSquawk - Comprehensive Test Suite (Python runner)
Adds direct PiAware origin checking in addition to Node API checks.
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from typing import List, Dict, Tuple, Callable, Any

try:
    import requests
except Exception:
    print("ERROR: Python dependency 'requests' is required. Install with: pip install requests")
    sys.exit(2)

BASE_URL = os.environ.get('DASHBOARD_URL', 'http://localhost:3002')


def get_piaware_origin_url() -> str:
    url = os.environ.get('PIAWARE_URL')
    if url:
        return url
    try:
        with open('config.js', 'r', encoding='utf8') as f:
            content = f.read()
            m = re.search(r"piAwareUrl:\s*process\.env\.PIAWARE_URL\s*\|\|\s*'([^']+)'", content)
            if m:
                full_url = m.group(1)
                from urllib.parse import urlparse
                parsed_url = urlparse(full_url)
                return f"{parsed_url.scheme}://{parsed_url.netloc}"
    except Exception:
        pass
    return None


class TestResult:
    def __init__(self, name: str, passed: bool, message: str, duration: float):
        self.name = name
        self.passed = passed
        self.message = message
        self.duration = duration


def test_endpoint(name: str, endpoint: str, validator: Callable[[Any], Dict[str, Any]]) -> TestResult:
    start = time.time()
    try:
        if endpoint == '__external__':
            url = get_piaware_origin_url()
            if not url:
                return TestResult(name, False, 'PiAware origin URL not configured', 0)
            r = requests.get(url, timeout=10)
        else:
            r = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
        duration = (time.time() - start) * 1000
        if r.status_code != 200:
            return TestResult(name, False, f'HTTP {r.status_code}: {r.text[:500]}', duration)
        data = None
        try:
            data = r.json()
        except Exception:
            data = r.text
        result = validator(data)
        return TestResult(name, result.get('passed', False), result.get('message', ''), duration)
    except Exception as e:
        return TestResult(name, False, f'Exception: {e}', 0)


def health_check_validator(data: dict) -> Dict[str, Any]:
    return {'passed': data.get('status') == 'ok', 'message': f"{data.get('status', 'error')}, cache ready: {data.get('positionCacheReady', False)}"}


def piaware_status_validator(data: dict) -> Dict[str, Any]:
    status = data.get('status', '') if isinstance(data, dict) else ''
    if status in ('connected', 'ok'):
        aircraft = data.get('aircraft', data.get('aircraft_count', 0))
        if isinstance(aircraft, list):
            count = len(aircraft)
        elif isinstance(aircraft, dict):
            count = len(aircraft.get('aircraft', []))
        else:
            count = int(aircraft)
        return {'passed': True, 'message': f"Connected ({count} aircraft)"}
    return {'passed': False, 'message': f'PiAware status: {status}'}


def piaware_origin_validator(data: Any) -> Dict[str, Any]:
    if isinstance(data, dict):
        ac_count = data.get('aircraft', None)
        if ac_count is not None:
            if isinstance(ac_count, list):
                return {'passed': True, 'message': f'Origin OK: {len(ac_count)} aircraft'}
            return {'passed': True, 'message': f'Origin OK: {ac_count} aircraft'}
    return {'passed': True, 'message': 'Origin OK: HTTP 200 (non-JSON)'}


def cache_status_validator(data: dict) -> Dict[str, Any]:
    try:
        pos_cache = data.get('positionCache', {})
        aircraft_count = len(pos_cache.get('data', {}))
    except Exception:
        aircraft_count = 0
    return {'passed': True, 'message': f"{aircraft_count} aircraft cached"}


def reception_range_validator(data: dict) -> Dict[str, Any]:
    sectors = data.get('sectors', {})
    return {'passed': True, 'message': f"{len(sectors)} sectors"}


def run_tests(runs: int = 2, delay: float = 1.0) -> int:
    print('\n' + '='*50)
    print('AirSquawk - Test Suite Runner')
    print('='*50)
    print(f'Running {runs} test iterations\n')

    test_configs: List[Tuple[str, str, Callable]] = [
        ('Health Check', '/api/health', health_check_validator),
        ('PiAware Status', '/api/piaware-status', piaware_status_validator),
        ('PiAware Origin', '__external__', piaware_origin_validator),
        ('Cache Status', '/api/cache-status', cache_status_validator),
        ('Reception Range', '/api/reception-range?hours=24', reception_range_validator),
    ]

    all_results: List[TestResult] = []
    for run_num in range(1, runs + 1):
        print(f'========== TEST RUN {run_num} ==========', flush=True)
        run_results: List[TestResult] = []
        for name, endpoint, validator in test_configs:
            result = test_endpoint(name, endpoint, validator)
            run_results.append(result)
            status = 'PASS' if result.passed else 'FAIL'
            print(f'  [{status}] {result.name}: {result.message} ({result.duration:.0f}ms)')
        all_results.extend(run_results)
        passed = sum(1 for r in run_results if r.passed)
        failed = len(run_results) - passed
        print(f'\n  Run Summary: {passed} passed, {failed} failed\n')
        if run_num < runs:
            time.sleep(delay)

    total_tests = len(all_results)
    total_passed = sum(1 for r in all_results if r.passed)
    total_failed = total_tests - total_passed
    print('\n' + '='*50)
    print('OVERALL TEST RESULTS')
    print('='*50)
    print(f'Total Tests Run: {total_tests}')
    print(f'Passed: {total_passed}')
    print(f'Failed: {total_failed}')
    print('')
    if total_failed == 0:
        print('[SUCCESS] ALL TESTS PASSED')
        return 0
    else:
        print(f'[WARNING] {total_failed} test(s) failed')
        for r in all_results:
            if not r.passed:
                print(f'  • {r.name}: {r.message}')
        return 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-r', '--runs', type=int, default=2)
    parser.add_argument('-d', '--delay', type=float, default=1.0)
    args = parser.parse_args()
    rc = run_tests(args.runs, args.delay)
    sys.exit(rc)
