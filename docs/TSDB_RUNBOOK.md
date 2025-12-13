# TSDB Runbook — Known Good Commands and Notes

This short runbook documents the **confirmed working commands and behaviors** for interacting with the local InfluxDB v3 (IOx) server at http://127.0.0.1:8181 used by the tracker.

## Tokens & runtime
- Token file: `runtime/tsdb_token.json` — contains `token` and `cli_path` keys (write token currently admin-scoped in this environment).
- Preferred practice: use `tools/run_tracker_tsdb.py` to start the tracker; it reads `runtime/tsdb_token.json` and avoids exposing tokens in package.json.

## CLI usage (Windows / PowerShell)
- Write a Line Protocol point (example):

```powershell
& 'C:\influxdb3-core-3.7.0-windows_amd64\influxdb3.exe' write --database airsquawk --host http://127.0.0.1:8181 --token '<TOKEN>' --precision s "test_write,name=test value=1i"
```

- Query by SQL (pass SQL as a positional arg):

```powershell
& 'C:\influxdb3-core-3.7.0-windows_amd64\influxdb3.exe' query --database airsquawk --host http://127.0.0.1:8181 --token '<TOKEN>' "SELECT * FROM test_write ORDER BY time DESC LIMIT 5"
```

Notes:
- The CLI expects LP and SQL as positional arguments, not via `--lines` / `--sql` flags.
- Use explicit `i` suffix for integer fields in LP (e.g., `value=1i`).

## Python helper scripts (already present)
- `tools/run_tracker_tsdb.py --disable-s3` — starts the tracker using tokens in `runtime/tsdb_token.json`.
- `tools/query_tsdb_count.py` — queries `SELECT COUNT(*) FROM aircraft_positions` using the runtime token.
- `tools/check_tracker_db_poll.py` — poll helper to check periodically for the latest `aircraft_positions` entry.

## REST vs CLI behavior
- REST v2 write endpoint accepting LP: `POST /api/v2/write?bucket=<db>` — accepted LP writes when correctly formatted.
- REST v3 query: `POST /api/v3/query_sql` — supports SELECT queries but DDL (CREATE TABLE) is unsupported on this server build.
- Token creation endpoints may not be available via REST on this server (return 404); we used the CLI to create an admin token and persisted it.

## Quick checklist (what to do to reproduce a test run)
1. Ensure server is running at http://127.0.0.1:8181
2. Confirm token in `runtime/tsdb_token.json` and that `cli_path` points to your `influxdb3.exe`
3. Start tracker wrapper (leave the cmd window open):

```powershell
Start-Process cmd.exe -ArgumentList '/k', 'python tools/run_tracker_tsdb.py --disable-s3'
```

4. Verify a one-off test write (LP) and query as shown above to confirm CLI reads/writes work
5. Monitor tracker logs and use `tools/check_tracker_db_poll.py` or `tools/query_tsdb_count.py` to confirm `aircraft_positions` rows are being created each minute.

---

If you'd like, I can add a brief `make` or `run_tracker.ps1` script to make the above even easier. Let me know your preference.