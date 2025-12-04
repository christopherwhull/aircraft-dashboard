// tools/precache-tiles.js
// Pre-cache tiles in a spiral around the PiAware receiver until tile cache reaches a target size.

// Usage examples:
//   node tools/precache-tiles.js
//   TILE_SERVER_URL=http://localhost:3003/charts LAYERS=vfrsec,ifrlc,ifrhc ZOOMS=6,7,8 TARGET_GB=2 node tools/precache-tiles.js

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const config = require('../config');

// Configurable via env or CLI-style env
const TILE_SERVER_URL = process.env.TILE_SERVER_URL || process.env.TILE_PROXY_URL || process.env.TARGET_TILE_SERVER || 'http://localhost:3002/api/tiles';
const TILE_CACHE_DIR = process.env.TILE_CACHE_DIR || path.join(process.cwd(), 'tile_cache');
const TARGET_GB = parseFloat(process.env.TARGET_GB || '2');
const TARGET_BYTES = Math.max(0, Math.floor(TARGET_GB * 1024 * 1024 * 1024));
const LAYERS = (process.env.LAYERS || 'vfrsec,ifrlc,ifrhc,vfrhc').split(',').map(s => s.trim()).filter(Boolean);
const ZOOMS = (process.env.ZOOMS || '6,7,8,9').split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000', 10);

if (!fs.existsSync(TILE_CACHE_DIR)) fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getReceiverCoords() {
    // Try PIAWARE_URL from config or env
    let piawareUrl = (config && config.dataSource && config.dataSource.piAwareUrl) || process.env.PIAWARE_URL;
    if (!piawareUrl) {
        console.warn('PiAware URL not configured in config.js or PIAWARE_URL env. Please set PIAWARE_URL.');
        return null;
    }

    try {
        const base = piawareUrl.replace('/data/aircraft.json', '');
        const receiverUrl = base + '/data/receiver.json';
        const res = await fetch(receiverUrl, { timeout: REQUEST_TIMEOUT_MS });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        // receiver.json may contain location or lat/lon fields
        const lat = json.location && json.location.lat ? json.location.lat : (json.lat || json.latitude);
        const lon = json.location && json.location.lon ? json.location.lon : (json.lon || json.longitude);
        if (lat === undefined || lon === undefined) {
            console.warn('Receiver JSON did not contain lat/lon:', receiverUrl);
            return null;
        }
        return { lat: Number(lat), lon: Number(lon) };
    } catch (e) {
        console.warn('Failed to fetch receiver.json from PiAware:', e.message);
        return null;
    }
}

function lonLatToTileXY(lon, lat, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

function tileCenterLatLon(x, y, z) {
    const n = Math.pow(2, z);
    const lon = x / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lon };
}

function getDirSizeBytes(dir) {
    let total = 0;
    function walk(d) {
        if (!fs.existsSync(d)) return;
        const items = fs.readdirSync(d, { withFileTypes: true });
        for (const it of items) {
            const p = path.join(d, it.name);
            if (it.isDirectory()) walk(p);
            else if (it.isFile()) total += fs.statSync(p).size;
        }
    }
    walk(dir);
    return total;
}

async function fetchTile(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            // consume body to ensure server processes tile generation and any caching side-effects
            await res.arrayBuffer();
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function tryFetchTileWithExts(baseUrl) {
    // Try common extensions: png then jpg
    const exts = ['.png', '.jpg', '.jpeg'];
    for (const ext of exts) {
        const url = baseUrl + ext;
        const ok = await fetchTile(url);
        if (ok) return url;
    }
    return null;
}

async function run() {
    console.log('Precache script starting');
    console.log('Target bytes:', TARGET_BYTES, `(${TARGET_GB} GB)`);
    console.log('Tile server base URL:', TILE_SERVER_URL);
    console.log('Cache dir:', TILE_CACHE_DIR);
    console.log('Layers:', LAYERS.join(','));
    console.log('Zooms:', ZOOMS.join(','));
    console.log('Concurrency:', CONCURRENCY);

    const coords = await getReceiverCoords();
    if (!coords) {
        console.warn('No receiver coords found. Defaulting to lat=0,lon=0 (equator) for spiral center. Set PIAWARE_URL or provide coords via env PIAWARE_LAT and PIAWARE_LON to be accurate.');
    }
    const centerLat = process.env.PIAWARE_LAT ? Number(process.env.PIAWARE_LAT) : (coords ? coords.lat : 0);
    const centerLon = process.env.PIAWARE_LON ? Number(process.env.PIAWARE_LON) : (coords ? coords.lon : 0);

    console.log(`Using center: lat=${centerLat}, lon=${centerLon}`);

    // concurrency gate
    let active = 0;
    const queue = [];
    function schedule(fn) {
        return new Promise((resolve) => {
            queue.push({ fn, resolve });
            processQueue();
        });
    }
    function processQueue() {
        if (queue.length === 0) return;
        if (active >= CONCURRENCY) return;
        const item = queue.shift();
        active++;
        item.fn().then((v) => {
            active--;
            item.resolve(v);
            processQueue();
        }).catch((e) => {
            active--;
            item.resolve(false);
            processQueue();
        });
    }

    let totalFetched = 0;
    let iteration = 0;

    // target: expand radius in tiles until cache >= TARGET_BYTES
    const maxRadius = 2000; // safety cap
    outer: for (let r = 0; r <= maxRadius; r++) {
        // tiles on this ring: approximate circumference
        const tilesOnRing = r === 0 ? 1 : Math.max(8, Math.ceil(2 * Math.PI * r));
        for (let t = 0; t < tilesOnRing; t++) {
            const angle = (2 * Math.PI * t) / tilesOnRing;
            for (const z of ZOOMS) {
                const centerTile = lonLatToTileXY(centerLon, centerLat, z);
                const tx = centerTile.x + Math.round(r * Math.cos(angle));
                const ty = centerTile.y + Math.round(r * Math.sin(angle));

                for (const layer of LAYERS) {
                    const baseUrl = `${TILE_SERVER_URL.replace(/\/$/, '')}/${layer}/${z}/${tx}/${ty}`;
                    // schedule fetch (try png/jpg)
                    schedule(async () => {
                        const got = await tryFetchTileWithExts(baseUrl);
                        if (got) totalFetched++;
                        if (totalFetched % 50 === 0) {
                            const size = getDirSizeBytes(TILE_CACHE_DIR);
                            console.log(`Fetched ${totalFetched} tiles. Cache size: ${size} bytes (${(size/1024/1024).toFixed(2)} MB)`);
                        }
                        return got;
                    });

                    // check stop condition occasionally
                    iteration++;
                    if (iteration % 100 === 0) {
                        // wait for current scheduled to finish a bit
                        while (active > Math.max(0, CONCURRENCY - 1)) await sleep(200);
                        const size = getDirSizeBytes(TILE_CACHE_DIR);
                        if (size >= TARGET_BYTES) {
                            console.log('Target cache size reached. Stopping.');
                            break outer;
                        }
                    }
                }
            }
        }
        // small pause between rings to avoid hammering
        await sleep(50);
    }

    // wait for outstanding tasks
    while (active > 0 || queue.length > 0) {
        await sleep(200);
    }

    const finalSize = getDirSizeBytes(TILE_CACHE_DIR);
    console.log('Precache run complete. Tiles fetched:', totalFetched);
    console.log('Final cache size:', finalSize, `(${(finalSize/1024/1024).toFixed(2)} MB)`);
}

run().catch(err => {
    console.error('Error in precache script:', err);
    process.exit(1);
});
