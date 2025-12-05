#!/usr/bin/env node
// Capture heatmap screenshots specifically
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'aircraft-dashboard.wiki', 'screenshots');

async function captureHeatmaps() {
    console.log('=== Heatmap Screenshot Capture ===\n');
    
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // 1. Heatmap with 24h data
    console.log('[1/3] Capturing heatmap-tab.png...');
    let page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3002/heatmap-leaflet.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'heatmap-tab.png'), fullPage: false });
    console.log('  ✓ Saved heatmap-tab.png');
    await page.close();
    
    // 2. Heatmap with sectional chart
    console.log('[2/3] Capturing heatmap-with-chart.png...');
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3002/heatmap-leaflet.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    
    // Try to enable sectional chart
    try {
        await page.evaluate(() => {
            const chartSelect = document.querySelector('#chart-selector');
            if (chartSelect) {
                chartSelect.value = 'chicago';
                chartSelect.dispatchEvent(new Event('change'));
            }
        });
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        console.log('  Note: Could not enable chart overlay');
    }
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'heatmap-with-chart.png'), fullPage: false });
    console.log('  ✓ Saved heatmap-with-chart.png');
    await page.close();
    
    // 3. Control panel close-up
    console.log('[3/3] Capturing heatmap-controls.png...');
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3002/heatmap-leaflet.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, 'heatmap-controls.png'),
        clip: { x: 0, y: 0, width: 400, height: 900 }
    });
    console.log('  ✓ Saved heatmap-controls.png');
    await page.close();
    
    await browser.close();
    console.log('\n✓ All heatmap screenshots captured!');
}

captureHeatmaps().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
