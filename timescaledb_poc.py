#!/usr/bin/env python3
"""
TimescaleDB Proof of Concept for Aircraft Tracking Data

This script demonstrates how to integrate TimescaleDB with the existing
aircraft tracking system. It shows:
1. Database connection and schema setup
2. Data ingestion from existing JSON format
3. Query performance comparison
4. Basic analytics queries

Requirements:
- pip install psycopg2-binary pandas
- TimescaleDB instance running
"""

import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any
import psycopg2
from psycopg2.extras import execute_values
import pandas as pd


class TimescaleDBConnector:
    """TimescaleDB connector for aircraft tracking data."""

    def __init__(self, host: str = "localhost", port: int = 5432,
                 database: str = "aircraft_db", user: str = "postgres",
                 password: str = "password"):
        self.connection_params = {
            "host": host,
            "port": port,
            "database": database,
            "user": user,
            "password": password
        }
        self.conn = None

    def connect(self):
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(**self.connection_params)
            self.conn.autocommit = False
            print("✓ Connected to TimescaleDB")
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            raise

    def create_schema(self):
        """Create the aircraft tracking schema."""
        schema_sql = """
        -- Create database if it doesn't exist
        CREATE DATABASE IF NOT EXISTS aircraft_db;

        -- Use the aircraft_db database
        \\c aircraft_db;

        -- Create main time series table
        CREATE TABLE IF NOT EXISTS aircraft_positions (
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

        -- Convert to hypertable (TimescaleDB)
        SELECT create_hypertable('aircraft_positions', 'time', if_not_exists => TRUE);

        -- Create indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_aircraft_positions_icao_time
        ON aircraft_positions (icao, time DESC);

        CREATE INDEX IF NOT EXISTS idx_aircraft_positions_flight_time
        ON aircraft_positions (flight, time DESC) WHERE flight IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_aircraft_positions_airline
        ON aircraft_positions (airline) WHERE airline IS NOT NULL;

        -- Create continuous aggregate for hourly summaries
        CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_aircraft_summary
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

        -- Add compression policy (30 days retention)
        SELECT add_compression_policy('aircraft_positions', INTERVAL '30 days');

        -- Add retention policy (31 days)
        SELECT add_retention_policy('aircraft_positions', INTERVAL '31 days');
        """

        try:
            with self.conn.cursor() as cursor:
                # Execute schema creation
                for statement in schema_sql.split(';'):
                    statement = statement.strip()
                    if statement and not statement.startswith('--'):
                        cursor.execute(statement)
                self.conn.commit()
                print("✓ Schema created successfully")
        except Exception as e:
            print(f"✗ Schema creation failed: {e}")
            self.conn.rollback()
            raise

    def insert_aircraft_data(self, aircraft_data: List[Dict[str, Any]]):
        """Insert aircraft position data into TimescaleDB."""
        if not aircraft_data:
            return

        insert_sql = """
        INSERT INTO aircraft_positions (
            time, icao, flight, airline, registration, aircraft_type,
            latitude, longitude, altitude_ft, speed_kt, vertical_rate_ft_min,
            distance_nm, heading, messages, rssi, age, data_quality,
            first_seen, last_seen
        ) VALUES %s
        ON CONFLICT (icao, time) DO NOTHING
        """

        # Prepare data for insertion
        values = []
        for record in aircraft_data:
            # Parse timestamps
            try:
                record_time = datetime.fromisoformat(record.get('Position_Time', '').replace('Z', '+00:00'))
            except:
                record_time = datetime.now()

            try:
                first_seen = datetime.fromisoformat(record.get('First_Seen', '').replace('Z', '+00:00'))
            except:
                first_seen = record_time

            try:
                last_seen = datetime.fromisoformat(record.get('Last_Seen', '').replace('Z', '+00:00'))
            except:
                last_seen = record_time

            values.append((
                record_time,
                record.get('ICAO', ''),
                record.get('Ident', ''),
                record.get('Airline', ''),
                record.get('Registration', ''),
                record.get('Aircraft_Type', ''),
                record.get('Latitude'),
                record.get('Longitude'),
                record.get('Altitude_ft'),
                record.get('Speed_kt'),
                record.get('Vertical_Rate_ft_min'),
                record.get('Distance_NM'),
                record.get('Heading'),
                record.get('Messages'),
                record.get('RSSI'),
                record.get('Age'),
                record.get('Data_Quality'),
                first_seen,
                last_seen
            ))

        try:
            with self.conn.cursor() as cursor:
                execute_values(cursor, insert_sql, values)
                self.conn.commit()
                print(f"✓ Inserted {len(values)} aircraft records")
        except Exception as e:
            print(f"✗ Data insertion failed: {e}")
            self.conn.rollback()
            raise

    def query_recent_positions(self, hours: int = 24) -> pd.DataFrame:
        """Query recent aircraft positions."""
        query = """
        SELECT
            time,
            icao,
            flight,
            airline,
            latitude,
            longitude,
            altitude_ft,
            speed_kt,
            heading
        FROM aircraft_positions
        WHERE time > NOW() - INTERVAL '%s hours'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        ORDER BY time DESC
        LIMIT 1000
        """

        try:
            return pd.read_sql_query(query, self.conn, params=[hours])
        except Exception as e:
            print(f"✗ Query failed: {e}")
            return pd.DataFrame()

    def get_aircraft_stats(self, hours: int = 24) -> Dict[str, Any]:
        """Get aircraft statistics for the specified time period."""
        query = """
        SELECT
            COUNT(DISTINCT icao) as unique_aircraft,
            COUNT(*) as total_positions,
            AVG(altitude_ft) as avg_altitude,
            MAX(altitude_ft) as max_altitude,
            COUNT(DISTINCT airline) as airlines_tracked
        FROM aircraft_positions
        WHERE time > NOW() - INTERVAL '%s hours'
        """

        try:
            with self.conn.cursor() as cursor:
                cursor.execute(query, [hours])
                result = cursor.fetchone()
                return {
                    "unique_aircraft": result[0],
                    "total_positions": result[1],
                    "avg_altitude": result[2],
                    "max_altitude": result[3],
                    "airlines_tracked": result[4]
                }
        except Exception as e:
            print(f"✗ Stats query failed: {e}")
            return {}

    def benchmark_query_performance(self):
        """Benchmark query performance vs expected S3 performance."""
        print("\n=== Query Performance Benchmark ===")

        # Test 1: Recent positions query
        start_time = time.time()
        df = self.query_recent_positions(1)  # Last hour
        query_time = time.time() - start_time

        print(".3f")
        print(f"  Records returned: {len(df)}")

        # Test 2: Statistics query
        start_time = time.time()
        stats = self.get_aircraft_stats(24)  # Last 24 hours
        stats_time = time.time() - start_time

        print(".3f")
        print(f"  Stats: {stats}")

        # Test 3: Complex spatial query (aircraft within 50nm)
        spatial_query = """
        SELECT COUNT(*) as nearby_aircraft
        FROM aircraft_positions
        WHERE time > NOW() - INTERVAL '1 hour'
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND sqrt(power(latitude - 41.5, 2) + power(longitude - (-86.7), 2)) * 69 < 50
        """

        start_time = time.time()
        with self.conn.cursor() as cursor:
            cursor.execute(spatial_query)
            nearby_count = cursor.fetchone()[0]
        spatial_time = time.time() - start_time

        print(".3f")
        print(f"  Nearby aircraft: {nearby_count}")

        print("\n=== Performance Comparison ===")
        print("Expected S3 performance:")
        print("  Recent positions: 100-500ms")
        print("  Statistics: 2-5 seconds")
        print("  Spatial queries: 10-30 seconds")
        print("TimescaleDB performance:")
        print(f"  Recent positions: {query_time*1000:.1f}ms")
        print(f"  Statistics: {stats_time*1000:.1f}ms")
        print(f"  Spatial queries: {spatial_time*1000:.1f}ms")

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")


def load_sample_data(file_path: str) -> List[Dict[str, Any]]:
    """Load sample aircraft data from JSON file."""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)

        # Handle both single object and array formats
        if isinstance(data, dict):
            return [data]
        elif isinstance(data, list):
            return data
        else:
            return []
    except Exception as e:
        print(f"✗ Failed to load sample data: {e}")
        return []


def main():
    """Main demonstration function."""
    print("=== TimescaleDB Aircraft Tracking PoC ===\n")

    # Initialize connector
    db = TimescaleDBConnector()

    try:
        # Connect to database
        db.connect()

        # Create schema
        db.create_schema()

        # Load and insert sample data
        sample_files = [
            "piaware_aircraft_log_20251128_1800.json",
            "piaware_aircraft_log_20251201_0600.json"
        ]

        total_records = 0
        for file_path in sample_files:
            try:
                aircraft_data = load_sample_data(file_path)
                if aircraft_data:
                    db.insert_aircraft_data(aircraft_data)
                    total_records += len(aircraft_data)
            except FileNotFoundError:
                print(f"⚠ Sample file {file_path} not found, skipping")

        print(f"\n✓ Total records processed: {total_records}")

        # Run performance benchmarks
        db.benchmark_query_performance()

        # Show sample analytics
        print("\n=== Sample Analytics ===")
        recent_data = db.query_recent_positions(1)
        if not recent_data.empty:
            print("Recent aircraft activity:")
            print(recent_data.head(10)[['time', 'icao', 'flight', 'altitude_ft', 'speed_kt']].to_string())

        stats = db.get_aircraft_stats(24)
        if stats:
            print("
24-hour statistics:")
            for key, value in stats.items():
                print(f"  {key}: {value}")

    except Exception as e:
        print(f"✗ PoC failed: {e}")
        return False

    finally:
        db.close()

    print("\n✓ TimescaleDB PoC completed successfully!")
    return True


if __name__ == "__main__":
    main()