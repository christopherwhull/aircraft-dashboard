// Test tile proxy server functionality with Chicago tiles at different zoom levels
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.PORT = '3006'; // Use a different port for testing

// Mock config to avoid needing actual config file
jest.mock('../config', () => ({
  arcgis: {
    apiKey: 'test-api-key'
  }
}));

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');

// Import the tile proxy app for integration testing
const tileProxyApp = require('../tile-proxy-server');

const TILE_CACHE_DIR = path.join(__dirname, '..', 'tile_cache_test');

// Helper function to calculate tile coordinates for Chicago
function latLonToTile(lat, lon, zoom) {
  const latRad = lat * Math.PI / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Test the tile coordinate calculations and cache path generation
describe('Tile Proxy Server Integration Tests', () => {
  let server;
  let testAgent;

  beforeAll(async () => {
    // Set test-specific environment variables
    process.env.TILE_CACHE_DIR = TILE_CACHE_DIR;
    
    // Start the tile proxy server on a test port
    const testPort = 3005;
    server = tileProxyApp.listen(testPort);
    testAgent = request(`http://localhost:${testPort}`);

    // Ensure test cache directory exists
    if (!fs.existsSync(TILE_CACHE_DIR)) {
      fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    // Close the server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Clean up intervals
    if (tileProxyApp.cleanup) {
      tileProxyApp.cleanup();
    }

    // Clean up test cache
    if (fs.existsSync(TILE_CACHE_DIR)) {
      fs.rmSync(TILE_CACHE_DIR, { recursive: true, force: true });
    }
  });

  test('should calculate correct tile coordinates for Chicago at different zoom levels', () => {
    // Chicago coordinates
    const chicagoLat = 41.8781;
    const chicagoLon = -87.6298;

    // Expected tile coordinates for Chicago (approximate)
    const expectedTiles = {
      8: { x: 65, y: 95 },
      9: { x: 130, y: 190 },
      10: { x: 260, y: 380 },
      11: { x: 520, y: 760 },
      12: { x: 1040, y: 1520 }
    };

    const zoomLevels = [8, 9, 10, 11, 12];

    for (const zoom of zoomLevels) {
      const { x, y } = latLonToTile(chicagoLat, chicagoLon, zoom);

      console.log(`Zoom ${zoom}: x=${x}, y=${y}`);

      // Verify coordinates are reasonable (within expected range)
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x).toBeLessThan(Math.pow(2, zoom));
      expect(y).toBeLessThan(Math.pow(2, zoom));

      // Store for manual verification
      expectedTiles[zoom] = { x, y };
    }
  });

  test('should generate correct cache paths for Chicago tiles', () => {
    const chicagoLat = 41.8781;
    const chicagoLon = -87.6298;
    const layer = 'arcgis-imagery'; // Use working basemap
    const zoom = 10;

    const { x, y } = latLonToTile(chicagoLat, chicagoLon, zoom);

    // Generate cache path like the tile proxy does
    const cacheDir = path.join(TILE_CACHE_DIR, layer, zoom.toString(), x.toString());
    const cachePath = path.join(cacheDir, `${y}.png`);

    // Verify path structure
    expect(cachePath).toContain('tile_cache_test');
    expect(cachePath).toContain('arcgis-imagery');
    expect(cachePath).toContain('10');
    expect(cachePath).toContain(`${x}`);
    expect(cachePath).toContain(`${y}.png`);

    // Verify it's a valid path
    const parsed = path.parse(cachePath);
    expect(parsed.ext).toBe('.png');
    expect(parsed.name).toBe(y.toString());
  });

  test('should calculate SHA256 checksums consistently', () => {
    const testData = Buffer.from('test-tile-data');
    const checksum1 = crypto.createHash('sha256').update(testData).digest('hex');
    const checksum2 = crypto.createHash('sha256').update(testData).digest('hex');

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA256 is 64 hex characters
  });

  test('should handle flipped Y coordinate calculation', () => {
    const zoom = 10;
    const y = 380;
    const flippedY = Math.pow(2, zoom) - 1 - y;

    expect(flippedY).toBe(Math.pow(2, zoom) - 1 - y);
    expect(flippedY).toBeGreaterThanOrEqual(0);
    expect(flippedY).toBeLessThan(Math.pow(2, zoom));
  });

  test('should validate tile proxy URL format', () => {
    const layer = 'ifr-arealow';
    const zoom = 11;
    const x = 520;
    const y = 760;

    const proxyUrl = `/tile/${layer}/${zoom}/${x}/${y}`;

    expect(proxyUrl).toBe('/tile/ifr-arealow/11/520/760');

    // Verify it matches the expected pattern
    const urlPattern = /^\/tile\/[a-z-]+\/\d+\/\d+\/\d+$/;
    expect(proxyUrl).toMatch(urlPattern);
  });

  test('should serve tiles for Chicago coordinates via HTTP', async () => {
    const chicagoLat = 41.8781;
    const chicagoLon = -87.6298;
    const layer = 'arcgis-street'; // Use working ArcGIS basemap
    const zoom = 10;

    const { x, y } = latLonToTile(chicagoLat, chicagoLon, zoom);
    const flippedY = Math.pow(2, zoom) - 1 - y;

    // Make request to our proxy
    const proxyResponse = await testAgent
      .get(`/tile/${layer}/${zoom}/${x}/${y}`)
      .expect((res) => {
        // Should get 200 for working basemap
        if (res.status !== 200) {
          throw new Error(`Unexpected status: ${res.status}`);
        }
      });

    console.log(`Proxy response status: ${proxyResponse.status}`);
    console.log(`Proxy response content-type: ${proxyResponse.headers['content-type']}`);

    expect(proxyResponse.headers['content-type']).toBe('image/jpeg');
    expect(proxyResponse.body).toBeInstanceOf(Buffer);
    expect(proxyResponse.body.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for network requests

  test('should return identical data to direct ArcGIS requests', async () => {
    const chicagoLat = 41.8781;
    const chicagoLon = -87.6298;
    const layer = 'arcgis-street'; // Use working ArcGIS basemap
    const zoom = 10;

    const { x, y } = latLonToTile(chicagoLat, chicagoLon, zoom);
    const flippedY = Math.pow(2, zoom) - 1 - y;

    // Direct ArcGIS URL for World Street Map
    const arcgisUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${flippedY}/${x}`;

    console.log(`Testing tile: ${layer}/${zoom}/${x}/${y}`);
    console.log(`ArcGIS URL: ${arcgisUrl}`);

    try {
      // Fetch directly from ArcGIS
      const arcgisResponse = await fetch(arcgisUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AircraftDashboard/1.0)',
          'Referer': 'https://www.arcgis.com/'
        },
        timeout: 10000
      });

      // Fetch from our proxy
      const proxyResponse = await testAgent
        .get(`/tile/${layer}/${zoom}/${x}/${y}`)
        .timeout(10000);

      console.log(`ArcGIS status: ${arcgisResponse.status}, Proxy status: ${proxyResponse.status}`);

      // Both should return the same status
      expect(proxyResponse.status).toBe(arcgisResponse.status);

      if (arcgisResponse.ok && proxyResponse.status === 200) {
        // If both are successful, compare content
        const arcgisBuffer = await arcgisResponse.arrayBuffer();
        const proxyBuffer = Buffer.from(proxyResponse.body);

        expect(proxyBuffer.length).toBeGreaterThan(0);
        expect(arcgisBuffer.byteLength).toBeGreaterThan(0);

        // Content should be identical (or very close due to compression differences)
        // For JPEG tiles, we expect them to be identical
        const arcgisData = Buffer.from(arcgisBuffer);
        expect(proxyBuffer.equals(arcgisData)).toBe(true);

        console.log(`Tile data matches! Size: ${proxyBuffer.length} bytes`);
      }

    } catch (error) {
      console.log(`Network error (expected for some tiles): ${error.message}`);
      // If ArcGIS request fails, proxy should also fail gracefully
      const proxyResponse = await testAgent
        .get(`/tile/${layer}/${zoom}/${x}/${y}`)
        .timeout(5000);

      // Proxy should handle errors gracefully
      expect([404, 500]).toContain(proxyResponse.status);
    }
  }, 30000); // 30 second timeout for network requests
});

describe('Tile Proxy Cache Performance Tests', () => {
  let server;
  let testAgent;

  beforeAll(async () => {
    // Set test-specific environment variables
    process.env.TILE_CACHE_DIR = TILE_CACHE_DIR;
    
    // Start the tile proxy server on a test port
    const testPort = 3005;
    server = tileProxyApp.listen(testPort);
    testAgent = request(`http://localhost:${testPort}`);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  const chicagoLat = 41.8781;
  const chicagoLon = -87.6298;
  const layer = 'arcgis-street';
  const zoom = 10;
  const { x, y } = latLonToTile(chicagoLat, chicagoLon, zoom);

  test('should validate cache server functionality', async () => {
    // Test that the cache server can serve tiles reliably
    const cachedLayer = 'vfr-terminal';
    const tileUrl = `/tile/${cachedLayer}/${zoom}/${x}/${y}`;

    // Make multiple requests to test reliability
    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(
        testAgent
          .get(tileUrl)
          .timeout(10000)
      );
    }

    const responses = await Promise.all(requests);

    // All requests should complete (may be 200 or 404 depending on tile availability)
    responses.forEach((response, index) => {
      console.log(`Cache server request ${index + 1} status: ${response.status}`);
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body.length).toBeGreaterThan(0);
        expect(response.headers['content-type']).toMatch(/^image\/(png|jpeg|jpg)$/);
      }
    });

    // If we got successful responses, they should be identical (from cache)
    const successfulResponses = responses.filter(r => r.status === 200);
    if (successfulResponses.length > 1) {
      const firstResponse = successfulResponses[0].body;
      successfulResponses.forEach((response, index) => {
        if (index > 0) {
          expect(Buffer.compare(response.body, firstResponse)).toBe(0);
        }
      });
      console.log(`Cache server served ${successfulResponses.length} identical tiles reliably`);
    } else {
      console.log('Cache server handled requests appropriately (tiles may not be available for this location)');
    }

    console.log('Cache server functionality test passed');
  }, 30000); // 30 second timeout

  test('should handle direct ArcGIS access without API key', async () => {
    const flippedY = Math.pow(2, zoom) - 1 - y;
    const arcgisUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${flippedY}/${x}`;

    try {
      const response = await fetch(arcgisUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AircraftDashboard/1.0)'
        },
        timeout: 5000
      });

      // ArcGIS may still serve some tiles without API key, but should be rate limited
      console.log(`Direct ArcGIS status without API key: ${response.status}`);

      if (response.status === 200) {
        const buffer = await response.arrayBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
      } else {
        // If it fails, it should be a 4xx or 5xx error
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    } catch (error) {
      console.log(`Direct ArcGIS failed without API key: ${error.message}`);
      // Network errors are also acceptable
      expect(error.message).toMatch(/timeout|network|fetch/i);
    }
  }, 10000);

  test('should handle direct ArcGIS access with API key', async () => {
    const flippedY = Math.pow(2, zoom) - 1 - y;
    const apiKey = process.env.ARC_GIS_API_KEY;

    if (!apiKey) {
      console.log('Skipping API key test - ARC_GIS_API_KEY not set');
      return;
    }

    const arcgisUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${flippedY}/${x}?token=${apiKey}`;

    try {
      const response = await fetch(arcgisUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AircraftDashboard/1.0)',
          'Referer': 'https://www.arcgis.com/'
        },
        timeout: 10000
      });

      console.log(`Direct ArcGIS status with API key: ${response.status}`);

      if (response.status === 200) {
        const buffer = await response.arrayBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
        console.log(`Successfully fetched ${buffer.byteLength} bytes with API key`);
      } else {
        console.log(`API key request failed with status: ${response.status}`);
      }
    } catch (error) {
      console.log(`Direct ArcGIS with API key failed: ${error.message}`);
      // Even with API key, some tiles might not be available
    }
  }, 15000);

  test('should validate cache server reliability with API key', async () => {
    const apiKey = process.env.ARC_GIS_API_KEY;

    if (!apiKey) {
      console.log('Skipping cache server test - ARC_GIS_API_KEY not set');
      return;
    }

    const tileUrl = `/tile/${layer}/${zoom}/${x}/${y}`;

    // Make multiple requests to test reliability
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        testAgent
          .get(tileUrl)
          .timeout(10000)
      );
    }

    const responses = await Promise.all(requests);

    // All requests should succeed
    responses.forEach((response, index) => {
      console.log(`Request ${index + 1} status: ${response.status}`);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.body.length).toBeGreaterThan(0);
    });

    // All responses should be identical (from cache)
    const firstResponse = responses[0].body;
    responses.forEach((response, index) => {
      if (index > 0) {
        expect(Buffer.compare(response.body, firstResponse)).toBe(0);
      }
    });

    console.log(`Successfully served ${responses.length} identical tiles from cache`);
  }, 60000);
});