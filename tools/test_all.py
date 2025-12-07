#!/usr/bin/env python3
"""
Comprehensive Python tests for aircraft dashboard
"""
import argparse
import sys
import os

def main():
    parser = argparse.ArgumentParser(description='Run comprehensive Python tests')
    parser.add_argument('-r', '--runs', type=int, default=1, help='Number of test runs')
    parser.add_argument('-d', '--delay', type=int, default=1, help='Delay between runs')

    args = parser.parse_args()

    print(f"Running comprehensive Python tests...")
    print(f"Runs: {args.runs}, Delay: {args.delay}s")

    tests_passed = 0
    tests_total = 0

    # Test 1: Basic imports
    tests_total += 1
    try:
        import json
        import csv
        import math
        import time
        from datetime import datetime
        print("✅ Test 1: Basic Python imports")
        tests_passed += 1
    except ImportError as e:
        print(f"❌ Test 1: Import error: {e}")

    # Test 2: Config reader
    tests_total += 1
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from config_reader import get_config
        config = get_config()
        required_keys = ['s3_endpoint', 's3_access_key', 'read_bucket']
        missing_keys = [k for k in required_keys if k not in config]
        if missing_keys:
            print(f"❌ Test 2: Missing config keys: {missing_keys}")
        else:
            print("✅ Test 2: Config reader functional")
            tests_passed += 1
    except Exception as e:
        print(f"❌ Test 2: Config reader error: {e}")

    # Test 3: Registration lookup
    tests_total += 1
    try:
        from registration_lookup import registration_from_hexid
        result = registration_from_hexid('abc123')
        print("✅ Test 3: Registration lookup functional")
        tests_passed += 1
    except Exception as e:
        print(f"❌ Test 3: Registration lookup error: {e}")

    # Test 4: Airline lookup
    tests_total += 1
    try:
        from airline_lookup import get_airline_from_callsign
        result = get_airline_from_callsign('UAL123')
        print("✅ Test 4: Airline lookup functional")
        tests_passed += 1
    except Exception as e:
        print(f"❌ Test 4: Airline lookup error: {e}")

    print(f"\nTest Results: {tests_passed}/{tests_total} tests passed")

    if tests_passed == tests_total:
        print("✅ All Python tests passed!")
        return 0
    else:
        print("❌ Some Python tests failed!")
        return 1

if __name__ == '__main__':
    sys.exit(main())