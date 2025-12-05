#!/usr/bin/env python3
"""
Migration Script: S3 JSON Data to TimescaleDB

This script migrates existing aircraft tracking data from S3 JSON files
to TimescaleDB. It handles:
1. Reading existing JSON files from S3 or local storage
2. Data validation and transformation
3. Batch insertion into TimescaleDB
4. Progress tracking and error handling
5. Duplicate detection and handling

Usage:
    python migrate_to_timescaledb.py --source-dir ./data --batch-size 1000
"""

import json
import os
import glob
import argparse
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import execute_values
import boto3
from botocore.exceptions import ClientError


class S3ToTimescaleDBMigrator:
    """Migrates aircraft data from S3 JSON files to TimescaleDB."""

    def __init__(self, db_host: str = "localhost", db_port: int = 5432,
                 db_name: str = "aircraft_db", db_user: str = "postgres",
                 db_password: str = "password", s3_bucket: Optional[str] = None,
                 s3_prefix: str = "aircraft-data/"):
        self.db_params = {
            "host": db_host,
            "port": db_port,
            "database": db_name,
            "user": db_user,
            "password": db_password
        }
        self.s3_bucket = s3_bucket
        self.s3_prefix = s3_prefix
        self.conn = None
        self.s3_client = None

        if s3_bucket:
            self.s3_client = boto3.client('s3')

    def connect_db(self):
        """Connect to TimescaleDB."""
        try:
            self.conn = psycopg2.connect(**self.db_params)
            self.conn.autocommit = False
            print("✓ Connected to TimescaleDB")
            return True
        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            return False

    def ensure_schema(self):
        """Ensure TimescaleDB schema exists."""
        schema_sql = """
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
            last_seen TIMESTAMPTZ,
            UNIQUE(icao, time)
        );

        SELECT create_hypertable('aircraft_positions', 'time', if_not_exists => TRUE);

        CREATE INDEX IF NOT EXISTS idx_aircraft_positions_icao_time
        ON aircraft_positions (icao, time DESC);

        CREATE INDEX IF NOT EXISTS idx_aircraft_positions_flight_time
        ON aircraft_positions (flight, time DESC) WHERE flight IS NOT NULL;
        """

        try:
            with self.conn.cursor() as cursor:
                cursor.execute(schema_sql)
                self.conn.commit()
                print("✓ Schema verified/created")
                return True
        except Exception as e:
            print(f"✗ Schema creation failed: {e}")
            return False

    def get_s3_files(self) -> List[str]:
        """Get list of JSON files from S3."""
        if not self.s3_client or not self.s3_bucket:
            return []

        try:
            paginator = self.s3_client.get_paginator('list_objects_v2')
            files = []

            for page in paginator.paginate(Bucket=self.s3_bucket, Prefix=self.s3_prefix):
                if 'Contents' in page:
                    for obj in page['Contents']:
                        if obj['Key'].endswith('.json'):
                            files.append(obj['Key'])

            return sorted(files)
        except ClientError as e:
            print(f"✗ S3 list failed: {e}")
            return []

    def get_local_files(self, source_dir: str) -> List[str]:
        """Get list of JSON files from local directory."""
        pattern = os.path.join(source_dir, "**", "*.json")
        return sorted(glob.glob(pattern, recursive=True))

    def load_json_file(self, file_path: str, from_s3: bool = False) -> List[Dict[str, Any]]:
        """Load and parse JSON file."""
        try:
            if from_s3 and self.s3_client and self.s3_bucket:
                # Load from S3
                obj = self.s3_client.get_object(Bucket=self.s3_bucket, Key=file_path)
                content = obj['Body'].read().decode('utf-8')
            else:
                # Load from local file
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

            data = json.loads(content)

            # Handle different JSON formats
            if isinstance(data, dict):
                # Single aircraft object
                return [data]
            elif isinstance(data, list):
                # Array of aircraft objects
                return data
            else:
                print(f"⚠ Unexpected JSON format in {file_path}")
                return []

        except Exception as e:
            print(f"✗ Failed to load {file_path}: {e}")
            return []

    def transform_record(self, record: Dict[str, Any]) -> Optional[tuple]:
        """Transform a single aircraft record for database insertion."""
        try:
            # Parse timestamps with fallbacks
            record_time = self.parse_timestamp(record.get('Position_Time')) or \
                         self.parse_timestamp(record.get('Last_Seen')) or \
                         datetime.now()

            first_seen = self.parse_timestamp(record.get('First_Seen')) or record_time
            last_seen = self.parse_timestamp(record.get('Last_Seen')) or record_time

            # Extract and validate numeric fields
            def safe_int(value):
                try:
                    return int(value) if value is not None else None
                except (ValueError, TypeError):
                    return None

            def safe_float(value):
                try:
                    return float(value) if value is not None else None
                except (ValueError, TypeError):
                    return None

            return (
                record_time,
                str(record.get('ICAO', '')).strip(),
                str(record.get('Ident', '')).strip() or None,
                str(record.get('Airline', '')).strip() or None,
                str(record.get('Registration', '')).strip() or None,
                str(record.get('Aircraft_Type', '')).strip() or None,
                safe_float(record.get('Latitude')),
                safe_float(record.get('Longitude')),
                safe_int(record.get('Altitude_ft')),
                safe_int(record.get('Speed_kt')),
                safe_int(record.get('Vertical_Rate_ft_min')),
                safe_float(record.get('Distance_NM')),
                safe_float(record.get('Heading')),
                safe_int(record.get('Messages')),
                safe_float(record.get('RSSI')),
                safe_float(record.get('Age')),
                str(record.get('Data_Quality', '')).strip() or None,
                first_seen,
                last_seen
            )

        except Exception as e:
            print(f"⚠ Failed to transform record: {e}")
            return None

    def parse_timestamp(self, timestamp_str: Optional[str]) -> Optional[datetime]:
        """Parse timestamp string with multiple format support."""
        if not timestamp_str:
            return None

        formats = [
            '%Y-%m-%dT%H:%M:%S.%fZ',
            '%Y-%m-%dT%H:%M:%SZ',
            '%Y-%m-%d %H:%M:%S',
            '%Y%m%d_%H%M%S'
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(timestamp_str.replace('Z', ''), fmt)
                return dt.replace(tzinfo=None)  # Assume UTC
            except ValueError:
                continue

        return None

    def batch_insert(self, records: List[tuple], batch_size: int = 1000):
        """Insert records in batches."""
        if not records:
            return 0

        insert_sql = """
        INSERT INTO aircraft_positions (
            time, icao, flight, airline, registration, aircraft_type,
            latitude, longitude, altitude_ft, speed_kt, vertical_rate_ft_min,
            distance_nm, heading, messages, rssi, age, data_quality,
            first_seen, last_seen
        ) VALUES %s
        ON CONFLICT (icao, time) DO NOTHING
        """

        total_inserted = 0
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]

            try:
                with self.conn.cursor() as cursor:
                    execute_values(cursor, insert_sql, batch)
                    self.conn.commit()
                    total_inserted += len(batch)
                    print(f"✓ Inserted batch of {len(batch)} records")

            except Exception as e:
                print(f"✗ Batch insert failed: {e}")
                self.conn.rollback()
                # Continue with next batch

        return total_inserted

    def migrate_files(self, files: List[str], from_s3: bool = False,
                     batch_size: int = 1000, max_files: Optional[int] = None):
        """Migrate multiple files to TimescaleDB."""
        total_files = len(files)
        total_records = 0
        total_inserted = 0

        if max_files:
            files = files[:max_files]
            total_files = max_files

        print(f"Starting migration of {total_files} files...")

        for i, file_path in enumerate(files, 1):
            print(f"Processing file {i}/{total_files}: {os.path.basename(file_path)}")

            # Load file data
            records_data = self.load_json_file(file_path, from_s3)
            if not records_data:
                continue

            # Transform records
            transformed_records = []
            for record in records_data:
                transformed = self.transform_record(record)
                if transformed:
                    transformed_records.append(transformed)

            if not transformed_records:
                print(f"⚠ No valid records in {file_path}")
                continue

            # Insert batch
            inserted = self.batch_insert(transformed_records, batch_size)
            total_records += len(records_data)
            total_inserted += inserted

            print(f"  Loaded: {len(records_data)} records, Inserted: {inserted}")

        print("
=== Migration Summary ===")
        print(f"Files processed: {total_files}")
        print(f"Total records processed: {total_records}")
        print(f"Records inserted: {total_inserted}")
        print(".1f")

        return total_inserted

    def validate_migration(self):
        """Validate migration by checking data integrity."""
        print("\n=== Migration Validation ===")

        try:
            with self.conn.cursor() as cursor:
                # Check total records
                cursor.execute("SELECT COUNT(*) FROM aircraft_positions")
                total_count = cursor.fetchone()[0]
                print(f"Total records in database: {total_count}")

                # Check date range
                cursor.execute("""
                    SELECT MIN(time), MAX(time)
                    FROM aircraft_positions
                """)
                min_time, max_time = cursor.fetchone()
                print(f"Date range: {min_time} to {max_time}")

                # Check unique aircraft
                cursor.execute("SELECT COUNT(DISTINCT icao) FROM aircraft_positions")
                unique_icao = cursor.fetchone()[0]
                print(f"Unique aircraft (ICAO): {unique_icao}")

                # Check data completeness
                cursor.execute("""
                    SELECT
                        COUNT(*) as total,
                        COUNT(latitude) as with_lat,
                        COUNT(longitude) as with_lon,
                        COUNT(altitude_ft) as with_altitude,
                        COUNT(speed_kt) as with_speed
                    FROM aircraft_positions
                """)
                completeness = cursor.fetchone()
                print("Data completeness:")
                print(f"  Positions with coordinates: {completeness[1]}/{completeness[0]}")
                print(f"  Positions with altitude: {completeness[2]}/{completeness[0]}")
                print(f"  Positions with speed: {completeness[3]}/{completeness[0]}")

                return True

        except Exception as e:
            print(f"✗ Validation failed: {e}")
            return False

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")


def main():
    parser = argparse.ArgumentParser(description="Migrate aircraft data from S3 JSON to TimescaleDB")
    parser.add_argument("--source-dir", help="Local directory containing JSON files")
    parser.add_argument("--s3-bucket", help="S3 bucket name")
    parser.add_argument("--s3-prefix", default="aircraft-data/", help="S3 key prefix")
    parser.add_argument("--db-host", default="localhost", help="Database host")
    parser.add_argument("--db-port", type=int, default=5432, help="Database port")
    parser.add_argument("--db-name", default="aircraft_db", help="Database name")
    parser.add_argument("--db-user", default="postgres", help="Database user")
    parser.add_argument("--db-password", default="password", help="Database password")
    parser.add_argument("--batch-size", type=int, default=1000, help="Batch size for inserts")
    parser.add_argument("--max-files", type=int, help="Maximum number of files to process")
    parser.add_argument("--validate-only", action="store_true", help="Only run validation")

    args = parser.parse_args()

    # Initialize migrator
    migrator = S3ToTimescaleDBMigrator(
        db_host=args.db_host,
        db_port=args.db_port,
        db_name=args.db_name,
        db_user=args.db_user,
        db_password=args.db_password,
        s3_bucket=args.s3_bucket,
        s3_prefix=args.s3_prefix
    )

    try:
        # Connect to database
        if not migrator.connect_db():
            return False

        # Ensure schema exists
        if not migrator.ensure_schema():
            return False

        if args.validate_only:
            # Only run validation
            return migrator.validate_migration()

        # Get files to migrate
        if args.s3_bucket:
            files = migrator.get_s3_files()
            from_s3 = True
            print(f"Found {len(files)} files in S3 bucket {args.s3_bucket}")
        elif args.source_dir:
            files = migrator.get_local_files(args.source_dir)
            from_s3 = False
            print(f"Found {len(files)} files in local directory {args.source_dir}")
        else:
            print("✗ Must specify either --source-dir or --s3-bucket")
            return False

        if not files:
            print("✗ No files found to migrate")
            return False

        # Perform migration
        total_inserted = migrator.migrate_files(
            files, from_s3, args.batch_size, args.max_files
        )

        # Validate migration
        migrator.validate_migration()

        print(f"\n✓ Migration completed successfully! Inserted {total_inserted} records.")
        return True

    except Exception as e:
        print(f"✗ Migration failed: {e}")
        return False

    finally:
        migrator.close()


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)