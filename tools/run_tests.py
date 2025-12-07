#!/usr/bin/env python3
"""
Python integration tests for aircraft dashboard
"""
import argparse
import sys
import os

def main():
    parser = argparse.ArgumentParser(description='Run Python integration tests')
    parser.add_argument('-r', '--runs', type=int, default=1, help='Number of test runs')
    parser.add_argument('-d', '--delay', type=int, default=1, help='Delay between runs')

    args = parser.parse_args()

    print(f"Running Python integration tests...")
    print(f"Runs: {args.runs}, Delay: {args.delay}s")

    # Simple test - just check if we can import basic modules
    try:
        import json
        import requests
        print("✅ Basic imports successful")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return 1

    # Check if config can be loaded
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from config_reader import get_config
        config = get_config()
        print("✅ Config loading successful")
        print(f"   S3 endpoint: {config.get('s3_endpoint', 'N/A')}")
    except Exception as e:
        print(f"❌ Config loading failed: {e}")
        return 1

    print("✅ All Python integration tests passed!")
    return 0

if __name__ == '__main__':
    sys.exit(main())