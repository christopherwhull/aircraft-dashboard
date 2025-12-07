// Test script to verify the logo server is working
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

async function testLogoEndpoint(endpoint, airlineCode, description) {
    const url = `${baseUrl}${endpoint}/${airlineCode}`;
    console.log(`Testing ${description}: ${url}`);

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // Get binary data
            validateStatus: function (status) {
                return status < 500; // Accept 404 as valid response
            }
        });

        if (response.status === 200) {
            const contentType = response.headers['content-type'];
            const cacheHeader = response.headers['x-cache'];
            const contentLength = response.data.length;

            console.log(`  ✓ Status: ${response.status}`);
            console.log(`    Content-Type: ${contentType}`);
            console.log(`    Content-Length: ${contentLength} bytes`);
            console.log(`    Cache Status: ${cacheHeader || 'N/A'}`);

            // Validate content type
            if (contentType && (contentType.startsWith('image/'))) {
                console.log(`    ✓ Valid image content type`);
            } else {
                console.log(`    ⚠ Unexpected content type: ${contentType}`);
            }

            return true;
        } else if (response.status === 404) {
            console.log(`  ⚠ Status: ${response.status} (Logo not found)`);
            return false;
        } else {
            console.log(`  ✗ Unexpected status: ${response.status}`);
            return false;
        }

    } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
        return false;
    }
}

async function testLogoServer() {
    console.log('Testing Logo Server...\n');

    const uptime = await getServerUptime();
    console.log(`Server Uptime: ${uptime}\n`);

    // Test cases: [airlineCode, expectedToHaveLogo, description]
    const testCases = [
        ['AAA', true, 'Ansett Australia (should have logo)'],
        ['CESSNA', true, 'Cessna (manufacturer logo)'],
        ['SWA', true, 'Southwest Airlines (major carrier)'],
        ['ZZZ', false, 'Non-existent airline (should return 404)'],
        ['AAB', false, 'Abelag Aviation (no logo in database)']
    ];

    let totalTests = 0;
    let successfulTests = 0;

    for (const [airlineCode, shouldHaveLogo, description] of testCases) {
        console.log(`\n--- Testing Airline: ${airlineCode} ---`);

        // Test v1 endpoint
        const v1Success = await testLogoEndpoint('/api/v1logos', airlineCode, `v1 ${description}`);
        totalTests++;
        if (v1Success === shouldHaveLogo) successfulTests++;

        console.log('');

        // Test v2 endpoint
        const v2Success = await testLogoEndpoint('/api/v2logos', airlineCode, `v2 ${description}`);
        totalTests++;
        if (v2Success === shouldHaveLogo) successfulTests++;

        console.log('');
    }

    // Test cache status endpoint
    console.log('--- Testing Cache Status ---');
    try {
        const response = await axios.get(`${baseUrl}/api/cache-status`);
        const cacheData = response.data;

        console.log('✓ Cache status retrieved');
        if (cacheData.logoRequests !== undefined) {
            console.log(`  Logo requests: ${cacheData.logoRequests}`);
            console.log(`  Logo cache hits: ${cacheData.logoCacheHits || 0}`);
            console.log(`  Logo cache misses: ${cacheData.logoCacheMisses || 0}`);
        } else {
            console.log('  Logo cache stats not available');
        }
    } catch (error) {
        console.log(`✗ Cache status error: ${error.message}`);
    }

    console.log(`\n--- Test Summary ---`);
    console.log(`Total tests: ${totalTests}`);
    console.log(`Successful tests: ${successfulTests}`);
    console.log(`Success rate: ${Math.round((successfulTests / totalTests) * 100)}%`);

    if (successfulTests === totalTests) {
        console.log('✅ All logo server tests passed!');
    } else {
        console.log('⚠️ Some logo server tests failed');
        process.exit(1);
    }
}

testLogoServer().catch(console.error);