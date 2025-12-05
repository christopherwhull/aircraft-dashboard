#!/usr/bin/env node
// Automated screenshot capture for all AirSquawk tabs
// Usage: node tools/capture-all-screenshots.js

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'aircraft-dashboard.wiki', 'screenshots');
const WAIT_TIME = 5000; // Wait 5 seconds for data to load

// Ensure screenshots directory exists
try {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        console.log('Created directory:', SCREENSHOTS_DIR);
    } else {
        console.log('Screenshots directory exists:', SCREENSHOTS_DIR);
    }
} catch (err) {
    console.error('Error creating directory:', err.message);
    process.exit(1);
}

const screenshots = [
    {
        name: 'main-dashboard.png',
        url: 'http://localhost:3002/',
        description: 'Main dashboard with AirSquawk branding',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 }
    },
    {
        name: 'live-view-tab.png',
        url: 'http://localhost:3002/',
        description: 'Live view tab with aircraft on map',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'live',
        additionalWait: 3000
    },
    {
        name: 'flights-tab.png',
        url: 'http://localhost:3002/',
        description: 'Flights tab with flight list',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'flights',
        additionalWait: 2000
    },
    {
        name: 'positions-tab.png',
        url: 'http://localhost:3002/',
        description: 'Positions tab with raw position data',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'positions',
        additionalWait: 2000
    },
    {
        name: 'airlines-tab.png',
        url: 'http://localhost:3002/',
        description: 'Airlines tab with statistics',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'airlines',
        additionalWait: 2000
    },
    {
        name: 'squawk-tab.png',
        url: 'http://localhost:3002/',
        description: 'Squawk transitions tab',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'squawk',
        additionalWait: 2000
    },
    {
        name: 'reception-tab.png',
        url: 'http://localhost:3002/',
        description: 'Reception coverage tab',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'reception',
        additionalWait: 2000
    },
    {
        name: 'cache-status-tab.png',
        url: 'http://localhost:3002/',
        description: 'Cache status and statistics',
        waitTime: 3000,
        viewport: { width: 1920, height: 1080 },
        clickButton: 'cache',
        additionalWait: 2000
    },
    {
        name: 'heatmap-tab.png',
        url: 'http://localhost:3002/heatmap-leaflet.html',
        description: 'Heatmap with 24h traffic density',
        waitTime: 8000,
        viewport: { width: 1920, height: 1080 },
        evaluate: async (page) => {
            // Try to select 24h time range if possible
            try {
                await page.click('select[id*="time"]');
                await page.select('select[id*="time"]', '24');
                await new Promise(r => setTimeout(r, 3000));
            } catch (e) {
                console.log('Could not set time range, using default');
            }
        }
    },
    {
        name: 'heatmap-with-chart.png',
        url: 'http://localhost:3002/heatmap-leaflet.html',
        description: 'Heatmap with sectional chart overlay',
        waitTime: 8000,
        viewport: { width: 1920, height: 1080 },
        evaluate: async (page) => {
            try {
                // Enable sectional chart
                const chartSelector = 'select[id*="chart"], select[id*="sectional"]';
                await page.click(chartSelector);
                await page.select(chartSelector, 'chicago');
                await new Promise(r => setTimeout(r, 4000));
            } catch (e) {
                console.log('Could not enable sectional chart');
            }
        }
    },
    {
        name: 'heatmap-controls.png',
        url: 'http://localhost:3002/heatmap-leaflet.html',
        description: 'Close-up of heatmap control panel',
        waitTime: 5000,
        viewport: { width: 600, height: 1200 },
        clipArea: { x: 0, y: 0, width: 400, height: 1200 }
    }
];

async function captureScreenshot(browser, config) {
    const page = await browser.newPage();
    
    try {
        console.log(`\n[${config.name}] ${config.description}`);
        console.log(`  URL: ${config.url}`);
        
        // Set viewport
        await page.setViewport(config.viewport);
        
        // Navigate to page
        console.log('  Loading page...');
        await page.goto(config.url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Initial wait
        await new Promise(r => setTimeout(r, config.waitTime));
        
        // Click tab button if needed (using showTab function)
        if (config.clickButton) {
            console.log(`  Clicking tab: ${config.clickButton}`);
            try {
                await page.evaluate((tabName) => {
                    if (typeof showTab === 'function') {
                        showTab(tabName);
                    } else {
                        console.error('showTab function not available');
                    }
                }, config.clickButton);
                await new Promise(r => setTimeout(r, config.additionalWait || 2000));
            } catch (e) {
                console.log(`  Warning: Could not activate tab ${config.clickButton}:`, e.message);
            }
        }
        
        // Run custom evaluation if provided
        if (config.evaluate) {
            console.log('  Running custom page evaluation...');
            await config.evaluate(page);
        }
        
        // Take screenshot
        const screenshotPath = path.join(SCREENSHOTS_DIR, config.name);
        const screenshotOptions = { 
            path: screenshotPath,
            fullPage: !config.clipArea
        };
        
        if (config.clipArea) {
            screenshotOptions.clip = config.clipArea;
        }
        
        console.log('  Capturing screenshot...');
        await page.screenshot(screenshotOptions);
        console.log(`  ✓ Saved: ${screenshotPath}`);
        
        return true;
    } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        return false;
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('=== AirSquawk Automated Screenshot Capture ===\n');
    console.log(`Screenshots will be saved to: ${SCREENSHOTS_DIR}\n`);
    console.log(`Total screenshots to capture: ${screenshots.length}\n`);
    
    // Check if server is running
    try {
        const http = require('http');
        await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:3002/api/health', (res) => {
                if (res.statusCode === 200) {
                    console.log('✓ Server is running\n');
                    resolve();
                } else {
                    reject(new Error(`Server returned status ${res.statusCode}`));
                }
            });
            req.on('error', reject);
            req.setTimeout(5000, () => reject(new Error('Timeout')));
        });
    } catch (error) {
        console.error('✗ Server is not running on http://localhost:3002');
        console.error('  Please start the server first: npm start');
        process.exit(1);
    }
    
    // Launch browser
    console.log('Launching browser...\n');
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    let successCount = 0;
    let failCount = 0;
    
    // Capture all screenshots
    for (let i = 0; i < screenshots.length; i++) {
        const config = screenshots[i];
        console.log(`\n[${i + 1}/${screenshots.length}] Capturing ${config.name}...`);
        
        const success = await captureScreenshot(browser, config);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
        
        // Small delay between captures
        await new Promise(r => setTimeout(r, 1000));
    }
    
    await browser.close();
    
    console.log('\n=== Capture Complete ===');
    console.log(`✓ Success: ${successCount}`);
    console.log(`✗ Failed: ${failCount}`);
    console.log(`\nScreenshots saved to: ${SCREENSHOTS_DIR}`);
    
    // List captured files
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log(`\nCaptured files (${files.length}):`);
    files.forEach(f => {
        const stats = fs.statSync(path.join(SCREENSHOTS_DIR, f));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`  - ${f} (${sizeMB} MB)`);
    });
    
    console.log('\n=== Next Steps ===');
    console.log('To upload screenshots to the wiki:');
    console.log('  cd aircraft-dashboard.wiki');
    console.log('  git add screenshots/*.png');
    console.log('  git commit -m "docs: add automated screenshots for all tabs"');
    console.log('  git push');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
