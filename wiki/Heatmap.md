# Heatmap Tab

The Heatmap tab provides access to aircraft position density visualizations with configurable grid sizes and multiple data sources.

## Features

- **Leaflet Heatmap Viewer**: Link to interactive Leaflet-based heatmap
- **Time Window Filtering**: Configurable time periods for position data (30m to 4 weeks)
- **Aircraft Type Filtering**: Filter by manufacturer or aircraft type
- **Grid Size Control**: Adjustable grid resolution from 0.1 to 5.0 nautical miles
- **Data Source Selection**: Choose between TSDB, memory, SQLite, or S3 storage
- **Interactive Map**: Zoom, pan, and layer controls
- **Aviation Chart Overlays**: Optional sectional charts and airspace information

## Usage

1. Click "Open Leaflet Heatmap Viewer" to launch the interactive map
2. Use time window controls to filter positions by recency
3. Select grid size for desired resolution (smaller = more detail, larger = better performance)
4. Choose data source based on your needs (TSDB for recent data, S3 for historical)
5. Apply manufacturer or type filters to focus on specific aircraft
6. Use map controls to zoom and navigate
7. Toggle aviation chart overlays for additional context

## Configuration Options

### Time Windows
- 30 minutes (30m)
- 1, 4, 6, 8, 12, 24 hours
- 1 week (1w), 4 weeks (4w)
- All time data

### Grid Sizes
- 0.1 NM: High resolution (more detailed, slower loading)
- 0.5 NM: Medium resolution (balanced performance)
- 1.0 NM: Standard resolution (default)
- 2.0-5.0 NM: Low resolution (faster loading, less detail)

### Data Sources
- **TSDB**: Time-series database (InfluxDB) - best for recent data
- **Memory**: In-memory cache - fastest for small datasets
- **SQLite**: Local database - good for moderate datasets
- **S3**: Cloud storage - best for large historical datasets

## External Viewer

The heatmap uses a separate Leaflet-based viewer (`/heatmap-leaflet`) for better performance and interactivity compared to the main dashboard.

## API Endpoints

- `/api/heatmap-data`: Returns position data for heatmap rendering
  - Parameters: `hours`, `source`, `gridSizeNm`
- `/api/heatmap-stats`: Returns cache statistics and available data ranges

## Data Sources

- Cached position data from multiple storage backends (TSDB, SQLite, S3)
- Aircraft type database for filtering
- Aviation chart tiles (optional overlays)

## Performance

The heatmap viewer is optimized for large datasets with:
- Client-side clustering for dense areas
- Progressive loading of position data
- Efficient caching of rendered tiles
- Configurable grid resolution for performance tuning