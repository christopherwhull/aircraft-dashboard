# API Reference

This page lists high-level API endpoints provided by the Node server. Use the web UI or call them directly.

Common endpoints
- `GET /api/config` - Returns UI configuration and server settings
- `GET /api/position-timeseries-live` - Live time series (supports `startTime` and `endTime` query params)
- `GET /api/airline-stats` - Airline statistics and drill-down
- `GET /api/flights` - Flight records (query params: `start`, `end`, `airline`)
- `GET /api/squawk-transitions` - Squawk code transition history
- `GET /api/heatmap-data` - Heatmap grid for geographic density
- `GET /api/reception-range` - Reception range analysis by bearing/altitude
- `GET /api/cache-status` - Position cache and S3 read stats

Usage examples
```bash
# Get UI config
curl http://localhost:3002/api/config

# Get positions for last hour (ISO timestamps)
curl "http://localhost:3002/api/position-timeseries-live?startTime=2025-11-28T12:00:00Z&endTime=2025-11-28T13:00:00Z"
```

Notes
- Endpoints may support additional query parameters for paging and resolution
- For large ranges, use S3-backed endpoints instead of live in-memory requests
- See `lib/api-routes.js` for implementation details and parameter names