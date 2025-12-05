-- TimescaleDB Initialization Script for Aircraft Tracking
-- This script sets up the database schema and optimizations

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create the main hypertable for aircraft positions
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
    receiver_id TEXT DEFAULT 'primary',
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ
);

-- Convert to hypertable with 1-day chunks
SELECT create_hypertable('aircraft_positions', 'time', chunk_time_interval => INTERVAL '1 day');

-- Create indexes for optimal query performance
CREATE INDEX idx_aircraft_positions_icao_time ON aircraft_positions (icao, time DESC);
CREATE INDEX idx_aircraft_positions_flight_time ON aircraft_positions (flight, time DESC) WHERE flight IS NOT NULL;
CREATE INDEX idx_aircraft_positions_airline ON aircraft_positions (airline) WHERE airline IS NOT NULL;
CREATE INDEX idx_aircraft_positions_location ON aircraft_positions (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create continuous aggregates for common queries
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
    MAX(distance_nm) as max_distance,
    MIN(latitude) as min_lat,
    MAX(latitude) as max_lat,
    MIN(longitude) as min_lon,
    MAX(longitude) as max_lon
FROM aircraft_positions
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
GROUP BY bucket, icao, flight, airline
WITH NO DATA;

-- Create daily summary view
CREATE MATERIALIZED VIEW daily_aircraft_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    icao,
    flight,
    airline,
    COUNT(*) as daily_positions,
    AVG(altitude_ft) as avg_daily_altitude,
    MAX(altitude_ft) as max_daily_altitude,
    AVG(speed_kt) as avg_daily_speed,
    SUM(distance_nm) as total_distance_nm
FROM aircraft_positions
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
GROUP BY bucket, icao, flight, airline
WITH NO DATA;

-- Add compression policy (compress chunks older than 7 days)
SELECT add_compression_policy('aircraft_positions', INTERVAL '7 days');

-- Add retention policy (keep data for 31 days)
SELECT add_retention_policy('aircraft_positions', INTERVAL '31 days');

-- Create a view for real-time aircraft tracking
CREATE VIEW active_aircraft AS
SELECT DISTINCT ON (icao)
    time,
    icao,
    flight,
    airline,
    registration,
    aircraft_type,
    latitude,
    longitude,
    altitude_ft,
    speed_kt,
    heading,
    last_seen
FROM aircraft_positions
WHERE time > NOW() - INTERVAL '5 minutes'
AND latitude IS NOT NULL AND longitude IS NOT NULL
ORDER BY icao, time DESC;

-- Grant permissions for the application user (if different from postgres)
-- GRANT SELECT, INSERT, UPDATE ON aircraft_positions TO aircraft_app;
-- GRANT SELECT ON active_aircraft TO aircraft_app;
-- GRANT SELECT ON hourly_aircraft_summary TO aircraft_app;
-- GRANT SELECT ON daily_aircraft_summary TO aircraft_app;