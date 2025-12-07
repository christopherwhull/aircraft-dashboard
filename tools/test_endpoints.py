#!/usr/bin/env python3
"""
Python endpoint tests for aircraft dashboard API
"""
import sys
import os
import json
import time

def test_api_endpoint(url, expected_status=200, timeout=10):
    """Test an API endpoint"""
    try:
        import requests
        response = requests.get(url, timeout=timeout)
        if response.status_code == expected_status:
            print(f"✅ {url} - Status: {response.status_code}")
            return True
        else:
            print(f"❌ {url} - Expected {expected_status}, got {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ {url} - Request failed: {e}")
        return False
    except ImportError:
        print("❌ requests module not available, skipping endpoint tests")
        return False

def main():
    print("Running Python endpoint tests...")

    # Assume server is running on default port (check config)
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from config_reader import get_config
        config = get_config()
        server_port = config.get('server', {}).get('mainPort', 3000)
        server_host = config.get('server', {}).get('host', 'localhost')
    except:
        server_port = 3000
        server_host = 'localhost'

    base_url = f"http://{server_host}:{server_port}"

    tests_passed = 0
    tests_total = 0

    # Test 1: Health endpoint
    tests_total += 1
    if test_api_endpoint(f"{base_url}/api/health"):
        tests_passed += 1

    # Test 2: Server status endpoint
    tests_total += 1
    if test_api_endpoint(f"{base_url}/api/server-status"):
        tests_passed += 1

    # Test 3: Cache status endpoint
    tests_total += 1
    if test_api_endpoint(f"{base_url}/api/cache-status"):
        tests_passed += 1

    # Test 4: Heatmap endpoint (may take time to load)
    tests_total += 1
    if test_api_endpoint(f"{base_url}/api/heatmap?window=1h", timeout=30):
        tests_passed += 1

    # Test 5: Flights endpoint
    tests_total += 1
    if test_api_endpoint(f"{base_url}/api/flights"):
        tests_passed += 1

    print(f"\nEndpoint Test Results: {tests_passed}/{tests_total} tests passed")

    if tests_passed == tests_total:
        print("✅ All Python endpoint tests passed!")
        return 0
    else:
        print("❌ Some Python endpoint tests failed!")
        return 1

if __name__ == '__main__':
    sys.exit(main())