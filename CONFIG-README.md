# Aircraft Dashboard Configuration

This configuration file (`config.json`) contains all settings for the Aircraft Dashboard application. The application will read these settings to customize behavior without requiring code changes.

**Note:** The configuration file supports comments using `//` syntax for documentation purposes.

## Configuration Sections

### Server Settings
- `mainPort`: Main web server port (default: 3002)
- `tileProxyPort`: FAA chart tile proxy port (default: 3004)
- `host`: Server hostname (default: "localhost")
- `cors`: Cross-origin resource sharing settings

### Heatmap Settings
- `defaultOpacity`: Default heatmap transparency (0.0-1.0, default: 0.1)
- `maxOpacity`/`minOpacity`: Opacity range limits
- `defaultTimeWindow`: Default time range for data ("24h")
- `availableTimeWindows`: Supported time ranges
- `colorMode`: Default color scheme ("viridis")
- `showBorders`: Whether to show grid borders
- `gridSize`: Size of heatmap grid cells in nautical miles
- `mapCenter`: Override map center location
  - `enabled`: Whether to use custom center (default: false, uses piaware location)
  - `lat`: Latitude (-90 to 90)
  - `lon`: Longitude (-180 to 180)
  - `zoom`: Zoom level (1-20)

### Screenshot Settings
- `outputDirectory`: Where screenshots are saved
- `defaultDelay`: Delay between screenshot captures (ms)
- `interactiveMode`: Whether to wait for user input between captures
- `locations`: Predefined locations for screenshots (KPPO, LaPorte)
- `chartLayers`: FAA chart types to capture

### Data Settings
- `cache`: Cache configuration (enabled, maxAge, cleanupInterval)
- `databases`: Paths to data files
- `apis`: External API settings (OpenSky, PiAware)

### Logging Settings
- `level`: Log verbosity ("info", "debug", "warn", "error")
- `console`: Whether to log to console
- `directory`: Directory for log files (default: "logs")
- `maxSizeMB`: Maximum log file size in MB (0 = unlimited, default: 20)
- `rotationIntervalHours`: How often to check for log rotation (hours, default: 1)
- `file`: File logging configuration
- `networkRequests`: Network request logging

### UI Settings
- `theme`: UI theme ("dark", "light")
- `defaultView`: Default tab to show
- `tabs`: Which tabs to enable/disable
- `controls`: Which filter controls to show

### Performance Settings
- `maxConcurrentRequests`: Maximum simultaneous API calls
- `requestTimeout`: API request timeout (ms)
- `cacheSize`: Maximum cache entries
- `workerThreads`: Number of worker threads

### External Services
- `weather`: Weather radar configuration
- `charts`: FAA aviation chart settings
- `artcc`: ARTCC boundary data source

### Proxy Server Settings
- `enabled`: Whether the tile proxy server is enabled
- `port`: Proxy server port (default: 3004)
- `cache`: Cache configuration (directory, max size, prune intervals)
- `timeout`: Request timeout settings
- `providers`: All available tile providers organized by category:
  - `osm`: OpenStreetMap tiles
  - `carto`: Carto Voyager tiles
  - `opentopo`: OpenTopoMap tiles
  - `arcgis`: ArcGIS base maps (imagery, street, topo)
  - `aviation`: FAA aviation charts (VFR Terminal, Sectional, IFR Area Low/High)
- `logging`: Proxy server logging configuration
  - `file`: Log filename
  - `level`: Log verbosity level
  - `maxSizeMB`: Maximum log file size in MB (0 = unlimited, default: 20)
  - `rotationIntervalHours`: How often to check for log rotation (hours, default: 1)
  - `cleanup`: Cache cleanup settings
    - `enabled`: Whether to enable automatic cache cleanup (default: true)
- `health`: Health check endpoint settings
- `cacheStatus`: Cache status endpoint settings

### Development Settings
- `debug`: Enable debug mode
- `mockData`: Use mock data instead of live APIs
- `autoReload`: Auto-reload on file changes
- `sourceMaps`: Generate source maps

## Usage

1. Edit `config.json` with your desired settings
2. Restart the application to apply changes
3. The application will automatically load the configuration

## Example Modifications

### Change heatmap opacity:
```json
"heatmap": {
  "defaultOpacity": 0.3
}
```

### Add a new screenshot location:
```json
"screenshots": {
  "locations": {
    "newLocation": {
      "name": "New Airport",
      "lat": 40.0,
      "lon": -75.0,
      "zoom": 9
    }
  }
}
```

### Disable certain tabs:
```json
"ui": {
  "tabs": {
    "cache": false,
    "types": false
  }
}
```