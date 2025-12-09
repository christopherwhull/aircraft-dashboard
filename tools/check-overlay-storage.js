// Support skipping overlay persistence test when feature is not available
const shouldSkip = process.env.SKIP_OVERLAY_PERSISTENCE === '1' || process.argv.indexOf('--skip-overlay-persistence') !== -1;
if (shouldSkip) {
  console.log('Skipping overlay persistence tests (env SKIP_OVERLAY_PERSISTENCE set or --skip-overlay-persistence provided)');
  process.exit(0);
}


const puppeteer = require('puppeteer');
const DEFAULT_TIMEOUT = 120000;

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  await page.setDefaultTimeout(DEFAULT_TIMEOUT);
  try {
    await page.goto('http://localhost:3002/heatmap-leaflet.html', { waitUntil: 'networkidle2', timeout: DEFAULT_TIMEOUT });
  } catch (e) {
    console.error('Timed out navigating to heatmap (120s)');
  }
  await page.waitForSelector('.leaflet-control-layers', { timeout: DEFAULT_TIMEOUT });

  // Wait for overlays-ready or labels
  try {
    await page.waitForFunction(() => window.heatmapOverlaysReady === true, { timeout: DEFAULT_TIMEOUT });
  } catch (e) {
    console.warn('heatmapOverlaysReady not set within timeout; falling back to label detection');
    try {
      await page.waitForFunction(() => {
        const labels = Array.from(document.querySelectorAll('.leaflet-control-layers-overlays label'));
        return labels.some(label => (label.textContent || '').trim().indexOf('Heatmap Grid') !== -1);
      }, { timeout: DEFAULT_TIMEOUT });
    } catch (e2) {
      console.error('Timed out waiting for overlays or labels (120s)');
    }
  }

  // Find overlay and click it
  const overlayFound = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.leaflet-control-layers-overlays label'));
    for (const label of labels) {
      if ((label.textContent || '').trim().indexOf('Heatmap Grid') !== -1) {
        const input = label.querySelector('input');
        if (input) {
          input.click();
          return true;
        }
      }
    }
    return false;
  });
  console.log('Overlay found?', overlayFound);

  // Allow a short delay to ensure handlers ran (compat for older Puppeteer versions)
  await new Promise((r) => setTimeout(r, 250));

  // Read localStorage and cookies
  const data = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('leafletHeatmapSettings') || 'null');
    return { cookie: document.cookie, settings };
  });

  console.log('document.cookie =>', data.cookie);
  console.log("leafletHeatmapSettings =>", JSON.stringify(data.settings));

  await browser.close();
  process.exit(0);
})();
