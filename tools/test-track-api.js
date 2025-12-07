// Test script to verify the track API (/api/aircraft/:icao24)
const axios = require('axios');

const baseUrl = 'http://localhost:3002';

async function getServerUptime() {
    try {
        const response = await axios.get(`${baseUrl}/api/server-status`);
        const uptimeMs = response.data.serverUptimeMs;
        const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${uptimeHours}h ${uptimeMinutes}m`;
    } catch (error) {
        return 'Unknown';
    }
}

async function testTrackAPI() {
    console.log('Testing /api/aircraft/:icao24 (Track API)...\n');

    const uptime = await getServerUptime();
    console.log(`Server Uptime: ${uptime}\n`);

    // Test with a known ICAO24 from the flights data
    const testIcaos = ['a41f0b', 'a76c79', 'a9042a'];

    for (const icao of testIcaos) {
        try {
            console.log(`Testing ICAO24: ${icao}`);
            const response = await axios.get(`${baseUrl}/api/aircraft/${icao}`);
            const data = response.data;

            console.log(`  ✓ Found aircraft: ${data.registration || 'N/A'} (${data.typecode || 'N/A'})`);
            console.log(`    Manufacturer: ${data.manufacturer || 'N/A'}`);
            console.log(`    Model: ${data.model || 'N/A'}`);
            console.log(`    Owner: ${data.owner || 'N/A'}`);
            console.log('');

        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`  ⚠ Aircraft ${icao} not found in database`);
            } else {
                console.log(`  ✗ Error testing ${icao}:`, error.message);
            }
            console.log('');
        }
    }

    // Test with invalid ICAO
    try {
        console.log('Testing invalid ICAO24: invalid');
        await axios.get(`${baseUrl}/api/aircraft/invalid`);
        console.log('  ✗ Should have returned 404 for invalid ICAO');
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log('  ✓ Correctly returned 404 for invalid ICAO');
        } else {
            console.log('  ✗ Unexpected error for invalid ICAO:', error.message);
        }
    }
}

testTrackAPI().catch(console.error);