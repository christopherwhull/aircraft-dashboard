# InfluxDB Setup Guide for AirSquawk

This guide explains how to set up InfluxDB 3 for the AirSquawk aircraft tracking system.

## Current Status

InfluxDB is currently running and configured for the AirSquawk system. The database contains aircraft position data with the following characteristics:

- **Database**: `airsquawk`
- **Measurement**: `aircraft_positions_v2`
- **Receiver IDs**: Currently showing "server" as the receiver identifier
- **Data Volume**: Contains recent position data aggregated by hour

### Available Data

You can query the current data using:

```bash
# Check position counts per receiver for the last 24 hours
curl "http://localhost:3002/api/positions-per-hour?hours=24"
```

This will return JSON data showing hourly position counts grouped by receiver.

## Overview

InfluxDB 3 is used as a time-series database to store aircraft position data for historical analysis and querying. The system aggregates position data by hour and receiver to provide insights into aircraft tracking coverage.

## Automated Setup (Recommended)

Use one of the provided scripts for automated setup:

### Cross-Platform Python Script (Recommended for all OS)

```bash
python tools/setup-influxdb.py
```

This script works on Windows, macOS, and Linux. It will:
- Auto-detect InfluxDB installation
- Start InfluxDB with the correct configuration
- Create an admin authentication token
- Update your `config.json` with the token
- Test the database connection

#### Python Script Parameters

- `--influxdb-path`: Path to InfluxDB executable (auto-detected if not specified)
- `--data-dir`: Data directory (defaults to `influxdb_data`)
- `--config-file`: Config file to update (defaults to `config.json`)
- `--node-id`: Node ID (defaults to `airsquawk`)
- `--database`: Database name (defaults to `airsquawk`)

Example usage:
```bash
# Basic setup
python tools/setup-influxdb.py

# Custom InfluxDB path
python tools/setup-influxdb.py --influxdb-path /usr/local/bin/influxdb3

# Custom data directory
python tools/setup-influxdb.py --data-dir /var/lib/influxdb --node-id mynode
```

### Windows PowerShell Script

```powershell
.\setup-influxdb.ps1
```

### Windows Batch Script

```cmd
setup-influxdb.bat
```

These scripts will:
- Start InfluxDB with the correct configuration
- Create an admin authentication token
- Update your `config.json` with the token
- Test the database connection

#### PowerShell Script Parameters

- `-InfluxDBPath`: Path to InfluxDB executable (auto-detected if not specified)
- `-DataDir`: Data directory (defaults to `influxdb_data`)
- `-ConfigFile`: Config file to update (defaults to `config.json`)
- `-NodeId`: Node ID (defaults to `airsquawk`)
- `-DatabaseName`: Database name (defaults to `airsquawk`)

## Manual Setup

If you prefer to set up InfluxDB manually:

### 1. Download and Install InfluxDB 3

Download from: https://www.influxdata.com/products/influxdb/

Extract to a directory, e.g., `C:\influxdb3-core-3.7.0-windows_amd64\`

### 2. Start InfluxDB

```cmd
influxdb3 serve --node-id airsquawk --data-dir "C:\path\to\airsquawk\influxdb_data"
```

### 3. Create Admin Token

```cmd
influxdb3 create token --admin
```

This will output a token like: `apiv3_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 4. Update Configuration

Add the token to your `config.json`:

```json
{
  "tsdb": {
    "type": "influxdb3",
    "url": "http://127.0.0.1:8181",
    "db": "airsquawk",
    "token": "apiv3_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "tsdb_measurement": "aircraft_positions_v2"
  }
}
```

### 5. Restart Services

Restart the aircraft-dashboard PM2 processes:

```bash
pm2 restart aircraft-dashboard
```

## Data Schema

### Measurement: `aircraft_positions_v2`

Fields stored for each aircraft position:
- `time`: Timestamp of position report
- `icao`: Aircraft ICAO hex identifier
- `lat`: Latitude
- `lon`: Longitude
- `flight`: Flight callsign
- `receiver_id`: Identifier of the Pi receiver (if available)
- `receiver_lat`: Receiver latitude
- `receiver_lon`: Receiver longitude
- Additional fields: altitude, speed, heading, squawk, etc.

## API Endpoints

Once set up, you can query position data using:

### Positions Per Hour Per Receiver
```
GET /api/positions-per-hour?hours=24
```

Returns hourly position counts aggregated by receiver:

```json
{
  "data": [
    {
      "hour": 1765746000000,
      "receiver_id": "server",
      "position_count": 38660
    }
  ],
  "hours": 24,
  "timestamp": 1765821600000
}
```

## Troubleshooting

### InfluxDB Won't Start
- Ensure the data directory exists and is writable
- Check if another instance is already running on port 8181
- Verify the InfluxDB executable path

### Authentication Errors
- Ensure the token in `config.json` matches the created token
- Restart the aircraft-dashboard processes after updating config
- Check InfluxDB logs for authentication failures

### No Data in Queries
- Verify the aircraft tracker is running with TSDB enabled
- Check that `receiver_id` is being set in position data
- Ensure the measurement name matches (`aircraft_positions_v2`)

### Port Conflicts
- Default port is 8181
- Change the port in InfluxDB startup command and config.json if needed

## Performance Considerations

- InfluxDB data can grow large over time
- Consider setting up data retention policies for old position data
- Monitor disk usage in the data directory
- The system is optimized for time-range queries by hour/receiver

## Backup and Recovery

- InfluxDB data is stored in the specified data directory
- Stop InfluxDB before backing up the data directory
- The data directory contains all historical position data
- Configuration and tokens need to be recreated on new installations