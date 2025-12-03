// Simple headless capture script using Puppeteer
// Usage: node tools/headless-capture.js <url> [screenshot-path]

const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
    const url = process.argv[2] || 'http://localhost:3002/heatmap-leaflet.html';
    const screenshot = process.argv[3] || 'tools/leaflet-screenshot.png';
    console.log('Opening', url);
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const consoleLogs = [];
    const networkRequests = [];

    page.on('console', msg => {
        try {
            const text = msg.text();
            consoleLogs.push({ type: msg.type(), text });
            console.log(`[PAGE ${msg.type()}] ${text}`);
        } catch (e) {}
    });

    page.on('request', req => {
        networkRequests.push({ url: req.url(), method: req.method(), resourceType: req.resourceType() });
        console.log(`[REQ] ${req.method()} ${req.url()} (${req.resourceType()})`);
    });

    page.on('response', async res => {
        try {
            const url = res.url();
            const status = res.status();
            console.log(`[RES] ${status} ${url}`);
        } catch (e) {}
    });

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        // Wait a bit to allow live polling to run
        await new Promise(r => setTimeout(r, 5000));
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log('Screenshot saved to', screenshot);
    } catch (err) {
        console.error('Error loading page:', err);
    }

    // Save logs to files
    try {
        const logDir = __dirname || 'tools';
        const consolePath = require('path').join(logDir, 'leaflet-console.log');
        const networkPath = require('path').join(logDir, 'leaflet-network.log');
        fs.writeFileSync(consolePath, JSON.stringify(consoleLogs, null, 2));
        fs.writeFileSync(networkPath, JSON.stringify(networkRequests, null, 2));
        console.log('Saved logs to', consolePath, 'and', networkPath);
    } catch (e) {
        console.error('Failed to write logs:', e);
    }

    await browser.close();
})();
