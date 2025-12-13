# Squawk Transitions Queries

This directory contains SQL queries and scripts for analyzing squawk code transitions in your aircraft tracking data stored in InfluxDB.

## Files

- `squawk_transitions_query.sql` - Basic SQL query to find squawk transitions
- `squawk_transitions_advanced.sql` - Advanced query with emergency code detection
- `query_squawk_transitions.py` - Python script to run the queries programmatically

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

These queries complement the existing `/api/squawk-transitions` endpoint, which processes data from S3 storage. Use these SQL queries for:

- Real-time analysis of live data
- Custom time ranges and filters
- Direct database queries for advanced analytics
- Integration with external monitoring systems

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