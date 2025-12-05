// tools/precache-tiles.js
// Pre-cache tiles in a spiral around the PiAware receiver until tile cache reaches a target size.

// Usage examples:
//   node tools/precache-tiles.js
//   TILE_SERVER_URL=http://localhost:3003/charts LAYERS=vfrsec,ifrlc,ifrhc ZOOMS=6,7,8 TARGET_GB=2 node tools/precache-tiles.js

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const config = require('../config');

// Use config.js values only; no process.env fallbacks here so behavior is deterministic.
const TILE_CACHE_DIR = path.join(process.cwd(), 'tile_cache');
const TILE_SERVER_URL = (config && config.tools && config.tools.tileServerUrl) ? String(config.tools.tileServerUrl) : ((config && Array.isArray(config.gisTileBases) && config.gisTileBases.length) ? String(config.gisTileBases[0]) : 'http://localhost:3002/api/tiles');
const TARGET_GB = parseFloat((config && config.tools && config.tools.targetGb) ? config.tools.targetGb : '2');
const TARGET_BYTES = Math.max(0, Math.floor(TARGET_GB * 1024 * 1024 * 1024));
const LAYERS = (config && config.tools && config.tools.layers) ? String(config.tools.layers).split(',').map(s => s.trim()).filter(Boolean) : 'vfrsec,ifrlc,ifrhc,vfrhc'.split(',').map(s => s.trim()).filter(Boolean);
const ZOOMS = (config && config.tools && config.tools.zooms) ? String(config.tools.zooms).split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n)) : '6,7,8,9'.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
const CONCURRENCY = parseInt((config && config.tools && config.tools.concurrency) ? config.tools.concurrency : '8', 10);
const REQUEST_TIMEOUT_MS = parseInt((config && config.tools && config.tools.requestTimeoutMs) ? config.tools.requestTimeoutMs : '5000', 10);

if (!fs.existsSync(TILE_CACHE_DIR)) fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getReceiverCoords() {
    // PiAware receiver URL should be set in config.js
    let piawareUrl = (config && config.dataSource && config.dataSource.piAwareUrl) ? config.dataSource.piAwareUrl : null;
    if (!piawareUrl) {
        console.warn('PiAware URL not configured in config.js. Please set config.dataSource.piAwareUrl.');
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

async function fetchAndSave(url, outPath) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
        return fs.statSync(outPath).size;
    } catch (e) {
        return null;
    }
}

async function tryFetchTileWithExts(baseUrl) {
    // Try common extensions: png then jpg
    const exts = ['.png', '.jpg', '.jpeg'];
    // If this looks like an ArcGIS-style /tile/{z}/{y}/{x} URL, try it without extension first
    if (/\/tile\/\d+\/\d+\/\d+/i.test(baseUrl)) {
        if (await fetchTile(baseUrl)) return baseUrl;
    }
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

    // If SAMPLE_TILES is provided in config.tools.sampleTiles, download those specific tiles and exit.
    // Format: SAMPLE_TILES="10:355:204,10:355:205,10:354:204,10:356:204"
    const SAMPLE_TILES = (config && config.tools && config.tools.sampleTiles) ? config.tools.sampleTiles : '';
    if (SAMPLE_TILES) {
        const sampleDir = path.join(process.cwd(), 'tools', 'tiles', 'arcgis_samples');
        if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true });
        const entries = SAMPLE_TILES.split(',').map(s => s.trim()).filter(Boolean);
        const results = [];
        for (const e of entries) {
            // accept 3-part strings separated by ':' or ','
            const parts = e.split(/[:,]/).map(p => p.trim()).filter(Boolean);
            if (parts.length !== 3) {
                console.warn('Skipping invalid SAMPLE_TILES entry:', e);
                continue;
            }
            const z = parseInt(parts[0], 10);
            const y = parseInt(parts[1], 10);
            const x = parseInt(parts[2], 10);
            // Build ArcGIS-style URL if TILE_SERVER_URL looks like an ArcGIS MapServer base
            const base = TILE_SERVER_URL.replace(/\/$/, '');
            let tileUrl;
            if (/arcgis|MapServer/i.test(base)) {
                // ArcGIS REST /tile/{z}/{y}/{x}
                tileUrl = `${base}/tile/${z}/${y}/${x}`;
            } else {
                // default to /{layer}/{z}/{x}/{y} — use first layer if present
                const layer = LAYERS[0] || 'tiles';
                tileUrl = `${base}/${layer}/${z}/${x}/${y}`;
            }

            // try extensions
            const exts = ['.png', '.jpg', '.jpeg'];
            let saved = false;
            for (const ext of exts) {
                const url = tileUrl + ext;
                const out = path.join(sampleDir, `tile_${z}_${y}_${x}${ext}`);
                const size = await fetchAndSave(url, out);
                if (size) {
                    results.push({ url, out, size });
                    saved = true;
                    break;
                }
            }
            if (!saved) results.push({ url: tileUrl, out: null, size: 0 });
        }
        console.log('Sample download results:');
        for (const r of results) console.log(r);
        return;
    }

    const coords = await getReceiverCoords();
    if (!coords) {
        console.warn('No receiver coords found. Defaulting to lat=0,lon=0 (equator) for spiral center. Set PIAWARE_URL or provide coords via env PIAWARE_LAT and PIAWARE_LON to be accurate.');
    }
    const centerLat = (config && config.tools && Number(config.tools.piawareLat)) ? Number(config.tools.piawareLat) : (coords ? coords.lat : 0);
    const centerLon = (config && config.tools && Number(config.tools.piawareLon)) ? Number(config.tools.piawareLon) : (coords ? coords.lon : 0);

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
                    // Build a layer-specific base that supports both proxy-style and ArcGIS REST-style endpoints.
                    const serverBase = TILE_SERVER_URL.replace(/\/$/, '');
                    let layerBase;
                    if (/^https?:\/\//i.test(layer)) {
                        // layer provided as a full URL (treat it as the service base)
                        layerBase = layer.replace(/\/$/, '');
                    } else {
                        // Not a full URL: combine with server base. If serverBase looks like an ArcGIS MapServer/service, don't append layer.
                        if (/arcgis|MapServer/i.test(serverBase)) layerBase = serverBase;
                        else layerBase = `${serverBase}/${layer}`;
                    }

                    // If the resulting base looks ArcGIS-like, request /tile/{z}/{y}/{x}
                    let baseUrl;
                    if (/arcgis|MapServer|\/tile\//i.test(layerBase)) {
                        baseUrl = `${layerBase.replace(/\/$/, '')}/tile/${z}/${ty}/${tx}`;
                    } else {
                        // default proxy-style: /{layer}/{z}/{x}/{y}
                        baseUrl = `${layerBase.replace(/\/$/, '')}/${z}/${tx}/${ty}`;
                    }

                    // schedule fetch (try png/jpg or direct ArcGIS tile)
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
