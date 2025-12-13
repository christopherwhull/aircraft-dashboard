# TSDB Connection Demo: usage & integration

This document explains how to use the `tools/tsdb_connection_demo.py` module
from the aircraft-tracker toolchain. The module exposes a small set of
functions and a convenience `TSDBConnection` object to perform writes, queries
and database management across the REST/CLI/Python client and fallback paths.

Purpose
-------
- Provide a programmable, portable set of helper functions to manage connections
  with an InfluxDB 3 (or a Timescale adaptation) server.
- Make it easier to create a write token and persist it to disk for reuse.
- Provide a simple `TSDBConnection` wrapper so the main app (e.g. `aircraft-tracker`)
  can call `conn.write_line(...)` or `conn.query(...)` with a stable API.

How to import & use
-------------------
You can import and use the connection factory directly in `aircraft-tracker`.

Example using the factory:

```python
from tools.tsdb_connection_demo import get_connection

HOST = 'http://127.0.0.1:8181'
DB = 'aircraft_test'
CLI_PATH = r'C:\influxdb3-core-3.7.0-windows_amd64\influxdb3.exe'
ADMIN_TOKEN = 'apiv3_...'

# Get a TSDBConnection object (will ensure token is present and persisted)
conn = get_connection(HOST, DB, token_file='runtime/tsdb_token.json', admin_token=ADMIN_TOKEN, cli_path=CLI_PATH)

# Create database via CLI (if supported)
conn.create_database(admin_token=ADMIN_TOKEN)

# Write a single point using preferred method (REST/Python client):
conn.write_line('aircraft_positions', {'icao': 'TEST1', 'lat': 41.5, 'lon': -86.6, 'altitude_ft': 2000})

# Insert many lines (batch via REST) using 'write_lines':
lines = [f"aircraft_positions icao=\"TEST{i}\" lat={41.5+i*0.01} lon={-86.6-i*0.01}" for i in range(100)]
conn.write_lines(lines)

# Query recent rows
rows = conn.query('SELECT * FROM aircraft_positions ORDER BY time DESC LIMIT 10;')

# Drop database
conn.drop_database(admin_token=ADMIN_TOKEN)
```

Notes & caveats
---------------
- `get_connection()` will attempt the following in order to obtain a usable
  token: reading `token_file`, using `influxdb3` CLI tokens, HTTP admin POST
  /api/v3/tokens (when `admin_token` is provided), and then CLI fallback.
- Store the token file outside your repository or use the `token_file` path in
  a `runtime/` directory that is ignored by Git.
- On Windows, the CLI may not accept `--file -` for piping; `write_lines_cli`
  uses a temporary file fallback when needed.
- If your server is InfluxDB Core that doesn't expose HTTP token creation
  endpoints, the module attempts to resolve tokens via CLI only.

How aircraft-tracker should use this module
-----------------------------------------
1. Import and call `get_connection()` during tracker startup to get a
   `TSDBConnection` object.
2. Use `conn.write_line()` and `conn.write_lines()` for point ingestion in the
   tracker’s ingestion path.
3. Use `conn.query()` for read queries (e.g. samples, counts, or small SQL
   queries).
4. To create or drop the database for tests, use `conn.create_database()` and
   `conn.drop_database()`. These require an admin token to be present.

Security & token management
---------------------------
- Avoid embedding admin tokens in source; prefer an admin-only workflow to
  create a write-scoped token once, then use the write-scoped token for
  application traffic.
- The persisted token file uses restrictive permission attempts where the OS
  supports it.

Adding to aircraft-tracker
--------------------------
If you want `aircraft-tracker` to optionally switch to the `TSDBConnection`
API, add an optional import and call like:

```python
try:
    from tools.tsdb_connection_demo import get_connection
    conn = get_connection(host, db, token_file='runtime/tsdb_token.json', admin_token=env_admin_token, cli_path=cli_path)
except Exception:
    conn = None

if conn is not None:
    conn.write_line('aircraft_positions', ...)   # use connection
else:
    # fallback to previous write logic
    pass
```

If you want me to also update the `aircraft-tracker.py` to use this wrapper, I
can create a small backward-compatible adapter that calls `get_connection`
and uses it for writes while preserving the old CLI/Python/HTTP fallbacks when
`get_connection` is not present.

Automatic integration (already implemented)
-------------------------------------------
The current code in `init_tsdb_client` will try to import the module
`tools.tsdb_connection_demo` and return a `TSDBConnection` instance if
available. This avoids code changes in `aircraft-tracker.py` while providing
the new connection object as a drop-in replacement. The `TSDBConnection`
object implements `write_points` and `write` so it is compatible with the
existing write logic that previously used an InfluxDB client or the CLI
configuration dict.

End
