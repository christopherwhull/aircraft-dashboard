# Configuration

The project centralizes configuration in `config.js`. Python utilities use `config_reader.py` to read the same settings.

Primary places to configure settings:
- `config.js` (defaults checked into repo)
- Environment variables (override `config.js`)
- Systemd `EnvironmentFile` or Docker compose environment entries

Key configuration items
- `server.port` – HTTP port (default: 3002)
- `dataSource.piAwareUrl` – PiAware JSON endpoint
- `s3.endpoint` – MinIO/S3 endpoint
- `s3.credentials.accessKeyId` / `s3.credentials.secretAccessKey`
- `buckets.readBucket` / `buckets.writeBucket`

Example environment variables (pwsh / bash)
```bash
# bash
export PORT=3002
export PIAWARE_URL="http://192.168.0.178:8080/data/aircraft.json"
export S3_ENDPOINT="http://localhost:9000"
export S3_ACCESS_KEY=minioadmin
export S3_SECRET_KEY=minioadmin123
```

Python scripts
- Python scripts call `config_reader.py` which loads values from `config.js` and respects environment overrides.

Best practices
- Keep sensitive credentials out of repo; set environment variables or use a secrets manager
- Use a dedicated MinIO user and strong passwords in production
- Use `READ_BUCKET`/`WRITE_BUCKET` env vars to target separate buckets for historical vs live writes

Files to check
- `config.js`
- `config_reader.py` (Python integration)
- Service files (systemd) or Docker compose env sections