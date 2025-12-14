// Performance test script to compare S3-based vs TSDB-based squawk transitions APIs
const axios = require('axios');

const baseUrl = 'http://localhost:3002';

async function testAPI(apiName, endpoint, hours) {
    const startTime = Date.now();
    try {
        const response = await axios.get(`${baseUrl}${endpoint}?hours=${hours}`, { timeout: 30000 });
        const endTime = Date.now();
        const duration = endTime - startTime;

        const data = response.data;
        const recordCount = data.transitions ? data.transitions.length : 0;
        const totalTransitions = data.totalTransitions || 0;

        return {
            api: apiName,
            hours,
            duration,
            recordCount,
            totalTransitions,
            status: 'success',
            error: null
        };
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        return {
            api: apiName,
            hours,
            duration,
            recordCount: 0,
            totalTransitions: 0,
            status: 'error',
            error: error.message
        };
    }
}

async function runPerformanceTest() {
    console.log('🚀 Performance Test: S3-based vs TSDB-based Squawk Transitions APIs\n');
    console.log('Testing time frames: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24 hours\n');

    const timeFrames = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    const results = [];

    console.log('┌──────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐');
    console.log('│ Hours│    S3 API   │  TSDB API   │   S3 Recs   │ TSDB Recs   │   Winner    │');
    console.log('├──────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤');

    for (const hours of timeFrames) {
        // Test both APIs in parallel
        const [s3Result, tsdbResult] = await Promise.all([
            testAPI('S3', '/api/squawk-transitions', hours),
            testAPI('TSDB', '/api/squawk-transitions-tsdb', hours)
        ]);

        results.push({ hours, s3: s3Result, tsdb: tsdbResult });

        // Format duration
        const s3Duration = s3Result.status === 'success' ? `${s3Result.duration}ms` : 'ERROR';
        const tsdbDuration = tsdbResult.status === 'success' ? `${tsdbResult.duration}ms` : 'ERROR';

        // Determine winner (lower duration wins, but only if both succeeded)
        let winner = '-';
        if (s3Result.status === 'success' && tsdbResult.status === 'success') {
            if (s3Result.duration < tsdbResult.duration) {
                winner = 'S3';
            } else if (tsdbResult.duration < s3Result.duration) {
                winner = 'TSDB';
            } else {
                winner = 'TIE';
            }
        } else if (s3Result.status === 'success') {
            winner = 'S3';
        } else if (tsdbResult.status === 'success') {
            winner = 'TSDB';
        }

        console.log(`│ ${hours.toString().padStart(4)} │ ${s3Duration.padStart(11)} │ ${tsdbDuration.padStart(11)} │ ${s3Result.recordCount.toString().padStart(11)} │ ${tsdbResult.recordCount.toString().padStart(11)} │ ${winner.padStart(11)} │`);
    }

    console.log('└──────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘\n');

    // Summary statistics
    const s3Success = results.filter(r => r.s3.status === 'success');
    const tsdbSuccess = results.filter(r => r.tsdb.status === 'success');

    const s3AvgDuration = s3Success.length > 0 ? s3Success.reduce((sum, r) => sum + r.s3.duration, 0) / s3Success.length : 0;
    const tsdbAvgDuration = tsdbSuccess.length > 0 ? tsdbSuccess.reduce((sum, r) => sum + r.tsdb.duration, 0) / tsdbSuccess.length : 0;

    const s3TotalRecords = s3Success.reduce((sum, r) => sum + r.s3.recordCount, 0);
    const tsdbTotalRecords = tsdbSuccess.reduce((sum, r) => sum + r.tsdb.recordCount, 0);

    console.log('📊 Summary Statistics:');
    console.log(`   S3 API:   ${s3Success.length}/12 successful, avg ${(s3AvgDuration).toFixed(0)}ms, ${s3TotalRecords} total records`);
    console.log(`   TSDB API: ${tsdbSuccess.length}/12 successful, avg ${(tsdbAvgDuration).toFixed(0)}ms, ${tsdbTotalRecords} total records`);

    if (s3Success.length > 0 && tsdbSuccess.length > 0) {
        const s3Wins = results.filter(r => r.s3.status === 'success' && r.tsdb.status === 'success' && r.s3.duration < r.tsdb.duration).length;
        const tsdbWins = results.filter(r => r.s3.status === 'success' && r.tsdb.status === 'success' && r.tsdb.duration < r.s3.duration).length;
        const ties = results.filter(r => r.s3.status === 'success' && r.tsdb.status === 'success' && r.s3.duration === r.tsdb.duration).length;

        console.log(`   Performance: S3 wins ${s3Wins}, TSDB wins ${tsdbWins}, Ties ${ties}`);
    }

    console.log('\n📋 Notes:');
    console.log('   - S3 API processes historical data from S3 storage');
    console.log('   - TSDB API uses InfluxDB SQL queries (currently returns informative error)');
    console.log('   - Times include network latency and server processing');
    console.log('   - Tests run with 30-second timeout');

    // Show any errors
    const errors = results.filter(r => r.s3.status === 'error' || r.tsdb.status === 'error');
    if (errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        errors.forEach(error => {
            if (error.s3.status === 'error') {
                console.log(`   S3 API (${error.hours}h): ${error.s3.error}`);
            }
            if (error.tsdb.status === 'error') {
                console.log(`   TSDB API (${error.hours}h): ${error.tsdb.error}`);
            }
        });
    }
}

// Run the performance test
runPerformanceTest().catch(console.error);