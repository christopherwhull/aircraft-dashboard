# AI Helper (GitHub Copilot – GPT-5)

Use the AI to accelerate development while keeping changes safe and reviewable.

## How to Ask
- Be specific: goal, files, APIs, acceptance criteria.
- Prefer small patches; request a plan for multi-step work.
- Ask the AI to run tests and share results.

## Handy Commands (PowerShell)
```powershell
npm start
npm test
python tools/test-all.py
python tools/test_s3_structure.py --dates-only
python tools/test_s3_structure.py --gaps-only
```

### Test Script (`tools/test-all.py`)

The comprehensive test suite for the Aircraft Dashboard system. This script validates all critical components including health endpoints, data integrity, S3 connectivity, and cross-platform process monitoring.

#### Key Features:
- **Selective Test Execution**: Use command-line switches to run specific test categories
- **Fast S3 Validation**: Uses `head_object` for efficient file age checking without full downloads
- **Cross-Platform Support**: Detects processes on both Windows (tasklist) and Linux (ps)
- **Comprehensive Coverage**: Tests health endpoints, data consistency, tracker processes, and recent file availability

#### Usage Examples:
```bash
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
```

#### Test Categories:
- `--health`: Validates dashboard health endpoints and API responses
- `--piaware-conn`: Tests PiAware connectivity and data flow
- `--tracker`: Verifies aircraft tracker process is running
- `--recent-files`: Checks S3 bucket for recent position files (last hour)
- `--piaware-status`: Validates PiAware data file availability
- `--piaware-origin`: Tests direct connection to PiAware origin server
- `--cache-status`: Verifies position cache and S3 operation statistics
- `--flights-24h`/`--flights-7d`: Tests flight data endpoints
- `--airline-1h`/`--airline-24h`: Validates airline statistics
- `--squawk-24h`/`--squawk-7d`: Tests squawk code transition data
- `--reception-1h`/`--reception-24h`: Validates reception range data
- `--performance`: Measures response times for critical endpoints

#### Configuration:
The script uses configuration from `config.js` for S3 endpoints, bucket names, and API endpoints. Ensure proper configuration before running tests.

#### Exit Codes:
- `0`: All tests passed
- `1`: One or more tests failed
- `2`: Configuration or environment error

#### Key Functions:
- `validate_recent_files()`: Uses S3 head_object for fast file age checking
- `validate_piaware_connectivity()`: Performs ping, port check, and data validation
- `validate_tracker_process()`: Cross-platform process detection
- `performance_test()`: Measures API response times

### Related Files:
- `tools/test-all.js`: Node.js wrapper for the Python test script
- `tools/test-all.ps1`: PowerShell script for Windows automation
- `update-and-restart.py`: Uses test script for pre-deployment validation

### Aviation Charts & Tile Proxy

Start and pre-cache aviation chart tiles for offline or low-latency use:

```powershell
# Start the local tile proxy (listens on port 3003)
npm run proxy:tiles

# Pre-cache tiles (proxy must be running in a separate terminal)
npm run precache:tiles
```

If chart tiles show as blank or grey:
- Confirm the proxy is running and reachable at `http://localhost:3003`.
- Inspect `tile_cache/` for cached files and check their timestamps.
- Review `AVIATION_CHARTS_WIKI.md` for deeper debugging steps.

## Patterns
- Endpoint fixes: specify route, input/output, and a sample curl.
- Data checks: point to buckets, prefixes, and time windows.
- Releases: request version bump, CHANGELOG update, commit/tag/push.

See `docs/AI_HELPER.md` for the full guide.
