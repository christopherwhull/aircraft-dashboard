# Squawk Transitions Queries

This directory contains SQL queries and scripts for analyzing squawk code transitions in your aircraft tracking data stored in InfluxDB.

## Current Status

**⚠️ Note**: The squawk field is not currently available in the InfluxDB database. The aircraft tracker has been updated to write squawk codes as fields (not tags), but no data with squawk information has been ingested yet.

To use these queries, you need to:
1. Run the aircraft tracker with real ADS-B data that includes squawk codes
2. Ensure the data source provides squawk information
3. The queries will work once squawk data is available

## Files

- `squawk_transitions_query.sql` - Basic SQL query to find squawk transitions
- `squawk_transitions_advanced.sql` - Advanced query with emergency code detection
- `query_squawk_transitions.py` - Python script to run the queries programmatically

## Data Requirements

For squawk transition analysis to work, your aircraft data must include:

- **Squawk codes**: 4-digit transponder codes (e.g., "1200", "7500")
- **Sequential readings**: Multiple position reports for the same aircraft
- **Time series data**: Properly timestamped position reports

### Checking Data Availability

Run the Python script to check if squawk data is available:

```bash
python tools/query_squawk_transitions.py
```

If squawk data is missing, you'll see a diagnostic message explaining the issue.

### Getting Squawk Data

1. **ADS-B Source**: Ensure your ADS-B data source includes squawk codes
2. **Aircraft Tracker**: The tracker has been updated to write squawk as a field
3. **Data Ingestion**: Run the aircraft tracker with live data:
   ```bash
   cd tools
   python aircraft-tracker.py --enable-tsdb
   ```

## What are Squawk Transitions?

Squawk codes are 4-digit transponder codes that aircraft broadcast to identify themselves to air traffic control. Transitions occur when an aircraft changes its squawk code, which can indicate:

- **Flight Phase Changes**: Different codes for taxiing, takeoff, en route, approach, landing
- **Emergency Situations**: Special codes like 7500 (hijack), 7600 (radio failure), 7700 (general emergency)
- **Airspace Changes**: Different codes required in different airspace sectors

## Basic Query Usage

### Direct SQL Query

Run the basic query directly against your InfluxDB instance:

```sql
-- Copy and paste the contents of squawk_transitions_query.sql
-- Modify the time range and limit as needed
```

### Using the Python Script

```bash
# Query last 24 hours, limit to 100 results
python tools/query_squawk_transitions.py

# Query last 6 hours, limit to 50 results
python tools/query_squawk_transitions.py --hours 6 --limit 50

# Query last 48 hours for more historical data
python tools/query_squawk_transitions.py --hours 48 --limit 200
```

## Query Parameters

### Time Window
- Default: 24 hours
- Adjust with `--hours` parameter
- Use longer windows for historical analysis

### Result Limits
- Default: 100 transitions
- Adjust with `--limit` parameter
- Higher limits may impact performance

## Understanding the Results

Each transition shows:

- **Aircraft Identity**: ICAO hex code, registration, flight number, aircraft type
- **Squawk Change**: From code → To code
- **Location**: Latitude, longitude where transition occurred
- **Altitude**: Aircraft altitude at time of transition
- **Timing**: When transition occurred and time since last squawk change

## Advanced Analysis

The advanced query (`squawk_transitions_advanced.sql`) includes:

- **Emergency Code Detection**: Identifies hijack, radio failure, and general emergency codes
- **Transition Categorization**: Classifies transitions by type (VFR, IFR, Emergency)
- **Priority Ordering**: Shows emergency transitions first

## Common Squawk Codes

| Code Range | Purpose | Example |
|------------|---------|---------|
| 0000-0777 | VFR Flights | 1200 (common VFR) |
| 1000-1777 | IFR Flights | Various ATC assigned |
| 7500 | Hijack | Emergency |
| 7600 | Radio Failure | Emergency |
| 7700 | General Emergency | Emergency |

## Troubleshooting

### No Squawk Data Available
- **Symptom**: Script reports "squawk field is not available"
- **Cause**: No aircraft data with squawk codes has been written to InfluxDB
- **Solution**: 
  1. Run aircraft tracker with real ADS-B data
  2. Ensure data source includes squawk codes
  3. Check that `--enable-tsdb` flag is used

### No Results
- Check that aircraft tracker is writing to InfluxDB
- Verify time window contains flight data
- Ensure squawk codes are being captured

### Authentication Errors
- Verify InfluxDB token is configured correctly
- Check `runtime/tsdb_token.json` exists and is valid
- Ensure InfluxDB server is running

### Performance Issues
- Reduce time window for faster queries
- Use lower limits for initial testing
- Consider adding more specific filters

## Integration with Dashboard

The system provides two squawk transition APIs:

### S3-Based API (`/api/squawk-transitions`)
- Processes historical data from S3 storage
- Good for analyzing past flight data
- Supports time ranges and custom filtering
- Includes position data enrichment

### TSDB-Based API (`/api/squawk-transitions-tsdb`)
- Uses SQL queries against InfluxDB for real-time analysis
- Optimized for live data and recent transitions
- Supports the same parameters as the S3-based API
- Returns data in the same format for easy integration

### Usage Examples

#### S3-Based API (Historical Data)
```bash
# Last 24 hours
curl "http://localhost:3002/api/squawk-transitions?hours=24"

# Custom time range
curl "http://localhost:3002/api/squawk-transitions?startTime=1704067200000&endTime=1704153600000"
```

#### TSDB-Based API (Real-time Data)
```bash
# Last 24 hours from InfluxDB
curl "http://localhost:3002/api/squawk-transitions-tsdb?hours=24"

# Last hour with limit
curl "http://localhost:3002/api/squawk-transitions-tsdb?hours=1&limit=50"
```

Use the TSDB API for real-time analysis and the S3 API for historical analysis.

## Example Output

```
Aircraft: A1B2C3 (N123AA)
Flight: AAL123
Type: B738
Squawk: 1200 → 4321
Location: 40.7128, -74.0060
Altitude: 35000 ft
Time: 2025-12-13 08:30:15 UTC
Time since last: 2.5 minutes
----------------------------------------
```