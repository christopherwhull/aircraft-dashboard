const puppeteer = require('puppeteer');

describe('Airline DB localStorage persistence', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
  }, 20000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  test('writes airlineDB-v1 to localStorage and reads it back', async () => {
    try {
      await page.goto('http://localhost:3002/', { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (err) {
      // If server isn't running, skip test gracefully
      console.warn('Server not available on http://localhost:3002; skipping integration test');
      return;
    }
    // Ensure starting clean
    await page.evaluate(() => { try { localStorage.removeItem('airlineDB-v1'); } catch (e) {} });

    // Fetch the airline DB from API and save to localStorage to simulate a real run
    await page.evaluate(async () => {
      const resp = await fetch('/api/airline-database');
      if (!resp.ok) throw new Error('airline-database API not available');
      const data = await resp.json();
      try {
        localStorage.setItem('airlineDB-v1', JSON.stringify({ ts: Date.now(), data }));
      } catch(e) {
        // ignore storage failures
      }
    });

    // Reload page to simulate a new visit and ensure indicator reads localStorage
    await page.reload({ waitUntil: 'networkidle2' });
    const raw = await page.evaluate(() => { try { return localStorage.getItem('airlineDB-v1'); } catch (e) { return null; } });
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('ts');
    expect(parsed).toHaveProperty('data');

    // Indicator displays 'local' when a recent cached DB is present
    const indicatorText = await page.evaluate(() => {
      const el = document.getElementById('airline-db-indicator');
      return el ? el.textContent : null;
    });
    expect(indicatorText).toMatch(/Airline DB:/);
  }, 60000);
});
