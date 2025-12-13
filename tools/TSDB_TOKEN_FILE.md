## TSDB Token Cache File

This document describes the token cache file format used by
`tools/tsdb-integration-test.py` and `tools/tsdb_integration_test.py`.

Purpose:
- Persist an auto-created write token (for InfluxDB 3) to disk
- Store additional metadata such as the CLI path used to create the token

File Format (JSON):

{
  "token": "<write-token>",
  "cli_path": "<absolute-cli-or-install-path>"
}

Example (Windows):

{
  "token": "U2VjcmV0VG9rZW4=",
  "cli_path": "C:\\influxdb3-core-3.7.0-windows_amd64"
}

Usage:

- When `--create-token-auto` is used, the CLI attempts to read an existing
  token file from a deterministic default cache path: ``$HOME/.aircraft_dashboard``
  (or user-specified `--token-cache-dir`). If the file exists and it contains
  JSON with a `token` field, the CLI re-uses it for subsequent writes and
  queries.
- The CLI also recognizes plain-text token files written by older scripts, and
  treats the full file contents as the token string.
- When token creation is required, the CLI will write a JSON token file
  containing the token and the CLI path to make future runs more robust.

Security Note:
- Token files are written in plaintext; on POSIX systems the script attempts to

  Persisting CLI token
  --------------------
  If you have created a token with the `influxdb3` CLI or an existing CLI session
  contains a valid token, the script offers a convenience option to persist
  that token to the JSON token cache so other old scripts can reuse it.

  Use `--persist-cli-token` with the `tsdb-integration-test.py` script and
  optionally `--token-file` to choose where to write the token file.

  Example:

  ```pwsh
  python tools/tsdb-integration-test.py --cli-path "C:\influxdb3-core-3.7.0-windows_amd64" --persist-cli-token --token-file "tools/token_cache/influx_write_token.json"
  ```

  This attempts to read token information from the system CLI (`influxdb3 auth list`, `influxdb3 config` etc) and writes a JSON file with `token` and `cli_path` to the specified `token_file`. If no `--token-file` is specified, the script tries to use deterministic cache path similar to `--create-token-auto`.

  set the token file permission to 0600. On Windows, file ACLs are not set by
  the script — store tokens in a secure vault for production deployments.
