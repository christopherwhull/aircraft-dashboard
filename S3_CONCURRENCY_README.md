# S3 Multi-Tracker Concurrency Support

This feature enables multiple aircraft trackers to write to the same S3 buckets without conflicts by using receiver-specific prefixes.

## Overview

When multiple aircraft trackers run simultaneously (e.g., different receivers, test environments, or geographically distributed setups), they can conflict when writing to the same S3 bucket. This feature solves this by automatically separating data using receiver-specific S3 prefixes.

## Configuration

### Receiver Identification

Add receiver configuration to `config.js`:

```javascript
receiver: {
    // Unique identifier for this receiver/tracker instance
    // Used for S3 prefix separation in multi-tracker setups
    id: process.env.RECEIVER_ID || 'primary',
    // Optional receiver location for identification
    location: process.env.RECEIVER_LOCATION || '',
    // Optional receiver description
    description: process.env.RECEIVER_DESCRIPTION || '',
},
```

### Environment Variables

Set these environment variables to configure receiver identification:

- `RECEIVER_ID`: Unique identifier for this tracker instance (default: 'primary')
- `RECEIVER_LOCATION`: Optional location description
- `RECEIVER_DESCRIPTION`: Optional description

## How It Works

### S3 Prefix Structure

- **Primary/Default Receiver**: Uses base S3 prefix from config
  ```
  s3://bucket/data/piaware_aircraft_log_20241205_1430.json
  ```

- **Named Receivers**: Uses receiver-specific subdirectories
  ```
  s3://bucket/data/receivers/receiver-name/piaware_aircraft_log_20241205_1430.json
  ```

### Automatic Detection

The system automatically:
1. Detects if a receiver ID is configured
2. Uses receiver-specific prefixes for non-primary receivers
3. Maintains backward compatibility with existing data

## Server Reading

The server automatically reads from all receiver prefixes:
- Base prefix: `data/piaware_aircraft_log*`
- All receiver prefixes: `data/receivers/*/piaware_aircraft_log*`

This ensures all aircraft data is available regardless of which receiver collected it.

## Example Usage

### Single Tracker (Default)
```bash
# No environment variables needed
node server.js
# Files: s3://bucket/data/piaware_aircraft_log_*.json
```

### Multiple Trackers
```bash
# Tracker 1 - Primary
export RECEIVER_ID=primary
node server.js
# Files: s3://bucket/data/piaware_aircraft_log_*.json

# Tracker 2 - Secondary receiver
export RECEIVER_ID=backup-receiver
export RECEIVER_LOCATION="Backup Location"
node server.js
# Files: s3://bucket/data/receivers/backup-receiver/piaware_aircraft_log_*.json

# Tracker 3 - Test environment
export RECEIVER_ID=test-env
export RECEIVER_DESCRIPTION="Testing Environment"
node server.js
# Files: s3://bucket/data/receivers/test-env/piaware_aircraft_log_*.json
```

## Benefits

1. **No Conflicts**: Multiple trackers can run simultaneously without overwriting each other's data
2. **Data Separation**: Easy to identify which receiver collected specific data
3. **Scalability**: Support for unlimited number of receivers
4. **Backward Compatibility**: Existing single-tracker setups continue to work unchanged
5. **Unified View**: Server aggregates data from all receivers for complete situational awareness

## Monitoring

Check the aircraft tracker startup logs to see the S3 path being used:

```
S3 log path: s3://aircraft-data/data/receivers/backup-receiver/piaware_aircraft_log_*.json
```

## Migration

Existing data remains accessible. New data from additional receivers will be stored in separate prefixes automatically.

## Troubleshooting

### Data Not Appearing
- Check that `RECEIVER_ID` is set correctly
- Verify S3 permissions for the receiver-specific prefix
- Check server logs for S3 read errors

### Performance Issues
- Monitor S3 list operations for increased latency with many receivers
- Consider S3 bucket partitioning if scaling to hundreds of receivers

## Technical Details

### File Patterns
- Standard: `piaware_aircraft_log_YYYYMMDD_HHMM.json`
- Receiver-specific: `receivers/{receiver_id}/piaware_aircraft_log_YYYYMMDD_HHMM.json`

### Server Aggregation
The server uses regex patterns to identify valid aircraft log files:
- `/piaware_aircraft_log_\d{8}_\d{4}\.json$/` (standard format)
- `/receivers\/[^\/]+\/piaware_aircraft_log_\d{8}_\d{4}\.json$/` (receiver format)</content>
<parameter name="filePath">c:\Users\chris\aircraft-dashboard-new\S3_CONCURRENCY_README.md