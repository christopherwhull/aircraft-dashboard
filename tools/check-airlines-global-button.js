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

  // Switch to Airlines tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab-button')).find(b => b.textContent && b.textContent.trim().toLowerCase() === 'airlines');
    if (btn) btn.click();
  });
  await page.waitForSelector('#airline-stats-table-body-last-hour');
  try {
    await page.waitForFunction(() => document.querySelectorAll('#airline-stats-table-body-last-hour tr').length > 0, { timeout: DEFAULT_TIMEOUT });
  } catch (e) {
    console.error('Timed out waiting for airline rows to load (120s)');
  }

  // Click the 'All' global quick button (data-hours='all')
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.positions-window-btn')).find(b => (b.dataset.hours || '').toString() === 'all');
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('clicked global All =>', clicked);

  // Wait briefly for load to be invoked
  await new Promise(r => setTimeout(r, 500));

  const lastLoad = await page.evaluate(() => window._lastLoadAirlineStats || null);
  console.log('Last loadAirlineStats flag =>', lastLoad);

  await browser.close();
})();
