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
  await page.waitForSelector('.positions-window-btn');

  const defined = await page.evaluate(() => typeof handleGlobalTimeSelection === 'function');
  console.log('handleGlobalTimeSelection defined?', defined);

  // Click the All button (dataset hours=all)
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.positions-window-btn')).find(b => (b.dataset.hours || '').toString() === 'all');
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('clicked =>', clicked);

  await new Promise(r => setTimeout(r, 250));

  const saved = await page.evaluate(() => localStorage.getItem('positionsTimescale'));
  console.log('localStorage positionsTimescale =>', saved);

  await browser.close();
})();
