// Test script to verify positions counted per hour over the last 24 hours
const axios = require('axios');

const baseUrl = 'http://localhost:3002';

async function testPositionsPerHour() {
    console.log('Testing /api/position-timeseries-live endpoint for positions per hour over last 24 hours...\n');

    try {
        // Request data for last 24 hours (1440 minutes) with 60-minute resolution (hourly bins)
        const response = await axios.get(`${baseUrl}/api/position-timeseries-live?minutes=1440&resolution=60`);
        const data = response.data;

        console.log(`Received ${data.length} hourly bins`);

        let totalPositions = 0;
        let validBins = 0;
        let maxPositions = 0;
        let minPositions = Infinity;

        // Validate each bin
        for (const bin of data) {
            if (bin.timestamp && typeof bin.positionCount === 'number') {
                totalPositions += bin.positionCount;
                validBins++;
                maxPositions = Math.max(maxPositions, bin.positionCount);
                minPositions = Math.min(minPositions, bin.positionCount);

                // Check timestamp is within last 24 hours
                const binTime = new Date(bin.timestamp).getTime();
                const now = Date.now();
                const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

                if (binTime < twentyFourHoursAgo || binTime > now) {
                    console.log(`Warning: Bin timestamp ${new Date(bin.timestamp).toISOString()} is outside 24h window`);
                }
            } else {
                console.log(`Invalid bin structure:`, bin);
            }
        }

        console.log(`Total positions across all bins: ${totalPositions}`);
        console.log(`Valid hourly bins: ${validBins}`);
        console.log(`Max positions in any hour: ${maxPositions}`);
        console.log(`Min positions in any hour: ${minPositions}`);
        console.log(`Average positions per hour: ${Math.round(totalPositions / validBins)}`);

        if (validBins >= 24 && validBins <= 25) {
            console.log('✓ Expected number of hourly bins (24-25)');
        } else {
            console.log(`⚠ Expected 24-25 bins, got ${validBins}`);
        }

        if (totalPositions > 0) {
            console.log('✓ Positions data is populated');
        } else {
            console.log('⚠ No positions found in the last 24 hours');
            throw new Error('No positions data found');
        }

    } catch (error) {
        console.error(`Error testing positions per hour:`, error.message);
        throw error;
    }
}

testPositionsPerHour().catch(console.error);