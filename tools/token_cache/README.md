# Token Cache Example and Usage

This folder contains an example admin token file for InfluxDB v3.

`influx_admin_token.json.example` contains example fields to configure the CLI/tool usage.

If you want to run real tests or create a non-admin write token, do the following locally:

1. Copy the example to the real file (this file is ignored by git to avoid committing secrets):

```pwsh
# Replace replacements with your actual values
Copy-Item -Path "tools/token_cache/influx_admin_token.json.example" -Destination "tools/token_cache/influx_admin_token.json"
# Then edit the file to set your host, cli_path and admin_token
notepad tools/token_cache/influx_admin_token.json
```

2. Use the created file with the CLI tools, e.g.:

```pwsh
python tools/tsdb-integration-test.py --cli-path "C:\influxdb3-core-3.7.0-windows_amd64" --admin-token-file "tools/token_cache/influx_admin_token.json" --host "http://127.0.0.1:8086" --db test_db --speedtest --speedtest-counts 1,10,100 --bulk-batch-size 1000
```

Security warning: Keep the `tools/token_cache/influx_admin_token.json` file private (it is ignored by this repository) and do not commit admin tokens into source control. Consider a more secure token store for production instead of storing tokens in files.

Default token file (tsconfig.json)
---------------------------------
To support other scripts or tooling, this folder contains a hidden default config file called `tsconfig.json` that is also ignored by the repo. It uses the same JSON format as the `influx_admin_token.json` example. Example contents:

```
{
	"host": "http://127.0.0.1:8181",
	"cli_path": "C:\\influxdb3-core-3.7.0-windows_amd64",
	"admin_token": "REPLACE_ME"
}
```

The `tools/tsdb-integration-test.py` helper will attempt to read `tools/token_cache/tsconfig.json` automatically if you do not pass `--admin-token-file` or `--admin-token` on the command line.
