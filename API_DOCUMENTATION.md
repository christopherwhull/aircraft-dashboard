# AirSquawk API Documentation

## Overview

The AirSquawk provides a comprehensive REST API for accessing live and historical flight data, aircraft information, and system status. All endpoints return JSON responses unless otherwise noted.

## Base URL
```
http://localhost:3002/api/
```

## Authentication
Most endpoints do not require authentication. The `/api/restart` endpoint supports optional token-based authentication.


## Core Data Endpoints

### GET `/api/positions`
Returns live aircraft positions within a specified time window.

**Parameters:**

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

---

## Auto-generated Endpoint Index (synchronization note)

The following endpoint index was generated automatically from the running server's route definitions (`lib/api-routes.js`). It is intended as an authoritative appendix to help keep documentation accurate. If you add or remove routes, please update this file or regenerate the index.

Implemented endpoints (summary):

- GET `/api/heatmap-data` — 1nm grid heatmap data (params: `hours`)
- GET `/api/position-timeseries-live` — timeseries buckets for recent positions (params: `minutes` or `startTime`/`endTime`)
- GET `/api/reception-range` — reception analysis by bearing/altitude (params: `hours`)
- GET `/api/flights` — flights listing (params: `limit`, `hours`, `airline`)
- GET `/api/airline-stats` — airline statistics (params: `hours`)
- GET `/api/squawk-transitions` — squawk transitions (params: `hours`, `startTime`, `endTime`)
- GET `/api/historical-stats` — historical aggregated stats (params: varies)
- POST `/api/restart` — trigger server restart (auth via `Authorization` header or `X-Restart-Token`)
- GET `/api/piaware-status` — piaware receiver status
- GET `/api/health` — system health and uptime
- GET `/api/server-status` — memory/cpu/request metrics
- GET `/api/receiver-location` — configured receiver coordinates
- GET `/api/cache-status` — cache sizes & S3 connectivity
- GET `/api/airline-database` — full airline database payload (careful: large)
- GET `/api/config` — UI configuration used by the frontend
- GET `/api/aircraft/:icao24` — aircraft details (param: `icao24`)
- GET `/api/aircraft-database/status` — status of aircraft DB loads
- POST `/api/aircraft/batch` — batched aircraft enrichment (body: `{ "hexes": [...] }`)
- POST `/api/flights/batch` — batched flights (body: `{ "hexes": [...] }`)
- GET `/api/v1logos/:airlineCode` — legacy logo endpoint
- GET `/api/v2logos/:airlineCode` — logo serving endpoint (PNG/SVG)
- GET `/api/aircraft-types` — return aircraft types mapping
- GET `/api/airlines` — airline list / database
- GET `/api/heatmap` — heatmap page/data endpoint
- GET `/api/heatmap-cache-clear` — clear heatmap cache
- GET `/api/heatmap-stats` — stats about heatmap cache and load times
- GET `/api/positions` — live positions (params: `hours`)
- GET `/api/squawk` — compact squawk listing endpoint
- GET `/api/flight` — single flight info (param: `icao`)
- GET `/api/track` — historical track points for an aircraft (params: `hex`, `minutes`)

If you would like, I can expand each of the above with parameter and response examples (automatically inferred), or open a PR with this appendix only. This file will be committed to `chore/docs-sync-all` branch.

---

### GET `/api/heatmap-data`
Returns aircraft position density aggregated into a 1 nautical mile grid.

**Parameters:**
- `hours` (number, optional): Hours to look back (default: 24)

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

---

### GET `/api/aircraft/:icao24`
Returns detailed information for a specific aircraft.

**Parameters:**
- `icao24` (string, required): Aircraft ICAO24 identifier

**Response:**
```json
{
  "hex": "A1B2C3",
  "registration": "N123AA",
  "manufacturer": "Boeing",
  "model": "737-800",
  "typecode": "B738",
  "operator": "American Airlines",
  "owner": "American Airlines Inc",
  "built": "2015-01-01",
  "engines": "CFM56-7B",
  "category": "Large Jet"
}
```

---

### POST `/api/aircraft/batch`
Returns enriched aircraft information for multiple aircraft in a single request.

**Request Body:**
```json
{
  "hexes": ["A1B2C3", "B2C3D4", "C3D4E5"]
}
```

**Response:**
```json
{
  "A1B2C3": {
    "registration": "N123AA",
    "manufacturer": "Boeing",
    "model": "737-800",
    "operator": "American Airlines"
  }
}
```

---

### GET `/api/airlines`
Returns the complete airline database with IATA/ICAO codes and names.

**Response:**
```json
{
  "AAL": {
    "name": "American Airlines",
    "logo": "/api/v2logos/AAL"
  },
  "DAL": {
    "name": "Delta Air Lines",
    "logo": "/api/v2logos/DAL"
  }
}
```

---

### GET `/api/v2logos/:code`
Serves airline or manufacturer logos.

**Parameters:**
- `code` (string, required): Airline code (e.g., "AAL") or manufacturer name

**Response:** PNG/SVG image file

---

## Flight Tracking Endpoints

### GET `/api/flight`
Returns flight information for a specific aircraft.

**Parameters:**
- `icao` (string, required): Aircraft ICAO24 identifier

**Response:**
```json
{
  "hex": "A1B2C3",
  "callsign": "AAL123",
  "origin": "KJFK",
  "destination": "KLAX",
  "altitude": 35000,
  "speed": 500,
  "heading": 270,
  "distance_to_destination": 2450
}
```

---

### GET `/api/flights`
Returns flight data with optional filtering.

**Parameters:**
- `limit` (number, optional): Maximum number of flights to return
- `hours` (number, optional): Hours to look back
- `airline` (string, optional): Filter by airline code

**Response:**
```json
{
  "flights": [
    {
      "hex": "A1B2C3",
      "callsign": "AAL123",
      "origin": "KJFK",
      "destination": "KLAX",
      "departure_time": 1700000000000,
      "arrival_time": 1700010000000
    }
  ]
}
```

---

### POST `/api/flights/batch`
Returns flight information for multiple aircraft.

**Request Body:**
```json
{
  "hexes": ["A1B2C3", "B2C3D4"]
}
```

**Response:** Similar to `/api/flights` but for specified aircraft.

### GET `/api/track`
Returns historical track points for an aircraft with vertical rate information for flight phase coloring.

**Parameters:**
- `hex` (string, required): Aircraft hex identifier
- `minutes` (number, optional): Minutes to look back (default: 15)

**Response:**
```json
{
  "track": [
    {
      "lat": 40.7128,
      "lon": -74.0060,
      "alt": 35000,
      "timestamp": 1700000000000,
      "vertical_rate": 1200
    }
  ]
}
```

**Fields:**
- `vertical_rate`: Vertical speed in feet per minute (positive = climbing, negative = descending)
- Used by frontend for color-coded track segments: red (descending), green (climbing), yellow (level)

---

## Analytics Endpoints

### GET `/api/airline-stats`
Returns statistics grouped by airline.

**Parameters:**
- `hours` (number, optional): Hours to look back (default: 24)

**Response:**
```json
{
  "AAL": {
    "flights": 25,
    "positions": 1250,
    "avg_altitude": 32000,
    "max_range": 2800
  }
}
```

---

### GET `/api/squawk-transitions`
Returns squawk code transition data.

**Parameters:**
- `hours` (number, optional): Hours to look back (default: 0.1667, approximately 10 minutes)
- `startTime` (number, optional): Start timestamp in milliseconds
- `endTime` (number, optional): End timestamp in milliseconds

**Response:**
```json
{
  "transitions": [
    {
      "hex": "A1B2C3",
      "from_squawk": "1200",
      "to_squawk": "1234",
      "timestamp": 1700000000000,
      "altitude": 15000
    }
  ]
}
```

---

### GET `/api/reception-range`
Returns reception range analysis by bearing and altitude.

**Parameters:**
- `hours` (number, optional): Hours to look back (default: 24)

**Response:**
```json
{
  "bearing": {
    "0": { "max_range": 250, "count": 45 },
    "15": { "max_range": 275, "count": 52 }
  },
  "altitude": {
    "0-4999": { "max_range": 150, "count": 120 },
    "5000-9999": { "max_range": 200, "count": 95 }
  }
}
```

---

## System Status Endpoints

### GET `/api/health`
Returns system health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1700000000000,
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

### GET `/api/cache-status`
Returns cache statistics and connectivity status.

**Response:**
```json
{
  "positionCache": {
    "size": 1250,
    "lastUpdate": 1700000000000
  },
  "aircraftCache": {
    "size": 500,
    "ttl": 60
  },
  "s3": {
    "readBucket": "connected",
    "writeBucket": "connected"
  }
}
```

---

### GET `/api/server-status`
Returns server performance metrics.

**Response:**
```json
{
  "memory": {
    "used": 150000000,
    "total": 500000000,
    "percentage": 30
  },
  "cpu": {
    "usage": 25.5
  },
  "requests": {
    "total": 15000,
    "perSecond": 2.5
  }
}
```

---

### GET `/api/config`
Returns UI configuration settings.

**Response:**
```json
{
  "mapCenter": [40.7128, -74.0060],
  "defaultZoom": 7,
  "tileServers": ["osm", "carto", "vfr-terminal"],
  "features": {
    "liveTracking": true,
    "heatmap": true,
    "receptionAnalysis": true
  }
}
```

---

## Administrative Endpoints

### POST `/api/restart`
Triggers a server restart (requires authentication token).

**Headers:**
- `Authorization: Bearer <token>` (optional)
- `X-Restart-Token: <token>` (optional)

**Request Body (alternative):**
```json
{
  "token": "your-restart-token"
}
```

**Response:**
```json
{
  "status": "restarting",
  "message": "Server restart initiated"
}
```

---

## Historical Data Endpoints

### GET `/api/position-timeseries-live`
Returns live position time series data.

**Parameters:**
- `resolution` (number, optional): Data resolution in minutes (default: 1)
- `minutes` (number, optional): Minutes to look back (default: 10)

**Response:**
```json
{
  "timeseries": [
    {
      "timestamp": 1700000000000,
      "positions": 42,
      "altitude_avg": 25000
    }
  ]
}
```

---

### GET `/api/historical-stats`
Returns historical statistics for a time range.

**Parameters:**
- `start` (timestamp, optional): Start time
- `end` (timestamp, optional): End time
- `groupBy` (string, optional): Grouping interval ("hour", "day")

**Response:**
```json
{
  "stats": [
    {
      "timestamp": 1700000000000,
      "flights": 150,
      "positions": 7500,
      "airlines": 12
    }
  ]
}
```

---

## Data Sources

### Primary Data Sources
1. **Live Position Feed**: Real-time ADS-B data from PiAware/dump1090
2. **Aircraft Database**: S3-stored aircraft registration and type data (236K+ records)
3. **Airline Database**: Static mapping of airline codes to names
4. **Logo Assets**: S3-stored airline and manufacturer logos

### Caching Strategy
- **Position Cache**: In-memory cache with configurable TTL
- **Aircraft Enrichment**: Client-side caching (60 seconds)
- **Flight Data**: 5-second TTL cache
- **Tile Cache**: Disk-backed cache with LRU pruning (5GB limit)

### Rate Limiting
Most endpoints support reasonable request rates. High-frequency polling should implement client-side caching.

---

## Heatmap Visualization Features

## Additional Endpoint Details

### GET `/api/heatmap-data`
Returns aircraft position density aggregated into a 1 nautical mile grid optimized for heatmap generation.

**Parameters:**
- `hours` (number, optional): Hours to look back (default: 24)
- `bbox` (string, optional): Bounding box `minLon,minLat,maxLon,maxLat` to restrict data

**Response:**
```json
{
  "grid": [
    { "lat_min": 40.0, "lat_max": 40.0167, "lon_min": -74.0, "lon_max": -73.9833, "count": 15 }
  ],
  "resolution_nm": 1
}
```

---

### GET `/api/piaware-status`
Returns the status of the connected PiAware/dump1090 receiver (if configured).

**Response:**
```json
{
  "connected": true,
  "lastSeen": 1700000000000,
  "messagesPerMinute": 1200,
  "software": "piaware 7.2"
}
```

---

### GET `/api/receiver-location`
Returns the configured receiver (station) location used for range/reception calculations.

**Response:**
```json
{
  "lat": 40.7128,
  "lon": -74.0060,
  "elevation_m": 10,
  "name": "Home Receiver"
}
```

---

### GET `/api/airline-database`
Returns the full airline database. This endpoint can return a large payload; clients should request it sparingly or use local caching.

**Response:**
```json
{
  "AAL": { "name": "American Airlines", "icao": "AAL", "iata": "AA", "country": "US" },
  "DAL": { "name": "Delta Air Lines", "icao": "DAL", "iata": "DL", "country": "US" }
}
```

---

### GET `/api/aircraft-database/status`
Shows current aircraft DB load status and source (S3 vs local).

**Response:**
```json
{
  "status": "loaded",
  "source": "s3",
  "lastLoaded": 1700000000000,
  "recordCount": 236000
}
```

---

### GET `/api/v1logos/:airlineCode`
Legacy logo endpoint kept for compatibility. Returns the same image as `/api/v2logos` but with older caching semantics.

**Parameters:**
- `airlineCode` (string, required): Airline IATA or ICAO code

**Response:** Binary image (PNG/SVG)

---

### GET `/api/aircraft-types`
Returns the mapping of type codes to human-friendly names and display categories used by the UI.

**Response:**
```json
{
  "B738": { "manufacturer": "Boeing", "model": "737-800", "category": "Narrowbody" },
  "A320": { "manufacturer": "Airbus", "model": "A320", "category": "Narrowbody" }
}
```

---

### GET `/api/heatmap`
Serves the heatmap page or data depending on `Accept` headers. For programmatic access prefer `/api/heatmap-data`.

**Response:** HTML page (when requested by browser) or JSON (data) matching `/api/heatmap-data` structure.

---

### GET `/api/heatmap-cache-clear`
Clears the server-side heatmap cache. Intended for operators to force regeneration.

**Response:**
```json
{ "status": "cleared", "cacheEntriesRemoved": 42 }
```

---

### GET `/api/heatmap-stats`
Returns statistics about heatmap generation performance and cache hit/miss counts.

**Response:**
```json
{
  "cacheHits": 1200,
  "cacheMisses": 45,
  "avgGenerateMs": 320
}
```

---

### GET `/api/squawk`
Compact listing of currently observed squawk codes with counts.

**Response:**
```json
{
  "1234": 12,
  "7000": 5,
  "1200": 2
}
```

---

The heatmap interface provides advanced visual indicators for aircraft status and movement:

### Aircraft Icon Colors
Aircraft icons are dynamically colored based on vertical movement:
- **Green**: Climbing aircraft (>500 ft/min vertical rate)
- **Red**: Descending aircraft (<-300 ft/min vertical rate)
- **Orange**: Level flight or unknown vertical rate

### Popup Display
Aircraft information popups include:
- **Type**: Aircraft type code (e.g., B738, A320)
- **Age**: Time since last update in seconds (e.g., "45s ago")
- **Background Color**: Light green for climbing, light red for descending

### Track Change Indicators
- **Blue dots**: Appear for 15 seconds when aircraft significantly change heading (>5°)
- **Yellow dots**: Appear for 4 seconds when aircraft change squawk codes

### Long Tracks
- Historical flight tracks are always enabled and update every 15 seconds
- Shows aircraft paths for all visible aircraft on the map

## Error Responses

All endpoints return standard HTTP status codes:
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `404`: Not Found
- `500`: Internal Server Error

Error response format:
```json
{
  "error": "Error description",
  "details": "Additional error information"
}
```

## WebSocket Support
Real-time updates are available via WebSocket connections for live position data (planned feature).

## Version History
- **v1.0**: Initial API with core endpoints
- **v1.1**: Added batch endpoints and improved caching
- **v1.2**: Enhanced analytics and reception analysis
- **v1.3**: Added logo serving and airline database endpoints
- **v1.4**: Heatmap visualization enhancements:
  - Aircraft icons colored by vertical rate (green/red)
  - Enhanced popup displays with type and age information
  - Improved track change indicators
  - Mandatory long tracks with 15-second updates
  - Squawk transitions default changed to 10 minutes