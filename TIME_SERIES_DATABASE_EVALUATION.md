# Time Series Database Evaluation for Aircraft Tracking Data

## Executive Summary

The current aircraft dashboard system stores time series data using Amazon S3 with JSON files organized by timestamp. This document evaluates alternative database solutions specifically designed for time series data to improve performance, scalability, and analytical capabilities.

## Current Architecture Analysis

### Data Structure
The system collects aircraft tracking data with the following key metrics:
- **Temporal**: First_Seen, Last_Seen, Position_Timestamp
- **Spatial**: Latitude, Longitude, Altitude_ft, Distance_NM, Heading
- **Aircraft Identity**: ICAO hex code, Registration, Aircraft_type, Airline
- **Performance**: Speed_kt, Vertical_Rate_ft_min, Messages, RSSI
- **Metadata**: Squawk code, Data_Quality, Age

### Current Storage Pattern
- **Minute files**: `piaware_aircraft_log_YYYYMMDD_HHMM.json` (every 60 seconds)
- **Hourly rollups**: `piaware_aircraft_log_YYYYMMDD_HH00.json` (at hour boundaries)
- **Data format**: JSON Lines (JSONL) with deduplication on (ICAO, Last_Seen)
- **Retention**: 31 days with automatic cleanup

### Performance Characteristics
- **Write load**: ~1-50 records per minute (bursts during high traffic)
- **Read patterns**:
  - Time range queries (last 24h, 7d)
  - Spatial queries (distance, bearing calculations)
  - Aircraft-specific queries (by ICAO, flight, registration)
  - Aggregations (airline stats, reception analysis)

### Current Limitations
1. **Query performance**: Scanning JSON files for complex queries
2. **Real-time analytics**: Limited by file-based storage
3. **Concurrent access**: Multiple processes reading/writing same time periods
4. **Data relationships**: No native support for joins or complex relationships
5. **Scalability**: File system limitations for high-frequency data

## Database Options Evaluation

### 1. InfluxDB

**Overview**: Purpose-built time series database with SQL-like query language.

**Pros**:
- Native time series optimizations
- Built-in aggregation functions
- Real-time querying capabilities
- Excellent for sensor/time series data
- InfluxQL and Flux query languages
- Continuous queries for automated rollups
- Retention policies built-in

**Cons**:
- Learning curve for Flux/InfluxQL
- Less flexible for complex relationships
- Single-node performance limitations
- Commercial licensing for clustering

**Data Model Fit**:
```flux
// Example aircraft tracking measurement
aircraft_tracking,icao=A1B2C3,flight=UAL123,airline="United Airlines"
  latitude=41.51,longitude=-86.69,altitude=35000,speed=450,distance=25.5
  first_seen="2024-01-01T12:00:00Z",last_seen="2024-01-01T12:05:00Z"
```

**Migration Complexity**: Medium
**Operational Overhead**: Low
**Cost**: Free for single node, paid for clustering

### 2. TimescaleDB (PostgreSQL Extension)

**Overview**: PostgreSQL extension that transforms PostgreSQL into a time series database.

**Pros**:
- Leverages existing PostgreSQL expertise
- Full SQL support with time series optimizations
- Advanced analytics and machine learning integrations
- Excellent for complex queries and relationships
- Built-in compression and retention policies
- Continuous aggregates for automated rollups
- ACID compliance

**Cons**:
- Higher resource requirements
- More complex setup than specialized TSDBs
- Learning curve for time series specific features

**Data Model Fit**:
```sql
CREATE TABLE aircraft_positions (
    time TIMESTAMPTZ NOT NULL,
    icao TEXT NOT NULL,
    flight TEXT,
    airline TEXT,
    registration TEXT,
    aircraft_type TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    altitude_ft INTEGER,
    speed_kt INTEGER,
    vertical_rate_ft_min INTEGER,
    distance_nm DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    messages INTEGER,
    rssi DOUBLE PRECISION,
    age DOUBLE PRECISION,
    data_quality TEXT,
    receiver_id TEXT, -- For multi-receiver support
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ
);

SELECT create_hypertable('aircraft_positions', 'time');
```

**Migration Complexity**: Low (SQL-based)
**Operational Overhead**: Medium
**Cost**: PostgreSQL licensing + TimescaleDB

### 3. ClickHouse

**Overview**: Column-oriented analytical database optimized for time series data.

**Pros**:
- Extremely fast analytical queries
- Excellent compression ratios
- Real-time ingestion capabilities
- SQL-like query language with extensions
- Built-in time series functions
- Horizontally scalable
- Low resource usage

**Cons**:
- Complex setup and configuration
- Limited support for updates/deletes
- Steep learning curve
- Not ideal for point queries

**Data Model Fit**:
```sql
CREATE TABLE aircraft_tracking (
    timestamp DateTime,
    icao String,
    flight Nullable(String),
    airline Nullable(String),
    registration Nullable(String),
    aircraft_type Nullable(String),
    latitude Nullable(Float64),
    longitude Nullable(Float64),
    altitude_ft Nullable(Int32),
    speed_kt Nullable(Int32),
    distance_nm Nullable(Float64),
    heading Nullable(Float64),
    messages Nullable(Int32),
    rssi Nullable(Float64),
    data_quality Nullable(String)
) ENGINE = MergeTree()
ORDER BY (icao, timestamp)
TTL timestamp + INTERVAL 31 DAY;
```

**Migration Complexity**: High
**Operational Overhead**: High
**Cost**: Free (open source)

### 4. MongoDB with Time Series Collections

**Overview**: Document database with native time series collection support.

**Pros**:
- Flexible document schema
- Native time series optimizations
- Excellent for complex, nested data
- Built-in aggregation framework
- Automatic compression and retention
- Familiar document-based operations

**Cons**:
- Resource intensive
- Complex aggregation queries
- Licensing costs for production use
- Less optimized than pure time series databases

**Data Model Fit**:
```javascript
// Time series collection
{
  "_id": ObjectId(),
  "timestamp": ISODate("2024-01-01T12:00:00Z"),
  "metadata": {
    "icao": "A1B2C3",
    "flight": "UAL123",
    "airline": "United Airlines",
    "registration": "N123UA",
    "aircraft_type": "B737"
  },
  "position": {
    "latitude": 41.51,
    "longitude": -86.69,
    "altitude_ft": 35000,
    "heading": 90.5
  },
  "performance": {
    "speed_kt": 450,
    "vertical_rate": 0,
    "distance_nm": 25.5
  },
  "signals": {
    "messages": 150,
    "rssi": -25.5,
    "age": 2
  }
}
```

**Migration Complexity**: Medium
**Operational Overhead**: Medium
**Cost**: Commercial licensing

### 5. Redis TimeSeries

**Overview**: In-memory time series database built on Redis.

**Pros**:
- Extremely fast read/write operations
- Simple key-value time series operations
- Built-in aggregation functions
- Low latency for real-time applications
- Easy horizontal scaling

**Cons**:
- In-memory storage (persistence options available)
- Limited complex query capabilities
- Not ideal for long-term historical data
- Resource intensive for large datasets

**Data Model Fit**:
```
TS.ADD aircraft:A1B2C3:latitude 1640995200000 41.51
TS.ADD aircraft:A1B2C3:longitude 1640995200000 -86.69
TS.ADD aircraft:A1B2C3:altitude 1640995200000 35000
```

**Migration Complexity**: High
**Operational Overhead**: Low
**Cost**: Redis licensing

## Recommendation

### Primary Recommendation: **TimescaleDB**

**Rationale**:
1. **SQL Expertise**: Leverages existing database knowledge
2. **Feature Complete**: Supports complex queries, relationships, and analytics
3. **Performance**: Excellent time series performance with PostgreSQL reliability
4. **Ecosystem**: Rich ecosystem of tools and integrations
5. **Migration Path**: Straightforward migration from current JSON structure
6. **Scalability**: Proven scalability for time series workloads

### Implementation Plan

#### Phase 1: Proof of Concept
- Set up TimescaleDB instance
- Design schema based on current data structure
- Implement basic ingestion pipeline
- Test query performance vs current S3 approach

#### Phase 2: Data Migration
- Create migration scripts for existing S3 data
- Implement dual-write strategy (S3 + TimescaleDB)
- Validate data integrity during migration

#### Phase 3: Application Updates
- Update aircraft tracker to write to TimescaleDB
- Modify API endpoints to query TimescaleDB
- Update dashboard frontend for enhanced analytics

#### Phase 4: Advanced Features
- Implement continuous aggregates for real-time dashboards
- Add geospatial queries for reception analysis
- Create alerting system for unusual flight patterns

### Schema Design

```sql
-- Main time series table
CREATE TABLE aircraft_positions (
    time TIMESTAMPTZ NOT NULL,
    icao TEXT NOT NULL,
    flight TEXT,
    airline TEXT,
    registration TEXT,
    aircraft_type TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    altitude_ft INTEGER,
    speed_kt INTEGER,
    vertical_rate_ft_min INTEGER,
    distance_nm DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    messages INTEGER,
    rssi DOUBLE PRECISION,
    age DOUBLE PRECISION,
    data_quality TEXT,
    receiver_id TEXT, -- For multi-receiver support
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ
);

-- Create hypertable
SELECT create_hypertable('aircraft_positions', 'time');

-- Indexes for common queries
CREATE INDEX idx_aircraft_positions_icao_time ON aircraft_positions (icao, time DESC);
CREATE INDEX idx_aircraft_positions_flight_time ON aircraft_positions (flight, time DESC);
CREATE INDEX idx_aircraft_positions_location ON aircraft_positions USING gist (point(longitude, latitude));

-- Continuous aggregates for performance
CREATE MATERIALIZED VIEW hourly_aircraft_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    icao,
    flight,
    airline,
    COUNT(*) as position_count,
    AVG(altitude_ft) as avg_altitude,
    MAX(altitude_ft) as max_altitude,
    AVG(speed_kt) as avg_speed,
    MAX(distance_nm) as max_distance
FROM aircraft_positions
GROUP BY bucket, icao, flight, airline
WITH NO DATA;
```

### Performance Expectations

**Current S3 Performance**:
- Minute file queries: ~100-500ms
- Hourly aggregations: ~2-5 seconds
- Complex spatial queries: ~10-30 seconds

**Expected TimescaleDB Performance**:
- Real-time queries: <100ms
- Hourly aggregations: <500ms
- Complex analytics: <2 seconds
- Concurrent users: 10-100x improvement

### Migration Strategy

1. **Parallel Operation**: Run both S3 and TimescaleDB ingestion
2. **Gradual Cutover**: Migrate read operations incrementally
3. **Rollback Plan**: Ability to fall back to S3 if issues arise
4. **Data Validation**: Automated comparison between old and new systems

### Cost Analysis

- **TimescaleDB**: ~$500-2000/month for production instance
- **Development Time**: 2-3 weeks for initial implementation
- **Performance Gains**: 10-100x improvement in query performance
- **Operational Benefits**: Reduced maintenance, better monitoring

### Conclusion

TimescaleDB offers the best balance of performance, familiarity, and features for the aircraft tracking use case. The SQL-based approach simplifies migration and enables advanced analytics capabilities that would be difficult to implement with the current S3-based architecture.

The investment in TimescaleDB will provide significant long-term benefits in terms of query performance, real-time analytics, and system maintainability.