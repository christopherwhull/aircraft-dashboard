const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = path.join(__dirname, '..', 'screenshots');

// Check for interactive mode
const isInteractive = process.argv.includes('--interactive');

// Interactive pause function
async function interactivePause(message) {
    if (isInteractive) {
        console.log(`\n⏸️  ${message}`);
        console.log('Press Enter to continue...');
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
    }
}

async function captureHeatmapLeafletPage(page, outputDir) {
    // Set ultra-wide landscape viewport for heatmap page
    await page.setViewport({ width: 3440, height: 1440 }); // Ultra-wide 21:9 aspect ratio

    // Resize browser window to match viewport
    await page.evaluate(() => {
        window.resizeTo(3440, 1440);
    });

    // Set page zoom to 50% for leaflet page (higher than main pages for better layer control visibility)
    await page.evaluate(() => {
        document.body.style.zoom = '0.5';
    });

    // Special handling for heatmap-leaflet page with detailed layer interactions
    console.log('\n=== Opening Leaflet Heatmap Page ===');
    console.log('Navigating to heatmap-leaflet page...');
    await page.goto(`${BASE_URL}/heatmap-leaflet`, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for map to load
    console.log('Leaflet page loaded successfully');

    // Force the map container to fill the full viewport
    await page.evaluate(() => {
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.style.width = '100vw';
            mapContainer.style.height = '100vh';
            mapContainer.style.position = 'fixed';
            mapContainer.style.top = '0';
            mapContainer.style.left = '0';
            mapContainer.style.zIndex = '9999';
        }

        // Also ensure body and html take full viewport
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.documentElement.style.margin = '0';
        document.documentElement.style.padding = '0';
        document.body.style.overflow = 'hidden';
    });

    // Trigger map resize to adapt to new container size
    await page.evaluate(() => {
        if (window.map && typeof window.map.invalidateSize === 'function') {
            window.map.invalidateSize();
        }
    });

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for map to resize

    // Try to center on receiver location
    console.log('Attempting to center on PiAware receiver location...');
    try {
        // Fetch receiver coordinates from API
        const response = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/reception-range?hours=1');
                const data = await res.json();
                return {
                    receiverLat: data.receiverLat,
                    receiverLon: data.receiverLon
                };
            } catch (e) {
                return null;
            }
        });

        if (response && response.receiverLat && response.receiverLon) {
            console.log(`Found receiver at ${response.receiverLat}, ${response.receiverLon}`);
            // Center the map on receiver location
            await page.evaluate((lat, lon) => {
                // The map variable should be available in the page context
                if (typeof map !== 'undefined') {
                    map.setView([lat, lon], 10); // Zoom level 10 for good detail
                    console.log('Map centered on receiver location');
                } else {
                    console.log('Map object not found');
                }
            }, response.receiverLat, response.receiverLon);
        } else {
            console.log('⚠ Could not fetch receiver coordinates from API');
        }
    } catch (e) {
        console.log('⚠ Error centering on receiver location:', e.message);
    }

    await interactivePause('Layers enabled. Adjust map view or settings before capturing VFR + weather + popup state.');

    // Wait for layer control to be ready
    await page.waitForSelector('.leaflet-control-layers-toggle');
    console.log('Layer controls ready');

    // Enable heatmap options
    console.log('Enabling heatmap options...');
    try {
        const showLongTracksCheckbox = await page.$('#show-long-tracks');
        if (showLongTracksCheckbox) {
            const isChecked = await page.evaluate(el => el.checked, showLongTracksCheckbox);
            if (!isChecked) {
                await showLongTracksCheckbox.click();
                console.log('✓ Enabled "Show Long Tracks"');
            }
        }

        const persistOnClickCheckbox = await page.$('#persist-on-click');
        if (persistOnClickCheckbox) {
            const isChecked = await page.evaluate(el => el.checked, persistOnClickCheckbox);
            if (!isChecked) {
                await persistOnClickCheckbox.click();
                console.log('✓ Enabled "Persist track on click"');
            }
        }
    } catch (e) {
        console.log('⚠ Could not enable heatmap options:', e.message);
    }

    // Take screenshot with layers collapsed
    const collapsedPath = path.join(outputDir, 'dashboard-heatmap-leaflet-layers-collapsed.jpg');
    await page.screenshot({ path: collapsedPath, fullPage: true, type: 'jpeg', quality: 90 });
    console.log('✓ Captured layers collapsed state');

    // Click layer control to expand
    console.log('Expanding layer controls...');
    await page.click('.leaflet-control-layers-toggle');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer for expansion

    // Confirm layer control is expanded
    const isExpanded = await page.evaluate(() => {
        const control = document.querySelector('.leaflet-control-layers');
        return control && control.classList.contains('leaflet-control-layers-expanded');
    });

    if (isExpanded) {
        console.log('✓ Layer controls successfully expanded');
    } else {
        console.log('⚠ Layer controls may not be fully expanded');
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Additional wait

    await interactivePause('Layer controls expanded. Adjust settings if needed before capturing collapsed state.');

    // Take screenshot with layers expanded
    const expandedPath = path.join(outputDir, 'dashboard-heatmap-leaflet-layers-expanded.jpg');
    await page.screenshot({ path: expandedPath, fullPage: true, type: 'jpeg', quality: 90 });
    console.log('✓ Captured layers expanded state');

    // Enable VFR Sectional Proxy
    console.log('Enabling VFR Sectional Proxy layer...');
    try {
        const checkboxes = await page.$$('input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            const label = await page.evaluate(el => {
                const container = el.closest('.leaflet-control-layers-selector');
                if (container) {
                    const span = container.querySelector('span');
                    return span ? span.textContent : '';
                }
                return '';
            }, checkbox);

            if (label.includes('VFR Sectional')) {
                await checkbox.click();
                console.log('✓ VFR Sectional Proxy enabled');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for layer to load
                break;
            }
        }
    } catch (e) {
        console.log('⚠ Could not enable VFR Sectional Proxy:', e.message);
    }

    // Enable weather layers (Surface Analysis and Weather Radar)
    console.log('Enabling weather layers...');
    try {
        const checkboxes = await page.$$('input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            const label = await page.evaluate(el => {
                const container = el.closest('.leaflet-control-layers-selector');
                if (container) {
                    const span = container.querySelector('span');
                    return span ? span.textContent : '';
                }
                return '';
            }, checkbox);

            if (label.includes('Surface Analysis') || label.includes('Weather Radar')) {
                await checkbox.click();
                console.log(`✓ Enabled ${label}`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for layer to load
            }
        }
    } catch (e) {
        console.log('⚠ Could not enable weather layers:', e.message);
    }

    // Try to click on an aircraft marker to show popup
    console.log('Selecting aircraft marker...');
    try {
        const markers = await page.$$('.leaflet-marker-icon');
        if (markers.length > 0) {
            await markers[0].click();
            console.log('✓ Clicked on aircraft marker - popup should be visible');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for popup
        } else {
            console.log('⚠ No aircraft markers found on map');
        }
    } catch (e) {
        console.log('⚠ Could not click aircraft marker:', e.message);
    }

    // Take screenshot with VFR and weather enabled + popup
    const vfrWeatherPath = path.join(outputDir, 'dashboard-heatmap-leaflet-vfr-weather-popup.jpg');
    await page.screenshot({ path: vfrWeatherPath, fullPage: true, type: 'jpeg', quality: 90 });
    console.log('✓ Captured VFR + weather + popup state');

    // Switch to IFR Enroute High
    console.log('Switching to IFR Enroute High...');

    await interactivePause('Ready to switch to IFR charts. Make any final adjustments before IFR capture.');
    try {
        // First uncheck VFR if checked
        const checkboxes = await page.$$('input[type="checkbox"]');
        let vfrFound = false;
        for (const checkbox of checkboxes) {
            const label = await page.evaluate(el => {
                const container = el.closest('.leaflet-control-layers-selector');
                if (container) {
                    const span = container.querySelector('span');
                    return span ? span.textContent : '';
                }
                return '';
            }, checkbox);

            if (label.includes('VFR Sectional')) {
                const isChecked = await page.evaluate(el => el.checked, checkbox);
                if (isChecked) {
                    await checkbox.click();
                    console.log('✓ Unchecked VFR Sectional');
                }
                vfrFound = true;
                break;
            }
        }

        // Now enable IFR
        for (const checkbox of checkboxes) {
            const label = await page.evaluate(el => {
                const container = el.closest('.leaflet-control-layers-selector');
                if (container) {
                    const span = container.querySelector('span');
                    return span ? span.textContent : '';
                }
                return '';
            }, checkbox);

            if (label.includes('IFR Enroute High')) {
                await checkbox.click();
                console.log('✓ IFR Enroute High enabled');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for layer to load
                break;
            }
        }
    } catch (e) {
        console.log('⚠ Could not switch to IFR:', e.message);
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for layer to load
    console.log('IFR layer loaded');

    // Take screenshot with IFR
    const ifrPath = path.join(outputDir, 'dashboard-heatmap-leaflet-ifr.jpg');
    await page.screenshot({ path: ifrPath, fullPage: true, type: 'jpeg', quality: 90 });
    console.log('✓ Captured IFR state');
    console.log('=== Leaflet page captures complete ===\n');
}

async function captureDashboardScreenshots() {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: false, // Set to false for debugging
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=3440,1440', // Set browser window size to match ultra-wide viewport
            '--start-maximized=false', // Don't maximize, use custom size
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ],
        defaultViewport: null // Don't use default viewport
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 }); // Landscape: 16:9 aspect ratio

    // Resize browser window to match viewport
    await page.evaluate(() => {
        window.resizeTo(1920, 1080);
    });

    // Set page zoom to 25%
    await page.evaluate(() => {
        document.body.style.zoom = '0.25';
    });

    try {
        console.log('Navigating to dashboard...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

        // Wait for tabs to be loaded
        await page.waitForSelector('.tab-button');

        // Get all tab buttons including special handling for heatmap-leaflet
        const tabs = await page.$$eval('.tab-button', buttons =>
            buttons.map(btn => {
                const onclick = btn.getAttribute('onclick');
                const match = onclick.match(/showTab\('([^']+)'/);
                const id = match ? match[1] : btn.textContent.trim().toLowerCase().replace(/\s+/g, '-');
                return {
                    id: id,
                    text: btn.textContent.trim()
                };
            })
        );

        // Add heatmap-leaflet as an additional "tab" to capture
        tabs.push({ id: 'heatmap-leaflet', text: 'Heatmap Leaflet' });

        console.log(`Found ${tabs.length} tabs:`, tabs.map(t => t.text).join(', '));

        // Capture screenshot for each tab
        for (const tab of tabs) {
            console.log(`Capturing ${tab.text} tab...`);

            if (tab.id === 'heatmap-leaflet') {
                // Special handling for heatmap-leaflet page
                await captureHeatmapLeafletPage(page, OUTPUT_DIR);
                continue;
            }

            // Click the tab button
            await page.click(`button[onclick*="showTab('${tab.id}'"]`);

            // Wait for the tab content to be active
            await page.waitForFunction((tabId) => {
                const content = document.getElementById(`${tabId}-tab`);
                return content && content.classList.contains('active');
            }, {}, tab.id);

            // Wait a bit for any dynamic content to load
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Try to select 24-hour button if available
            try {
                const hour24Button = await page.$(`button[onclick*="${tab.id === 'reception' ? 'loadReceptionRange(24)' : tab.id === 'airlines' ? 'loadAirlineStats(24)' : tab.id === 'positions' ? 'loadUnifiedPositionStats(24)' : tab.id === 'flights' ? 'loadFlights(24)' : tab.id === 'squawk' ? 'loadSquawkTransitions(24)' : ''}"]`);
                if (hour24Button) {
                    await hour24Button.click();
                    console.log(`✓ Selected 24-hour filter for ${tab.text}`);
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds after selecting button
                }
            } catch (e) {
                console.log(`⚠ Could not select 24-hour button for ${tab.text}:`, e.message);
            }

            // Try to sort by airline column if available
            try {
                // Wait for table to be populated (look for table rows)
                await page.waitForFunction(() => {
                    const tables = document.querySelectorAll('table.sortable');
                    for (const table of tables) {
                        const tbody = table.querySelector('tbody');
                        if (tbody && tbody.children.length > 0) {
                            return true;
                        }
                    }
                    return false;
                }, { timeout: 10000 }).catch(() => {}); // Don't fail if no table appears

                const airlineSortHeader = await page.$(`th[data-sort="airline"]`);
                if (airlineSortHeader) {
                    await airlineSortHeader.click();
                    console.log(`✓ Sorted by airline column for ${tab.text}`);
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds after sorting
                }
            } catch (e) {
                console.log(`⚠ Could not sort by airline for ${tab.text}:`, e.message);
            }

            // Take screenshot
            const filename = `dashboard-${tab.id}.jpg`;
            const filepath = path.join(OUTPUT_DIR, filename);
            await page.screenshot({ path: filepath, fullPage: true, type: 'jpeg', quality: 90 });

            console.log(`Saved ${filename}`);
        }

    } catch (error) {
        console.error('Error capturing screenshots:', error);
    } finally {
        await browser.close();
    }

    console.log(`\nScreenshots saved to: ${OUTPUT_DIR}`);
    console.log('Files:');
    fs.readdirSync(OUTPUT_DIR).forEach(file => {
        console.log(`  - ${file}`);
    });
}

// Run if called directly
if (require.main === module) {
    captureDashboardScreenshots().catch(console.error);
}

module.exports = { captureDashboardScreenshots };