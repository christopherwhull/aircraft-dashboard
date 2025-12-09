# Configuration Management

## Overview

All configuration is centralized in `config.json`. Both Node.js and Python scripts read from this single source of truth.

## Configuration File

**Location:** `config.json`

Contains:
- Server settings (port, log files)
- Data source (PiAware URL)
- S3/MinIO connection details
- Bucket names
- Time windows and retention policies
- Background job intervals
- UI defaults

## Environment Variables

All settings can be overridden via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3002 | Server port |
| `PIAWARE_URL` | http://192.168.0.161:8080/data/aircraft.json | PiAware data source |
| `S3_ENDPOINT` | http://localhost:9000 | MinIO/S3 endpoint |
| `S3_REGION` | us-east-1 | S3 region |
| `S3_ACCESS_KEY` | minioadmin | S3 access key |
| `S3_SECRET_KEY` | minioadmin123 | S3 secret key |
| `READ_BUCKET` | aircraft-data | Historical data bucket |
| `WRITE_BUCKET` | aircraft-data-new | Current data bucket |

## Environment Variable Mapping (quick reference)

Below is a short mapping of environment variables to the `config.json` keys. These are the most commonly configured values when running the server in a container or CI environment.

| Environment Variable | config.json key | Default |
|---|---|---|
| `PORT` | `server.port` | `3002` |
| `LOG_FILE` | `server.logFile` | `runtime/server.log` |
| `LOG_LEVEL` | `logging.level` | `info` |
| `LOG_FORMAT` | `logging.format` | `w3c` |
| `PIAWARE_URL` | `dataSource.piAwareUrl` | `http://192.168.0.161:8080/data/aircraft.json` |
| `S3_ENDPOINT` | `s3.endpoint` | `http://localhost:9000` |
| `S3_REGION` | `s3.region` | `us-east-1` |
| `S3_ACCESS_KEY` | `s3.credentials.accessKeyId` | `minioadmin` |
| `S3_SECRET_KEY` | `s3.credentials.secretAccessKey` | `minioadmin123` |
| `READ_BUCKET` | `buckets.readBucket` | `aircraft-data` |
| `WRITE_BUCKET` | `buckets.writeBucket` | `aircraft-data-new` |
| `STATE_FILE` | `state.stateFile` | `runtime/dashboard-state.json` |
| `LAST_DAILY_FILE` | `state.lastDailyFlightBuildFile` | `runtime/.last-daily-flight-build` |

For a complete list of available configuration keys, see `config.json`. The table above contains the most frequently changed items for development and production setups.

## Python Scripts Configuration

Python scripts use `config_reader.py` to read values from `config.json`:

```python
from config_reader import get_config

config = get_config()
S3_ENDPOINT = config['s3_endpoint']
ACCESS_KEY = config['s3_access_key']
SECRET_KEY = config['s3_secret_key']
BUCKET_NAME = config['write_bucket']
```

### Updated Python Scripts

The following scripts now read from `config.json`:
- `count_squawk_transitions_by_hour.py`
- `count_squawk_1200.py`
- `count_squawk_7days.py`
- `count_squawk_7days_detailed.py`

### Testing Configuration Reader

Test that config values are being read correctly:

```bash
python config_reader.py
```

Output shows all configuration values (secrets are masked with asterisks).

## Security Best Practices

1. **Development:** Use default values in `config.json`
2. **Production:** Override via environment variables
3. **Never commit:** Production credentials to version control
4. **Use .env files:** For local environment-specific overrides (add to .gitignore)

## Default Credentials

The default MinIO credentials (`minioadmin` / `minioadmin123`) are:
- Standard for local MinIO installations
- Fine for development environments
- **MUST be changed for production**

## Changing Configuration

1. **For all environments:** Edit `config.json`
2. **For specific environment:** Set environment variables
3. **Restart required:** Changes require server/script restart

## Example: Production Setup

Create `.env` file (not committed):
```bash
S3_ACCESS_KEY=production_key
S3_SECRET_KEY=production_secret
S3_ENDPOINT=https://s3.amazonaws.com
READ_BUCKET=prod-aircraft-data
WRITE_BUCKET=prod-aircraft-data-new
```

Load environment variables before starting:
```bash
# Linux/Mac
export $(cat .env | xargs)
node server.js

# Windows PowerShell
Get-Content .env | ForEach-Object { $_ -split '=' | Set-Item -Path Env:$($_[0]) -Value $_[1] }
node server.js
```

### Additional Examples: `.env` file and PowerShell

Example `.env` file (Linux/macOS and most container setups):
```bash
PORT=3002
PIAWARE_URL=http://piaware.local:8080/data/aircraft.json
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
READ_BUCKET=aircraft-data
WRITE_BUCKET=aircraft-data-new
LOG_LEVEL=info
```

Load `.env` in your current shell (Linux/Mac):
```bash
export $(cat .env | xargs)
node server.js
```

Windows PowerShell (session-locally set env vars):
```powershell
$env:PORT=3002
$env:PIAWARE_URL='http://piaware.local:8080/data/aircraft.json'
$env:S3_ENDPOINT='http://localhost:9000'
$env:S3_ACCESS_KEY='minioadmin'
$env:S3_SECRET_KEY='minioadmin123'
node server.js
```

Notes:
- Environment variables have top priority — they override `config.json` values.
- Use `.env` only for development; never commit production secrets.
- In CI or production, inject secrets via your CI or secret management system instead of committing them.

## Configuration Priority

1. Environment variables (highest priority)
2. `config.json` defaults
3. Hardcoded fallbacks (lowest priority)
