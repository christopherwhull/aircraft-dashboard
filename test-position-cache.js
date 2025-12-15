const PositionCache = require('./lib/position-cache');
const AWS = require('aws-sdk');

// Mock S3
const s3 = new AWS.S3();

try {
    console.log('Creating PositionCache...');
    const positionCache = new PositionCache(s3, { read: 'test', write: 'test' });
    console.log('PositionCache created successfully');

    // Check database contents
    console.log('Checking database...');
    const count = positionCache.db.prepare('SELECT COUNT(*) as count FROM positions').get();
    console.log('Total positions in DB:', count.count);

    console.log('Testing individual queries...');
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    console.log('Cutoff:', cutoff);

    const statsResult = positionCache.getStatsStmt.get(cutoff);
    console.log('Stats query result:', statsResult);

    const oldest = positionCache.db.prepare('SELECT MIN(timestamp) as oldest FROM positions WHERE timestamp >= ?').get(cutoff);
    console.log('Oldest query result:', oldest);

    console.log('Calling getStats...');
    const fullStats = positionCache.getStats();
    console.log('getStats result:', fullStats);

} catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
}