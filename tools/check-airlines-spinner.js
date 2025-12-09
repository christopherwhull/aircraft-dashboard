const puppeteer = require('puppeteer');

const DEFAULT_TIMEOUT = 120000;

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  await page.setDefaultTimeout(DEFAULT_TIMEOUT);
  try {
    await page.goto('http://localhost:3002/', { waitUntil: 'networkidle2', timeout: DEFAULT_TIMEOUT });
  } catch (e) {
    console.error('Timed out navigating to page (120s)');
  }
  await page.waitForSelector('.tab-button');
  // Click 'Airlines' tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab-button')).find(b => b.textContent && b.textContent.trim().toLowerCase() === 'airlines');
    if (btn) btn.click();
  });
  await page.waitForSelector('#airline-stats-table-body-last-hour');
  
  // Trigger global All quick button
  await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('.positions-window-btn')).find(b => b.getAttribute('data-hours') === 'all'); if (btn) btn.click(); });

  // Immediately check spinner presence
  const spinnerNow = await page.evaluate(() => !!document.querySelector('#airline-stats-summary-last-hour .spinner'));
  console.log('Spinner present initially =>', spinnerNow);

  // Wait until window._lastLoadAirlineStats updates
  const before = await page.evaluate(() => window._lastLoadAirlineStats || 0);
  try {
    await page.waitForFunction((b) => (window._lastLoadAirlineStats || 0) > b, { timeout: DEFAULT_TIMEOUT }, before);
  } catch (e) {
    console.error('Timed out waiting for _lastLoadAirlineStats to update (120s)');
  }

  const lastLookup = await page.evaluate(() => window._lastLookupTimes && window._lastLookupTimes['airlines']);
  console.log('Last lookup for airlines =>', lastLookup);

  await browser.close();
})();
