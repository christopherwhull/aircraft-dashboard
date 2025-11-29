# Aircraft Dashboard for PiAware

A real-time aircraft tracking and analytics dashboard that connects to a PiAware server to monitor ADS-B aircraft data.

## Requirements

- **PiAware Server** - Running and accessible on your local network
- **Node.js** - Version 14 or higher
- **MinIO S3 Storage** - For historical data storage and caching

## Features

- **Live Aircraft Tracking** - Real-time display of aircraft positions from PiAware
- **Position History** - 7-day rolling cache with 24-hour in-memory history
- **Flight Statistics** - Track completed and active flights
- **Airline Analytics** - Statistics by airline with drill-down capabilities
- **Reception Analysis** - Visualize reception range by bearing and altitude
- **Squawk Transitions** - Monitor squawk code changes
- **Heatmap Visualization** - Geographic density of aircraft positions
- **S3 Data Persistence** - Automatic archival of historical data

## Installation

1. Clone the repository:
```bash
git clone https://github.com/christopherwhull/aircraft-dashboard.git
cd aircraft-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Configure settings in `config.js`:
   - Set your PiAware URL (default: `http://piaware.local:8080/data/aircraft.json`)
   - Configure S3/MinIO connection details
   - Adjust server port (default: 3002)

4. Start the server:
```bash
node server.js
```

5. Access the dashboard:
```
http://localhost:3002
```

## Configuration

Edit `config.js` to customize:

- **Data Source**: PiAware server URL
- **S3 Storage**: MinIO endpoint and credentials
- **Server Port**: Default 3002
- **Update Intervals**: Data fetch and cache refresh rates
- **UI Settings**: Time ranges, graph settings, reception parameters

## PiAware Setup

Ensure your PiAware server is:
1. Running and accessible on your network
2. Providing ADS-B data via the JSON API
3. Default URL: `http://piaware.local:8080/data/aircraft.json`

## Usage

### Tabs

- **Live**: Real-time aircraft currently being tracked
- **Airlines**: Statistics by airline with active flight counts
- **Flights**: Completed and active flight history
- **Positions**: Time series analysis of positions, aircraft, flights, and airlines
- **Squawk**: Squawk code transition tracking
- **Heatmap**: Geographic density visualization
- **Reception**: Range analysis by bearing and altitude
- **Cache**: Position cache status and statistics

### Time Controls

Most tabs include time range controls:
- Quick buttons: 1h, 6h, 24h, 7d, 31d
- Custom datetime range selection
- Automatic refresh when end time is near current time

### Data Sources

Position statistics can switch between:
- **Memory**: Last 24 hours of in-memory data
- **Cache**: 7-day rolling cache
- **S3**: Historical data from MinIO/S3 storage

## API Endpoints

- `/api/position-timeseries-live` - Position time series data
- `/api/airline-stats` - Airline statistics
- `/api/flights` - Flight data
- `/api/squawk-transitions` - Squawk code changes
- `/api/heatmap-data` - Geographic density grid
- `/api/reception-range` - Reception range analysis
- `/api/cache-status` - Cache statistics
- `/api/config` - UI configuration

## Background Jobs

The server runs several background processes:

- **Aircraft Data Logging**: Save position data to S3 every 1 minute
- **Flight Building**: Reconstruct flights from position data every 5 minutes
- **Aggregated Stats**: Save hourly statistics every 5 minutes
- **Cache Refresh**: Update position cache every 5 minutes
- **Hourly Rollups**: Aggregate position data into hourly files

## Data Storage

### S3 Structure

```
aircraft-data-new/
├── data/
│   ├── piaware_aircraft_log_*.json    # Minute-by-minute position records
│   └── hourly/
│       └── positions_*.json           # Hourly position aggregates
├── flights/
│   ├── hourly/
│   │   └── flights_*.json            # Hourly flight records
│   └── daily/
│       └── flights_*.json            # Daily flight records
└── aggregated/
    └── hourly_stats_*.json           # Hourly aggregated statistics
```

## Version History

### v1.0.1 (2025-11-28)
- Added aircraft type display in Flights and Airlines tabs
- Enhanced airline statistics with "Now" indicator for active flights
- Added time range controls for position graph
- Improved sorting and filtering
- Fixed type field persistence to S3

### v1.0.0 (2025-11-27)
- Initial release
- Live tracking, position caching, S3 storage
- Multiple visualizations and analytics tabs

## License

MIT License

## Author

Christopher Hull

## Contributing

Issues and pull requests are welcome on GitHub.

## Support

For issues or questions, please open an issue on the GitHub repository.
