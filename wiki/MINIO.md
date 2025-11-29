# MinIO (S3) Setup

This document consolidates `MINIO_SETUP.md` guidance into the wiki. See the repository `MINIO_SETUP.md` for the same instructions.

Quick Docker start (recommended)
```bash
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  -v minio_data:/data \
  minio/minio:latest \
  server /data --console-address ":9001"
```

Create buckets
- The Node server will auto-create `aircraft-data` and `aircraft-data-new`.
- The Python tracker will auto-create tracker-specific buckets such as `output-kmls`, `flighturls`, `piaware-reception-data`, and `icao-hex-cache`.

Recommended buckets
- `aircraft-data` (historical)
- `aircraft-data-new` (write)
- `output-kmls`
- `flighturls`
- `piaware-reception-data`
- `icao-hex-cache`

Secure production notes
- Change default MinIO credentials immediately
- Use TLS for MinIO in production
- Use firewall rules to restrict access to MinIO

Troubleshooting
- If the dashboard fails to upload, check `/api/config` and server logs for S3 errors
- Use `mc` (MinIO client) to inspect buckets and objects

See `MINIO_SETUP.md` in root for full step-by-step instructions.