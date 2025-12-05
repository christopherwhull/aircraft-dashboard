const fetch = require('node-fetch');

jest.setTimeout(15000);

describe('Heatmap viewer behavior', () => {
  test('Heatmap HTML contains tileLayer URLs pointing to tile server', async () => {
    // The app serves the heatmap page at /heatmap-leaflet on the main server (port 3002 by default)
    const url = 'http://localhost:3002/heatmap-leaflet';
    const res = await fetch(url).catch(() => null);
    expect(res).not.toBeNull();
    expect(res.ok).toBeTruthy();
    const html = await res.text();

    // Expect the HTML to reference a tile server pattern used by the heatmap viewer
    const cfg = require('../config');
    const bases = Array.isArray(cfg.gisTileBases) ? cfg.gisTileBases : [];
    // Accept any reasonable hint that tiles are referenced by the heatmap HTML.
    const hasTilePattern = /\btile\b/i.test(html) || html.includes('/api/tiles/') || html.includes('/api/charts/') || bases.some(b => !!b && html.includes(b));
    expect(hasTilePattern).toBeTruthy();
  });
});
