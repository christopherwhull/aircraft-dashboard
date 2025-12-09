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
  // Click 'Positions' tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab-button')).find(b => b.textContent && b.textContent.trim().toLowerCase() === 'positions');
    if (btn) btn.click();
  });
  await page.waitForSelector('#position-stats-table');

  // set start and end times to trigger a custom range refresh
  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  const fmt = (d) => d.toISOString().slice(0,16);
  await page.evaluate((s,e) => {
    const start = document.getElementById('positions-start-time');
    const end = document.getElementById('positions-end-time');
    if (start && end) {
      start.value = s; end.value = e;
      // dispatch input/change events
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
      start.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      end.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }
  }, fmt(threeHoursAgo), fmt(now));

  // Immediately check that the spinner appeared in the positions indicator
  const spinnerPresentImmediate = await page.evaluate(() => !!document.querySelector('#positions-timescale-indicator .spinner'));
  console.log('Spinner present immediately =>', spinnerPresentImmediate);

  // Wait for last lookup to update
  const before = await page.evaluate(() => window._lastLookupTimes && window._lastLookupTimes['positions'] || 0);
  try {
    await page.waitForFunction((b) => (window._lastLookupTimes && (window._lastLookupTimes['positions'] || 0) > b), { timeout: DEFAULT_TIMEOUT }, before);
  } catch (e) {
    console.error('Timed out waiting for last lookup times for positions to update (120s)');
  }

  const lastLookup = await page.evaluate(() => window._lastLookupTimes && window._lastLookupTimes['positions']);
  console.log('Last lookup for positions =>', lastLookup);

  await browser.close();
})();
