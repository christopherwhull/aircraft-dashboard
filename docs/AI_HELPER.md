# AI Helper Guide (GitHub Copilot – GPT-5)

This project uses GitHub Copilot (GPT-5) as a coding assistant inside VS Code. Use this guide to collaborate efficiently with the AI on development, testing, and maintenance tasks.

## Principles
- Be specific: state the goal, constraints, file paths, and acceptance criteria.
- Prefer incremental changes: small PR-sized edits are easier to review.
- Ask for plans when tasks are multi-step; otherwise, keep requests short and direct.
- Let the AI run tests where possible; it will report results and next steps.
- The AI follows repository style, avoids unrelated refactors, and updates docs when changing behavior.

## Common Requests
- "Fix bug X in `lib/api-routes.js` and add a regression test."
- "Create a script to validate S3 data freshness and gaps over 1h."
- "Refactor `tools/test_s3_structure.py` to add a `--gaps-only` mode."
- "Bump version to 2.0.0, update CHANGELOG, and tag/push."

## Tools & Conventions
- Editor: VS Code, Windows environment, default shell `pwsh.exe`.
- File edits: AI uses patch-based edits and keeps changes minimal.
- Testing philosophy: target the changed area first, then broaden.
- Git hygiene: atomic commits with descriptive messages; tags for releases.

## Useful Commands

Configuration:
```powershell
# Interactive config menu (no JS editing required)
python tools/config_helper.py

# List all settings
python tools/config_helper.py --list

# Get a specific setting
python tools/config_helper.py --get piaware_url

# Set a specific setting
python tools/config_helper.py --set piaware_url=http://192.168.1.100:8080
```

Server & tests:
```powershell
# Start server
npm start

# Run all JS tests
npm test

# Run Python test suite (integration & S3 diagnostics)
python tools/test_all.py

# S3 structure/dates/gaps checks (UTC output)
python tools/test_s3_structure.py --structure-only
python tools/test_s3_structure.py --dates-only
python tools/test_s3_structure.py --logos-only
python tools/test_s3_structure.py --gaps-only
python tools/test_s3_structure.py           # full run

# Export missing logos to CSV
python tools/test_s3_structure.py --logos-only --logos-csv missing_logos.csv
```

Restart server (local or API):
```powershell
# Local restart and wait for health
python tools/restart_server.py --wait

# API-based restart (set token env var on server)
$env:RESTART_API_TOKEN = "<your-token>"
python tools/restart_server.py --use-api --wait
```

End-to-end update + restart:
```powershell
# Full flow: pull, install, tests, S3 check, restart
python tools/update-and-restart.py

# Fast path: pull, install, restart only
python tools/update-and-restart.py --fast

# Use API-based restart if token set
$env:RESTART_API_TOKEN = "<token>"
python tools/update-and-restart.py --use-api
```

Release helpers:
```powershell
# Bump version in package.json (edit), then
git add -A
git commit -m "chore(release): v2.0.0"
git tag v2.0.0
git push
git push --tags
```

## When Asking for Changes
Include:
- What to change and why.
- Where it lives (paths, APIs, functions).
- How to verify (tests, endpoint to curl, expected output).
- Any timeouts/backoffs (e.g., wait 3 minutes for squawk tests).

Example:
> Update `/api/piaware-status` to read from `/data/aircraft.json`, return the aircraft count and receiver lat/lon, and add a 3-minute server-uptime check so squawk tests skip early. Verify with `npm test` and by opening `/api/piaware-status` in a browser.

## Safety & Limits
- The AI avoids harmful or abusive content and won’t produce it on request.
- Copyright-respecting: it won’t paste third-party code beyond allowed snippets.
- If blocked by environment/permissions, it will propose safe alternatives.

## Contact Points
- Main docs: `README.md`, `CONFIGURATION.md`, `LINUX_SETUP.md`, `MINIO_SETUP.md`
- Tests: `__tests__/`, `tools/test_all.py`, `tools/test_s3_structure.py`
- Server: `server.js`, `lib/api-routes.js`, `config.json`
- S3: Buckets `aircraft-data` (read) and `aircraft-data-new` (write)

## Logo Paths
- S3 storage: `aircraft-data/logos/` (e.g., `logos/AAL.png`, `logos/CESSNA.png`)
  - Bucket and prefix configurable via `config.json` (see `s3.buckets.read` and logo prefix settings)
- Optional: `aircraft-data/manufacturer-logos/` (currently unused in this setup)
- API endpoints: `GET /api/v1logos/:code` and `GET /api/v2logos/:code`
  - Examples: `/api/v1logos/AAL` → `logos/AAL.png`, `/api/v1logos/CESSNA` → `logos/CESSNA.png`

## API Endpoints (Quick Reference)
Below are commonly-used server API endpoints you may ask the AI to change or use in tests. Include the HTTP method, required query parameters, and a short description when asking the AI to modify or consume them.

- `GET /api/heatmap-data?hours=<n>`: returns 1nm grid heatmap cells for the past `<n>` hours. Response: `{ grid: [ { lat_min, lat_max, lon_min, lon_max, count }, ... ] }`.
- `GET /api/positions?hours=<n>`: returns recent positions (used by live marker layer). Optional `hours` limits lookback.
- `GET /api/position-timeseries-live?minutes=<n>&resolution=<m>`: returns time-bucketed position counts and aircraft lists for the recent minutes window.
- `GET /api/track?hex=<hex>&minutes=<n>`: returns recent track points for an aircraft hex; useful for drawing tails. Response: `{ track: [ { lat, lon, alt, timestamp }, ... ] }`.
- `GET /api/flights?...`: flights listing and filters (see `/api/flights` in server code). Individual `flight` endpoints exist for per-aircraft details.
- `POST /api/flights/batch` and `POST /api/aircraft/batch`: lightweight batch endpoints that accept JSON payloads (e.g. `{ icao24: ["abc123", ...] }`) and return enriched results to avoid many per-marker calls.
- `GET /api/squawk-transitions`: returns squawk transition aggregates and enriched fields where available.
- `GET /api/aircraft/:icao24`: returns aircraft DB info for given `icao24` (registration, model, manufacturer when present).
- `GET /api/v1logos/:airlineCode` and `GET /api/v2logos/:airlineCode`: logo image endpoints.
- `GET /api/health` and `GET /api/server-status`: health and runtime status endpoints used in headless captures.
- `GET /api/cache-status` and `GET /api/heatmap-cache-clear`: cache inspection and clear endpoints.
- `POST /api/restart`: CI/ops restart endpoint (requires `RESTART_API_TOKEN` configured).

When requesting AI edits that touch API behavior, include the endpoint, expected request shape, expected response (example), and any performance constraints (e.g. avoid scanning all S3 files for high-frequency UI calls).
