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
  // Click 'Flights' tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab-button')).find(b => b.textContent && b.textContent.trim().toLowerCase() === 'flights');
    if (btn) btn.click();
  });
  await page.waitForSelector('#flights-table');
  
  // capture current timestamp
  const before = await page.evaluate(() => window._lastLoadFlights || 0);

  // set start and end times to trigger a custom range refresh
  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  const fmt = (d) => d.toISOString().slice(0,16);
  await page.evaluate((s,e) => {
    const start = document.getElementById('flights-start-time') || document.getElementById('positions-start-time');
    const end = document.getElementById('flights-end-time') || document.getElementById('positions-end-time');
    if (start && end) {
      start.value = s; end.value = e;
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
      start.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      end.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }
  }, fmt(threeHoursAgo), fmt(now));

  // Wait for _lastLoadFlights to update
  try {
    await page.waitForFunction((b) => (window._lastLoadFlights || 0) > b, { timeout: DEFAULT_TIMEOUT }, before);
  } catch (e) {
    console.error('Timed out waiting for _lastLoadFlights to update during flight custom refresh detach test (120s)');
  }
  const lastLoad = await page.evaluate(() => window._lastLoadFlights || null);
  console.log('Last loadFlights run time after custom range =>', lastLoad);

  // Switch to positions tab and modify positions start/end - flights listener should be detached
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab-button')).find(b => b.textContent && b.textContent.trim().toLowerCase() === 'positions');
    if (btn) btn.click();
  });
  await page.waitForSelector('#position-stats-table');

  const before2 = await page.evaluate(() => window._lastLoadFlights || 0);
  const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
  await page.evaluate((s,e) => {
    const start = document.getElementById('positions-start-time');
    const end = document.getElementById('positions-end-time');
    if (start && end) {
      start.value = s; end.value = e;
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
      start.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      end.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }
  }, fmt(twoHoursAgo), fmt(now));

  // Wait a short time to ensure no unexpected loadFlights invocation
  await page.waitForTimeout(1000);
  const lastLoadAfter = await page.evaluate(() => window._lastLoadFlights || null);
  const called = (lastLoadAfter && lastLoadAfter > before2) || false;
  console.log('Was loadFlights called after switching to positions and updating global inputs? =>', called);

  await browser.close();
})();
