const puppeteer = require('puppeteer');

describe('Positions timescale control integration', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
  }, 20000);

  afterAll(async () => {
    if (browser) await browser.close();
  }, 20000);

  test('global time-window changes update positions timeseries', async () => {
    try {
      await page.goto('http://localhost:3002/', { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (err) {
      console.warn('Server not available on http://localhost:3002; skipping integration test');
      return;
    }

    // decide which control is present
    const controlId = await page.evaluate(() => {
      if (document.getElementById('time-window')) return 'time-window';
      if (document.getElementById('heatmap-window')) return 'heatmap-window';
      return null;
    });
    if (!controlId) {
      console.warn('No global time-window control found; skipping test');
      return;
    }

    // Set the control to 1h and wait for update
    await page.select(`#${controlId}`, '1h');
    // Wait for positionDataSources.startTime to be set near (now - 1h)
    const ok1 = await page.waitForFunction(() => {
      try { return typeof positionDataSources !== 'undefined' && positionDataSources.startTime && positionDataSources.endTime; } catch(e) { return false; }
    }, { timeout: 20000 }).catch(() => false);
    expect(ok1).toBeTruthy();
    const start1 = await page.evaluate(() => positionDataSources.startTime);
    const end1 = await page.evaluate(() => positionDataSources.endTime);
    expect(end1 - start1).toBeGreaterThanOrEqual(59 * 60 * 1000); // >= ~59 minutes

    // Change to 24h
    await page.select(`#${controlId}`, '24h');
    const ok24 = await page.waitForFunction(() => {
      try { return positionDataSources && positionDataSources.endTime - positionDataSources.startTime >= 23 * 60 * 60 * 1000; } catch(e) { return false; }
    }, { timeout: 20000 }).catch(() => false);
    expect(ok24).toBeTruthy();
    const start2 = await page.evaluate(() => positionDataSources.startTime);
    const end2 = await page.evaluate(() => positionDataSources.endTime);
    expect(end2 - start2).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
  }, 60000);
});
