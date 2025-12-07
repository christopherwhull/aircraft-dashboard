// Test script to verify all SVG aircraft icons exist
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

function extractIconMappings(htmlContent) {
    const icons = new Set();

    // Extract TypeDesignatorIcons
    const typeDesignatorMatch = htmlContent.match(/const TypeDesignatorIcons = \{([\s\S]*?)\};/);
    if (typeDesignatorMatch) {
        const content = typeDesignatorMatch[1];
        const iconMatches = content.match(/'[^']+':\s*'([^']+)'/g);
        if (iconMatches) {
            iconMatches.forEach(match => {
                const icon = match.match(/'[^']+':\s*'([^']+)'/)[1];
                icons.add(icon);
            });
        }
    }

    // Extract CategoryIcons
    const categoryMatch = htmlContent.match(/const CategoryIcons = \{([\s\S]*?)\};/);
    if (categoryMatch) {
        const content = categoryMatch[1];
        const iconMatches = content.match(/'[^']+':\s*'([^']+)'/g);
        if (iconMatches) {
            iconMatches.forEach(match => {
                const icon = match.match(/'[^']+':\s*'([^']+)'/)[1];
                icons.add(icon);
            });
        }
    }

    // Extract TypeDescriptionIcons
    const typeDescMatch = htmlContent.match(/const TypeDescriptionIcons = \{([\s\S]*?)\};/);
    if (typeDescMatch) {
        const content = typeDescMatch[1];
        const iconMatches = content.match(/'[^']+':\s*'([^']+)'/g);
        if (iconMatches) {
            iconMatches.forEach(match => {
                const icon = match.match(/'[^']+':\s*'([^']+)'/)[1];
                icons.add(icon);
            });
        }
    }

    // Add the default aircraft icon
    icons.add('aircraft');

    return icons;
}

async function testSvgIcons() {
    console.log('Testing SVG Aircraft Icons...\n');

    const uptime = await getServerUptime();
    console.log(`Server Uptime: ${uptime}\n`);

    // Read the HTML file to extract icon mappings
    const htmlPath = path.join(__dirname, '..', 'public', 'heatmap-leaflet.html');
    let htmlContent;
    try {
        htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
        console.log(`❌ Error reading HTML file: ${error.message}`);
        return;
    }

    // Extract all icon names from mappings
    const requiredIcons = extractIconMappings(htmlContent);
    console.log(`Found ${requiredIcons.size} unique icon references in mappings:`);
    Array.from(requiredIcons).sort().forEach(icon => console.log(`  - ${icon}`));
    console.log('');

    // Check which SVG files exist
    const iconsDir = path.join(__dirname, '..', 'public', 'icons');
    const existingSvgs = new Set();

    if (!fs.existsSync(iconsDir)) {
        console.log(`❌ Icons directory not found: ${iconsDir}`);
        return;
    }

    const files = fs.readdirSync(iconsDir);
    files.forEach(file => {
        if (file.endsWith('.svg')) {
            existingSvgs.add(file.replace('.svg', ''));
        }
    });

    console.log(`Found ${existingSvgs.size} SVG files in /public/icons/:`);
    Array.from(existingSvgs).sort().forEach(svg => console.log(`  - ${svg}.svg`));
    console.log('');

    // Check for missing icons
    const missingIcons = [];
    const extraIcons = [];

    requiredIcons.forEach(icon => {
        if (!existingSvgs.has(icon)) {
            missingIcons.push(icon);
        }
    });

    existingSvgs.forEach(svg => {
        if (!requiredIcons.has(svg)) {
            extraIcons.push(svg);
        }
    });

    // Report results
    if (missingIcons.length === 0) {
        console.log('✅ All required SVG icons exist!');
    } else {
        console.log('❌ Missing SVG icons:');
        missingIcons.forEach(icon => console.log(`  - ${icon}.svg`));
    }

    if (extraIcons.length > 0) {
        console.log('\nℹ️  Extra SVG icons (not referenced in mappings):');
        extraIcons.forEach(icon => console.log(`  - ${icon}.svg`));
    }

    // Test that icons are accessible via HTTP
    console.log('\n--- Testing HTTP Accessibility ---');
    const axios = require('axios');
    let httpTests = 0;
    let httpSuccess = 0;

    for (const icon of requiredIcons) {
        try {
            const response = await axios.get(`${baseUrl}/icons/${icon}.svg`, {
                timeout: 5000,
                validateStatus: function (status) {
                    return status < 500; // Accept any non-server error
                }
            });

            if (response.status === 200) {
                httpSuccess++;
                console.log(`  ✅ ${icon}.svg - ${response.headers['content-type']}`);
            } else {
                console.log(`  ❌ ${icon}.svg - HTTP ${response.status}`);
            }
        } catch (error) {
            console.log(`  ❌ ${icon}.svg - ${error.message}`);
        }
        httpTests++;
    }

    console.log(`\n--- HTTP Test Summary ---`);
    console.log(`HTTP accessible: ${httpSuccess}/${httpTests}`);

    if (missingIcons.length === 0 && httpSuccess === httpTests) {
        console.log('🎉 All SVG aircraft icons are working perfectly!');
        return true;
    } else {
        console.log('⚠️  Some SVG aircraft icons have issues');
        return false;
    }
}

// Run the test
testSvgIcons().then(success => {
    if (!success) {
        process.exit(1);
    }
}).catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
});