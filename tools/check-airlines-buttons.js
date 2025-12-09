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
  // Wait for data to populate
  try {
    await page.waitForFunction(() => document.querySelectorAll('#airline-stats-table-body-last-hour tr').length > 0, { timeout: DEFAULT_TIMEOUT });
  } catch (e) {
    console.error('Timed out waiting for airline rows to populate (120s)');
  }

  // Click the first airline row
  const clicked = await page.evaluate(() => {
    const row = document.querySelector('#airline-stats-table-body-last-hour tr:nth-child(2)'); // 2nd row because 1st may be header
    if (!row) return false;
    row.click();
    return true;
  });
  console.log('clicked row =>', clicked);

  await new Promise(r => setTimeout(r, 500));

  const lastLoad = await page.evaluate(() => window._lastLoadAirlineFlights || null);
  console.log('Last loadAirlineFlights run time =>', lastLoad);

  await browser.close();
})();
