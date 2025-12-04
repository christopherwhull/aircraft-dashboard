#!/usr/bin/env node
// compare-cache-tiles.js
// Usage: node compare-cache-tiles.js [z] [x] [y]
// If no args provided, default to z=9 at lon=-98, lat=39 (central US)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  const args = process.argv.slice(2);
  let z, x, y;
  if (args.length === 3) {
    z = Number(args[0]);
    x = Number(args[1]);
    y = Number(args[2]);
  } else {
    z = 9;
    // default lon/lat -> tile
    const lon = -98;
    const lat = 39;
    const t = lonLatToTile(lon, lat, z);
    x = t.x;
    y = t.y;
    console.log(`No tile coords provided. Using default z=${z}, lon=${lon}, lat=${lat} -> x=${x}, y=${y}`);
  }

  if (![z, x, y].every(n => Number.isFinite(n))) {
    console.error('Invalid tile coordinates');
    process.exitCode = 2;
    return;
  }

  const layers = [
    { name: 'VFR_Sectional' },
    { name: 'VFR_Terminal' },
    { name: 'IFR_High' },
    { name: 'IFR_AreaLow' }
  ];

  const repoRoot = path.resolve(__dirname, '..');
  const cacheRoot = path.join(repoRoot, 'tile_cache');
  const config = require(path.join(repoRoot, 'config'));
  const proxyBase = (config && config.tools && config.tools.tileProxyUrl) ? config.tools.tileProxyUrl : 'http://localhost:3004';

  // ensure output dir
  const outDir = path.join(__dirname, 'compare-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const layer of layers) {
    const cachePaths = possibleCachePaths(cacheRoot, layer.name, z, y, x);
    let found = cachePaths.find(p => fs.existsSync(p));
    if (found) {
      layer.cachePath = found;
      layer.fromProxy = false;
    } else {
      // attempt to fetch via proxy (this should populate the cache if proxy is running)
      const url = `${proxyBase}/tile/${layer.name}/${z}/${y}/${x}`;
      console.log(`Fetching via proxy: ${url}`);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`  Proxy fetch returned ${res.status} ${res.statusText}`);
          layer.fetchError = `${res.status} ${res.statusText}`;
        } else {
          const buffer = Buffer.from(await res.arrayBuffer());
          // write to a diagnostic file under tools/compare-output
          const outFile = path.join(outDir, `${layer.name}_${z}_${y}_${x}.${guessExt(res)}`);
          fs.writeFileSync(outFile, buffer);
          layer.tmpFile = outFile;
          // After fetching, check cache again
          const found2 = cachePaths.find(p => fs.existsSync(p));
          if (found2) {
            layer.cachePath = found2;
            layer.fromProxy = true;
          } else {
            // Not present in cache; still record tmp file
            layer.cachePath = null;
            layer.fromProxy = true;
          }
        }
      } catch (err) {
        console.warn('  Fetch error:', err && err.message ? err.message : err);
        layer.fetchError = err && err.message ? err.message : String(err);
      }
    }

    // Compute hash/size from cachePath if available, else from tmpFile if present
    let buf = null;
    try {
      if (layer.cachePath && fs.existsSync(layer.cachePath)) {
        buf = fs.readFileSync(layer.cachePath);
        layer.source = layer.cachePath;
      } else if (layer.tmpFile && fs.existsSync(layer.tmpFile)) {
        buf = fs.readFileSync(layer.tmpFile);
        layer.source = layer.tmpFile;
      }

      if (buf) {
        layer.size = buf.length;
        layer.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      }
    } catch (err) {
      layer.readError = err && err.message ? err.message : String(err);
    }
  }

  // Print summary
  console.log('\nComparison results:');
  for (const l of layers) {
    console.log(`- ${l.name}:`);
    console.log(`    cachePath: ${l.cachePath || 'MISSING'}`);
    if (l.fromProxy) console.log(`    fetchedViaProxy: true`);
    if (l.fetchError) console.log(`    fetchError: ${l.fetchError}`);
    if (l.readError) console.log(`    readError: ${l.readError}`);
    console.log(`    source: ${l.source || 'none'}`);
    console.log(`    size: ${l.size || 'n/a'} bytes`);
    console.log(`    sha256: ${l.sha256 || 'n/a'}`);
  }

  // Compare hashes
  const hashes = layers.map(l => l.sha256).filter(Boolean);
  const unique = [...new Set(hashes)];
  if (unique.length === 0) {
    console.log('\nNo tile data was available for any layer.');
    process.exitCode = 1;
    return;
  }
  if (unique.length === 1) {
    console.log('\nAll available tiles are identical (same SHA256).');
  } else {
    console.log('\nTiles differ across layers. Unique hashes:', unique.length);
  }
}

function possibleCachePaths(cacheRoot, layerName, z, y, x) {
  // common extensions
  const exts = ['jpg', 'jpeg', 'png', 'webp'];
  const baseDir = path.join(cacheRoot, layerName, String(z), String(y));
  return exts.map(ext => path.join(baseDir, `${x}.${ext}`));
}

function guessExt(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('jpeg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  return 'bin';
}

function lonLatToTile(lon, lat, z) {
  const n = Math.pow(2, z);
  const xtile = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const ytile = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: xtile, y: ytile };
}

// Node 18+ has global fetch. If not available, try to require 'node-fetch'.
(async () => {
  if (typeof fetch === 'undefined') {
    try {
      global.fetch = (await import('node-fetch')).default;
    } catch (e) {
      console.error('Fetch is not available. Install node-fetch or use Node 18+.');
      process.exitCode = 2;
      return;
    }
  }
  await main();
})();
