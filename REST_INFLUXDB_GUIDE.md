# REST API and InfluxDB Integration Guide

This guide explains how to use the REST API endpoints and InfluxDB integration in the AirSquawk aircraft tracking system.

## Overview

The AirSquawk system consists of two main components:
1. **REST API**: Web service endpoints for accessing live and historical flight data
2. **InfluxDB Integration**: Time-series database for storing and querying aircraft position data

## REST API Usage

### Base URL
```
http://localhost:3002/api/
```

### Authentication
Most endpoints do not require authentication. The `/api/restart` endpoint supports optional token-based authentication via the `Authorization` header or `X-Restart-Token` query parameter.

### Core Endpoints

#### Live Aircraft Positions
```http
GET /api/positions?hours=24
```

Returns live aircraft positions within the specified time window.

**Parameters:**
- `hours` (optional): Number of hours to look back (default: 24)

**Response:**
```json
{
  "aircraftCount": 42,
  "positions": [
    {
      "hex": "A1B2C3",
      "lat": 40.7128,
      "lon": -74.0060,
      "altitude": 35000,
      "speed": 500,
      "heading": 90,
      "squawk": "1234",
      "timestamp": 1700000000000,
      "manufacturer": "Boeing",
      "aircraft_model": "737-800",
      "operator": "American Airlines"
    }
  ]
}
```

#### Aircraft Details
```http
GET /api/aircraft/{icao24}
```

Returns detailed information about a specific aircraft.

**Parameters:**
- `icao24`: 24-bit ICAO aircraft identifier (hex string)

**Response:**
```json
{
  "hex": "A1B2C3",
  "manufacturer": "Boeing",
  "model": "737-800",
  "type": "L2J",
  "operator": "American Airlines",
  "registration": "N123AA",
  "serial": "12345"
}
```

#### Historical Flight Tracks
```http
GET /api/track?hex=A1B2C3&minutes=60
```

Returns historical track points for a specific aircraft.

**Parameters:**
- `hex`: Aircraft ICAO hex identifier
- `minutes`: Number of minutes of history to retrieve

**Response:**
```json
{
  "hex": "A1B2C3",
  "track": [
    {
      "lat": 40.7128,
      "lon": -74.0060,
      "altitude": 35000,
      "speed": 500,
      "heading": 90,
      "timestamp": 1700000000000
    }
  ]
}
```

#### Heatmap Data
```http
GET /api/heatmap-data?hours=24
```

Returns aircraft position density data aggregated into a 1 nautical mile grid.

**Parameters:**
- `hours`: Hours to look back for position data

**Response:**
```json
{
  "grid": [
    {
      "lat_min": 40.0,
      "lat_max": 40.0167,
      "lon_min": -74.0,
      "lon_max": -73.9833,
      "count": 15
    }
  ]
}
```

#### Airline Statistics
```http
GET /api/airline-stats?hours=24
```

Returns statistics about airline activity.

**Parameters:**
- `hours`: Hours to analyze

**Response:**
```json
{
  "totalFlights": 1250,
  "airlines": [
    {
      "name": "American Airlines",
      "flightCount": 45,
      "aircraftCount": 12
    }
  ]
}
```

#### System Health
```http
GET /api/health
```

Returns system health and uptime information.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": 1700000000000
}
```

## InfluxDB Integration

### Overview

The system integrates with InfluxDB 3 (or TimescaleDB) for storing time-series aircraft position data. The integration provides multiple methods for writing and querying data.

### Configuration

Configure InfluxDB connection in `config.json`:

```json
{
  "tsdb": {
    "url": "http://127.0.0.1:8181",
    "token": "your_write_token_here",
    "db": "airsquawk",
    "measurement": "aircraft_positions"
  }
}
```

### Token Management

The system supports multiple token file formats for authentication:

#### Runtime Token File (`runtime/tsdb_token.json`)
```json
{
  "host": "http://127.0.0.1:8181",
  "cli_path": "C:\\influxdb3-core-3.7.0-windows_amd64",
  "token": "apiv3_JsZo4nu68c-h74X_WfQYjFoV6fazUsn8v0jc6zS5gamnGpXuYfMEPfjZ1jpH1TbuEQOZY0TW5HbrkiU7kZk3XA"
}
```

#### Admin Token File (`tools/token_cache/influx_admin_token.json.example`)
```json
{
  "host": "http://127.0.0.1:8181",
  "cli_path": "C:\\influxdb3-core-3.7.0-windows_amd64",
  "admin_token": "apiv3_JsZo4nu68c-h74X_WfQYjFoV6fazUsn8v0jc6zS5gamnGpXuYfMEPfjZ1jpH1TbuEQOZY0TW5HbrkiU7kZk3XA"
}
```

#### Write Token File (`tools/token_cache/influx_write_token.json`)
```json
{
  "host": "http://127.0.0.1:8181",
  "cli_path": "C:\\influxdb3-core-3.7.0-windows_amd64",
  "token": "apiv3_JsZo4nu68c-h74X_WfQYjFoV6fazUsn8v0jc6zS5gamnGpXuYfMEPfjZ1jpH1TbuEQOZY0TW5HbrkiU7kZk3XA"
}
```

### Writing Data to InfluxDB

#### Using the TSDB Connection Demo Module

```python
from tools.tsdb_connection_demo import get_connection

# Create connection
conn = get_connection(
    host='http://127.0.0.1:8181',
    dbname='airsquawk',
    token_file='runtime/tsdb_token.json',
    admin_token='your_admin_token',
    cli_path='C:\\influxdb3-core-3.7.0-windows_amd64'
)

# Write a single data point
conn.write_line('aircraft_positions', {
    'icao': 'A1B2C3',
    'lat': 40.7128,
    'lon': -74.0060,
    'altitude_ft': 35000,
    'speed_kt': 500,
    'heading': 90
})

# Write multiple lines (bulk)
lines = [
    'aircraft_positions icao="A1B2C3" lat=40.7128,lon=-74.0060,altitude_ft=35000i 1700000000000000000',
    'aircraft_positions icao="B2C3D4" lat=40.7589,lon=-73.9851,altitude_ft=25000i 1700000001000000000'
]
conn.write_lines(lines)

# Write using point format (compatible with older code)
points = [{
    'measurement': 'aircraft_positions',
    'tags': {'icao': 'A1B2C3'},
    'fields': {
        'lat': 40.7128,
        'lon': -74.0060,
        'altitude_ft': 35000
    },
    'time': 1700000000000000000
}]
conn.write_points(points)
```

#### Direct REST API Writes

The system supports writing data directly via InfluxDB's REST API endpoints:

```python
import requests

# InfluxDB v3 API endpoints
url_v3_db = "http://127.0.0.1:8181/api/v3/write_lp?db=airsquawk"
url_v3_bucket = "http://127.0.0.1:8181/api/v3/write_lp?bucket=airsquawk"
url_v2 = "http://127.0.0.1:8181/api/v2/write?bucket=airsquawk&precision=ns"

headers = {
    'Content-Type': 'text/plain',
    'Authorization': 'Bearer your_write_token'
}

# Line protocol data
data = '''aircraft_positions icao="A1B2C3" lat=40.7128,lon=-74.0060,altitude_ft=35000i 1700000000000000000
aircraft_positions icao="B2C3D4" lat=40.7589,lon=-73.9851,altitude_ft=25000i 1700000001000000000'''

response = requests.post(url_v3_db, data=data, headers=headers)
```

#### Line Protocol Format

InfluxDB uses line protocol format for data ingestion:

```
measurement[,tag_key1=tag_value1[,tag_key2=tag_value2]] field_key=field_value[,field_key2=field_value2] [timestamp]
```

**Example:**
```
aircraft_positions,icao=A1B2C3 lat=40.7128,lon=-74.0060,altitude_ft=35000i,speed_kt=500.0,heading=90.0,squawk="1234" 1700000000000000000
```

**Field Types:**
- Integers: `altitude_ft=35000i`
- Floats: `lat=40.7128`
- Strings: `squawk="1234"`
- Booleans: `on_ground=false`

### Querying Data from InfluxDB

#### Using the TSDB Connection Module

```python
# Query using SQL
rows = conn.query('SELECT * FROM aircraft_positions ORDER BY time DESC LIMIT 10')

# Query with time range
rows = conn.query('''
    SELECT icao, lat, lon, altitude_ft
    FROM aircraft_positions
    WHERE time >= '2024-01-01T00:00:00Z'
    ORDER BY time DESC
    LIMIT 100
''')

# Aggregate queries
rows = conn.query('''
    SELECT icao, COUNT(*) as position_count,
           MEAN(altitude_ft) as avg_altitude,
           MAX(speed_kt) as max_speed
    FROM aircraft_positions
    WHERE time >= now() - interval '1 hour'
    GROUP BY icao
''')
```

#### Direct REST API Queries

```python
import requests

url = "http://127.0.0.0.0:8181/api/v3/query_sql"
headers = {
    'Authorization': 'Bearer your_token',
    'Content-Type': 'application/json'
}

# SQL query
payload = {
    'db': 'airsquawk',
    'q': 'SELECT * FROM aircraft_positions ORDER BY time DESC LIMIT 10'
}

response = requests.post(url, json=payload, headers=headers)
results = response.json()
```

### Database Management

#### Creating a Database

```python
# Using CLI
conn.create_database(admin_token='your_admin_token')

# Or directly with CLI
# influxdb3 create database airsquawk --host http://127.0.0.1:8181 --token your_admin_token
```

#### Checking Database Existence

```python
exists = conn.database_exists()
if exists:
    print("Database exists")
elif exists is False:
    print("Database does not exist")
else:
    print("Could not determine database status")
```

#### Dropping a Database

```python
conn.drop_database(admin_token='your_admin_token')
```

### Backfilling Historical Data

The system includes a backfill script to load historical data from S3 into InfluxDB:

```bash
# Backfill all available data
python tools/backfill_tsdb_from_s3.py

# Backfill with limit
python tools/backfill_tsdb_from_s3.py --limit 1000

# Backfill specific date range
python tools/backfill_tsdb_from_s3.py --start-date 2024-01-01 --end-date 2024-01-02
```

### Integration with Aircraft Tracker

The main aircraft tracker automatically writes position data to InfluxDB when enabled:

```bash
# Enable TSDB writes
python tools/aircraft-tracker.py --enable-tsdb

# Run with TSDB disabled (default)
python tools/aircraft-tracker.py --disable-tsdb
```

### Troubleshooting

#### Common Issues

1. **Token Authentication Errors**
   - Ensure token has write permissions
   - Check token file format and path
   - Verify token hasn't expired

2. **Connection Refused**
   - Verify InfluxDB server is running
   - Check host and port configuration
   - Ensure firewall allows connections

3. **Database Not Found**
   - Create database first using admin token
   - Verify database name in configuration

4. **Write Failures**
   - Check line protocol format
   - Verify field types (integers need 'i' suffix)
   - Ensure timestamps are in nanoseconds

#### Monitoring Writes

```python
from tools.tsdb_connection_demo import get_rest_successful_writes

# Get count of successful REST writes
successful_writes = get_rest_successful_writes()
print(f"Total successful REST writes: {successful_writes}")
```

### Performance Considerations

- **Batch Writes**: Use `write_lines()` for bulk inserts instead of individual `write_line()` calls
- **REST vs CLI**: REST API is generally faster for programmatic writes
- **Token Caching**: Runtime tokens are cached to avoid repeated authentication
- **Connection Pooling**: The connection module reuses connections when possible

### Migration from Other Systems

When migrating from other time-series databases:

1. **TimescaleDB**: The connection module supports TimescaleDB with minimal changes
2. **InfluxDB v1/v2**: Update API endpoints and authentication methods
3. **Custom TSDB**: Implement custom connection wrapper using the existing interface

This integration provides a robust, scalable solution for storing and analyzing aircraft tracking data with high-performance time-series queries.</content>
<parameter name="filePath">c:\Users\chris\aircraft-dashboard-new\REST_INFLUXDB_GUIDE.md