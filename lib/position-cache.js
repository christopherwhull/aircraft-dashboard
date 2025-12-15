const { listS3Files, downloadAndParseS3File } = require('./s3-helpers');
const Database = require('better-sqlite3');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');

/**
 * Position Cache Manager
 * Maintains a SQLite database cache of all position data for the last 7 days
 * Refreshes periodically in the background
 */
class PositionCache {
    constructor(s3, buckets = {}, options = {}) {
        this.s3 = s3;
        this.readBucket = buckets.read || 'aircraft-data';
        this.writeBucket = buckets.write || 'aircraft-data-new';
        
        // SQLite database
        const dbPath = path.join(__dirname, '..', 'runtime', 'position-cache.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        
        // Enable WAL mode for better concurrent access
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = 1000');
        this.db.pragma('temp_store = memory');
        
        // Create tables
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hex TEXT NOT NULL,
                flight TEXT,
                lat REAL,
                lon REAL,
                alt REAL,
                gs REAL,
                track REAL,
                timestamp INTEGER NOT NULL,
                registration TEXT,
                aircraft_type TEXT,
                airline TEXT,
                squawk TEXT,
                rssi REAL
            );
            CREATE INDEX IF NOT EXISTS idx_hex_timestamp ON positions(hex, timestamp);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON positions(timestamp);
        `);
        
        // Prepared statements
        this.insertStmt = this.db.prepare(`
            INSERT INTO positions (hex, flight, lat, lon, alt, gs, track, timestamp, registration, aircraft_type, airline, squawk, rssi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        this.getPositionsStmt = this.db.prepare(`
            SELECT * FROM positions WHERE timestamp >= ? ORDER BY timestamp DESC
        `);
        
        this.getAircraftPositionsStmt = this.db.prepare(`
            SELECT * FROM positions WHERE hex = ? AND timestamp >= ? ORDER BY timestamp DESC
        `);
        
        this.getStatsStmt = this.db.prepare(`
            SELECT 
                COUNT(*) as totalPositions,
                COUNT(DISTINCT hex) as uniqueAircraft,
                COUNT(DISTINCT flight) as uniqueFlights,
                COUNT(DISTINCT airline) as uniqueAirlines,
                MAX(timestamp) as lastRefresh
            FROM positions WHERE timestamp >= ?
        `);
        
        this.cleanupStmt = this.db.prepare(`
            DELETE FROM positions WHERE timestamp < ?
        `);
        
        // Cache metadata
        this.lastRefresh = 0;
        this.refreshInterval = 5 * 60 * 1000; // 5 minutes
        this.isRefreshing = false;
        this.isInitialLoad = true;
        
        // Retention
        this.retentionMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        // Callback when cache is fully loaded
        this.onLoadComplete = options.onLoadComplete || null;
        
        // Whether this instance should load from S3 in background
        this.isBackgroundLoader = options.isBackgroundLoader || false;
        
        // Start background refresh only if this is the designated loader
        if (this.isBackgroundLoader) {
            this._startBackgroundRefresh();
        }
    }
    
    /**
     * Load all position data from S3 for the last 7 days
     */
    async loadAllPositions() {
        if (this.isRefreshing) {
            logger.info('[PositionCache] Already refreshing, skipping...');
            return this.positions;
        }
        
        this.isRefreshing = true;
        const startTime = Date.now();
        
        try {
            const now = Date.now();
            const cutoff = now - this.retentionMs;
            
            logger.info(`[PositionCache] Loading positions from last 7 days (cutoff: ${new Date(cutoff).toISOString()})`);
            
            const allPositions = [];
            
            // Load from both buckets
            for (const bucket of [this.readBucket, this.writeBucket]) {
                try {
                    // Load minute files first page (most recent files)
                    const s3Files = await listS3Files(this.s3, bucket, 'data/piaware_aircraft_log', 1000, 10);
                    
                    const minuteFiles = (s3Files || [])
                        .filter(f => f.Key && f.Key.includes('piaware_aircraft_log'))
                        .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
                    
                    logger.info(`[PositionCache] Processing ${minuteFiles.length} minute files from ${bucket}`);
                    
                    for (const file of minuteFiles) {
                        try {
                            const data = await downloadAndParseS3File(this.s3, bucket, file.Key);
                            // Extract aircraft array from {aircraft: [...]} structure
                            const records = data?.aircraft || (Array.isArray(data) ? data : []);
                            if (!Array.isArray(records) || records.length === 0) continue;
                            
                            for (const rec of records) {
                                if (!rec.lat || !rec.lon || typeof rec.lat !== 'number' || typeof rec.lon !== 'number') continue;
                                
                                // Use timestamp from record or file modification time
                                let timestamp = rec.timestamp;
                                if (typeof timestamp === 'string') {
                                    timestamp = new Date(timestamp).getTime();
                                } else if (typeof timestamp !== 'number') {
                                    timestamp = new Date(file.LastModified).getTime();
                                }
                                
                                // Filter by age
                                if (timestamp < cutoff) continue;
                                
                                allPositions.push({
                                    hex: rec.hex || rec.ICAO,
                                    callsign: rec.callsign || rec.flight || '',
                                    lat: rec.lat,
                                    lon: rec.lon,
                                    alt: rec.alt || rec.altitude || 0,
                                    gs: rec.gs || rec.ground_speed || 0,
                                    timestamp: timestamp,
                                    rssi: rec.rssi || null,
                                    squawk: rec.squawk || null
                                });
                            }
                        } catch (err) {
                            logger.error(`[PositionCache] Error processing ${file.Key}: ${err.message}`);
                        }
                    }
                } catch (err) {
                    logger.error(`[PositionCache] Error loading from bucket ${bucket}: ${err.message}`);
                }
            }
            
            // Insert positions into database
            const insertMany = this.db.transaction((positions) => {
                for (const pos of positions) {
                    this.insertStmt.run(
                        pos.hex,
                        pos.callsign,
                        pos.lat,
                        pos.lon,
                        pos.alt,
                        pos.gs,
                        0, // track
                        pos.timestamp,
                        '', // registration
                        '', // aircraft_type
                        '', // airline
                        pos.squawk || '',
                        pos.rssi || 0
                    );
                }
            });
            
            insertMany(allPositions);
            
            this.lastRefresh = now;
            
            const duration = Date.now() - startTime;
            const count = this.db.prepare('SELECT COUNT(*) as count FROM positions').get().count;
            logger.info(`[PositionCache] Loaded ${count} positions in ${duration}ms`);
            
            // Trigger callback if this is initial load and callback exists
            if (this.isInitialLoad && this.onLoadComplete) {
                this.isInitialLoad = false;
                logger.info('[PositionCache] Triggering onLoadComplete callback...');
                try {
                    const positions = this.getPositions();
                    this.onLoadComplete(positions);
                } catch (err) {
                    logger.error('[PositionCache] Error in onLoadComplete callback:', err);
                }
            }
            
            return this.getPositions();
        } catch (err) {
            logger.error(`[PositionCache] Error loading positions: ${err.message}`, err);
            return this.getPositions(); // Return existing cache on error
        } finally {
            this.isRefreshing = false;
        }
    }
    
    /**
     * Get all positions (from cache)
     */
    getPositions(filterFn = null) {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
        const rows = this.getPositionsStmt.all(cutoff);
        let positions = rows.map(row => ({
            hex: row.hex,
            flight: row.flight,
            lat: row.lat,
            lon: row.lon,
            alt: row.alt,
            gs: row.gs,
            track: row.track,
            timestamp: row.timestamp,
            registration: row.registration,
            aircraft_type: row.aircraft_type,
            airline: row.airline,
            squawk: row.squawk,
            rssi: row.rssi
        }));
        if (filterFn) {
            positions = positions.filter(filterFn);
        }
        return positions;
    }
    
    /**
     * Get positions for a specific aircraft
     */
    getAircraftPositions(hex) {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
        const rows = this.getAircraftPositionsStmt.all(hex, cutoff);
        return rows.map(row => ({
            hex: row.hex,
            flight: row.flight,
            lat: row.lat,
            lon: row.lon,
            alt: row.alt,
            gs: row.gs,
            track: row.track,
            timestamp: row.timestamp,
            registration: row.registration,
            aircraft_type: row.aircraft_type,
            airline: row.airline,
            squawk: row.squawk,
            rssi: row.rssi
        }));
    }
    
    /**
     * Get positions within a time window
     */
    getPositionsByTimeWindow(hours) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const rows = this.getPositionsStmt.all(cutoff);
        return rows.map(row => ({
            hex: row.hex,
            flight: row.flight,
            lat: row.lat,
            lon: row.lon,
            alt: row.alt,
            gs: row.gs,
            track: row.track,
            timestamp: row.timestamp,
            registration: row.registration,
            aircraft_type: row.aircraft_type,
            airline: row.airline,
            squawk: row.squawk,
            rssi: row.rssi
        }));
    }
    
    /**
     * Get positions within a geographic bounding box
     */
    getPositionsByBounds(minLat, maxLat, minLon, maxLon) {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
        const stmt = this.db.prepare(`
            SELECT * FROM positions 
            WHERE timestamp >= ? AND lat >= ? AND lat <= ? AND lon >= ? AND lon <= ?
        `);
        const rows = stmt.all(cutoff, minLat, maxLat, minLon, maxLon);
        return rows.map(row => ({
            hex: row.hex,
            flight: row.flight,
            lat: row.lat,
            lon: row.lon,
            alt: row.alt,
            gs: row.gs,
            track: row.track,
            timestamp: row.timestamp,
            registration: row.registration,
            aircraft_type: row.aircraft_type,
            airline: row.airline,
            squawk: row.squawk,
            rssi: row.rssi
        }));
    }
    
    /**
     * Add a new position to the cache
     */
    addPosition(position) {
        // Validate position data
        if (!position || !position.hex || !position.lat || !position.lon) {
            return false;
        }
        
        // Ensure timestamp is a number
        let timestamp = position.timestamp;
        if (typeof timestamp === 'string') {
            timestamp = new Date(timestamp).getTime();
        }
        if (!timestamp || isNaN(timestamp)) {
            timestamp = Date.now();
        }
        
        // Check if position is within retention window
        const cutoff = Date.now() - this.retentionMs;
        if (timestamp < cutoff) {
            return false; // Too old, don't add
        }
        
        // Check for duplicate position (same hex, lat, lon, alt within 5 second window)
        const duplicateCheck = this.db.prepare(`
            SELECT id FROM positions 
            WHERE hex = ? AND lat = ? AND lon = ? AND alt = ? 
            AND timestamp BETWEEN ? AND ?
        `).get(
            position.hex,
            position.lat,
            position.lon,
            position.alt || position.alt_baro || 0,
            timestamp - 5000, // 5 seconds before
            timestamp + 5000  // 5 seconds after
        );
        
        if (duplicateCheck) {
            return false; // Duplicate found, don't add
        }
        
        // Insert into database
        try {
            this.insertStmt.run(
                position.hex,
                position.flight || position.callsign || '',
                position.lat,
                position.lon,
                position.alt || position.alt_baro || 0,
                position.gs || 0,
                position.track || 0,
                timestamp,
                position.registration || '',
                position.aircraft_type || '',
                position.airline || '',
                position.squawk || '',
                position.rssi || 0
            );
            
            // Cleanup old positions
            this._cleanupOldPositions();
            
            return true;
        } catch (error) {
            logger.error('Error adding position to cache:', error);
            return false;
        }
    }
    
    /**
     * Remove positions older than retention period
     */
    _cleanupOldPositions() {
        const cutoff = Date.now() - this.retentionMs;
        this.cleanupStmt.run(cutoff);
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        console.log('PositionCache.getStats() called');
        const now = Date.now();
        const cutoff = now - (24 * 60 * 60 * 1000); // Last 24 hours for stats
        
        const stats = this.getStatsStmt.get(cutoff);
        
        // Get oldest position
        const oldest = this.db.prepare('SELECT MIN(timestamp) as oldest FROM positions WHERE timestamp >= ?').get(cutoff);
        const oldestAge = oldest.oldest ? now - oldest.oldest : 0;
        
        // Count unique flights and airlines
        // Use the value from stats query instead of separate query to avoid SQLite issues
        const uniqueFlights = stats.uniqueFlights;
        
        // Get airlines directly
        const airlineResults = this.db.prepare('SELECT DISTINCT substr(flight, 1, 3) as airline FROM positions WHERE timestamp >= ? AND flight IS NOT NULL AND length(flight) >= 3 AND flight NOT LIKE \'N%\'').all(cutoff);
        const airlines = new Set(airlineResults.map(r => r.airline.toUpperCase()));
        
        return {
            totalPositions: stats.totalPositions,
            uniqueAircraft: stats.uniqueAircraft,
            uniqueFlights: uniqueFlights,
            uniqueAirlines: airlines.size,
            oldestPositionAge: oldestAge,
            oldestPositionDate: oldest.oldest ? new Date(oldest.oldest).toISOString() : 'N/A',
            lastRefresh: new Date(this.lastRefresh).toISOString(),
            cacheMemoryMb: '0.00' // Not applicable for SQLite
        };
    }
    
    /**
     * Start background refresh
     */
    _startBackgroundRefresh() {
        setInterval(async () => {
            try {
                logger.debug('[PositionCache] Background refresh starting...');
                await this.loadAllPositions();
                logger.debug('[PositionCache] Background refresh completed');
            } catch (err) {
                logger.error('[PositionCache] Background refresh error:', err.message);
            }
        }, this.refreshInterval);
        
        // Initial load
        this.loadAllPositions().catch(err => logger.error('[PositionCache] Initial load error:', err.message));
    }
    
    /**
     * Force immediate refresh
     */
    async refresh() {
        return this.loadAllPositions();
    }
    
    /**
     * Clear cache
     */
    clear() {
        this.db.exec('DELETE FROM positions');
        logger.info('[PositionCache] Cache cleared');
    }

    /**
     * Check if the cache is ready (database initialized)
     */
    isReady() {
        return true; // SQLite database is ready immediately after construction
    }
}

module.exports = PositionCache;
