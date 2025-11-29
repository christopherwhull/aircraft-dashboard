# Troubleshooting

Common issues and how to resolve them.

1. "Cannot connect to PiAware"
- Verify `PIAWARE_URL` in `config.js` or environment variables
- Test: `curl http://your-piaware:8080/data/aircraft.json`
- Ensure network connectivity between server and PiAware

2. "S3/MinIO connection failed"
- Ensure MinIO is running and reachable: `curl http://localhost:9000`
- Check credentials in `config.js` or environment variables
- Check server logs for specific S3 errors (403 = auth, 404 = bucket missing)

3. "No data in dashboard"
- Wait 1-2 minutes for initial data collection and cache population
- Check background jobs: `buildFlightsFromS3`, `buildHourlyPositionsFromS3` logs
- Confirm MinIO buckets contain minute files

4. "Permission denied creating buckets"
- Ensure S3 credentials used by the server have create permissions
- For MinIO, the root user (MINIO_ROOT_USER/ROOT_PASSWORD) has full permissions

5. "MinIO port conflict or won't start"
- Check which process is using port 9000: `sudo lsof -i :9000` (Linux) or `netstat -ano | findstr :9000` (Windows)

6. "High memory usage"
- The position cache holds up to 7 days; tune `positionRetentionMs` in `config.js` and memory limits
- Use systemd Resource limits in `aircraft-dashboard.service`

7. "Flights missing type"
- Confirm `aircraft_type` is present in minute S3 files
- Use `check_s3_types.js` diagnostic to test type presence

If you need help, open an issue with logs and `/api/config` output to speed diagnosis.