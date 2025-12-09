const puppeteer = require('puppeteer');

const skipPersistence = process.env.SKIP_PERSISTENCE_TESTS === '1' || process.env.SKIP_POSITIONS_TIMESCALE_PERSISTENCE === '1';
(skipPersistence ? describe.skip : describe)('Positions timescale persistence', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
  }, 180000);

  afterAll(async () => {
    if (browser) await browser.close();
  }, 180000);

  test('clicking All sets positionsTimescale to all and persists across reload', async () => {
    try {
      await page.goto('http://localhost:3002/', { waitUntil: 'networkidle2', timeout: 180000 });
    } catch (e) {
      console.warn('Server not available; skipping positions timescale persistence test');
      return;
    }

    // Ensure the page has the quick buttons
    await page.waitForSelector('.positions-window-btn');

    // Click the 'All' quick button by dataset
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.positions-window-btn')).find(b => (b.dataset.hours || '').toString() === 'all');
      if (!btn) return false;
      btn.click();
      return true;
    });
    expect(clicked).toBeTruthy();

    // It should set localStorage positionsTimescale to 'all'
    const saved = await page.evaluate(() => localStorage.getItem('positionsTimescale'));
    expect(saved).toBe('all');

    // Reload page and ensure the 'All' quick button remains active
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.positions-window-btn');
    // Wait until saved settings applied: button for 'All' should become active
    await page.waitForFunction(() => {
      const btn = Array.from(document.querySelectorAll('.positions-window-btn')).find(b => (b.dataset.hours || '').toString() === 'all');
      return !!(btn && btn.classList && btn.classList.contains('active'));
    }, { timeout: 180000 });
    const stillActive = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.positions-window-btn')).find(b => (b.dataset.hours || '').toString() === 'all');
      return btn && btn.classList && btn.classList.contains('active');
    });
    expect(stillActive).toBeTruthy();
  }, 180000);
});
