const Database = require('better-sqlite3');
const db = new Database('runtime/position-cache.db');

// Check if table exists
const result = db.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get('table', 'positions');
console.log('Positions table schema:');
console.log(result.sql);

// Try the getStats query
const now = Date.now();
const cutoff = now - (24 * 60 * 60 * 1000); // Last 24 hours

console.log('\nTrying getStats query with cutoff:', cutoff);
const getStatsStmt = db.prepare(`
    SELECT
        COUNT(*) as totalPositions,
        COUNT(DISTINCT hex) as uniqueAircraft,
        COUNT(DISTINCT flight) as uniqueFlights,
        COUNT(DISTINCT airline) as uniqueAirlines,
        MAX(timestamp) as lastRefresh
    FROM positions WHERE timestamp >= ?
`);
const stats = getStatsStmt.get(cutoff);
console.log('Stats result:', stats);

db.close();