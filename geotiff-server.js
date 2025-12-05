// GeoTIFF Tile Server - Serves FAA Aviation Charts
// Runs on port 3003

const express = require('express');
const fs = require('fs');
const GeoTIFF = require('geotiff');
const Sharp = require('sharp');
const path = require('path');
const proj4 = require('proj4');
const fetch = require('node-fetch');

const app = express();
const config = require('./config');
// Use a dedicated geotiff port from config.js (fallback to 3003)
const PORT = (config && config.server && config.server.geotiffPort) ? parseInt(config.server.geotiffPort, 10) : 3003;

// Tile cache configuration (literals used when not present in config.js)
const TILE_CACHE_DIR = path.join(process.cwd(), 'tile_cache');
const TILE_CACHE_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB default
const TILE_PRUNE_INTERVAL_SECONDS = 3600; // default 1 hour

if (!fs.existsSync(TILE_CACHE_DIR)) {
    fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
}

// Setup W3C logging
const LOG_DIR = 'runtime';
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const dateStr = new Date().toISOString().split('T')[0];
const logFilePath = path.join(LOG_DIR, `geotiff-server-${dateStr}.log`);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Also log console output to file
const debugLogPath = path.join(LOG_DIR, `geotiff-debug-${dateStr}.log`);
const debugStream = fs.createWriteStream(debugLogPath, { flags: 'a' });
const originalConsoleLog = console.log;
console.log = function(...args) {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    originalConsoleLog.apply(console, args);
    debugStream.write(`${new Date().toISOString()} ${message}\n`);
};

// Write log header if file is new
if (!fs.existsSync(logFilePath) || fs.statSync(logFilePath).size === 0) {
    logStream.write('#Software: GeoTIFF Tile Server\n');
    logStream.write('#Version: 1.0\n');
    logStream.write(`#Date: ${new Date().toISOString()}\n`);
    logStream.write('#Fields: date time c-ip cs-method cs-uri-stem cs-uri-query sc-status time-taken\n');
}

function logW3C(req, res, startTime) {
    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    const time = timestamp.split('T')[1].split('.')[0];
    const clientIP = req.ip || req.connection.remoteAddress || '-';
    const method = req.method;
    const uriStem = req.path;
    const query = req.query ? new URLSearchParams(req.query).toString() : '-';
    const status = res.statusCode;
    
    const logLine = `${date} ${time} ${clientIP} ${method} ${uriStem} ${query} ${status} ${duration}\n`;
    logStream.write(logLine);
}

// Chart configuration - maps chart names to file paths
const chartConfigs = {
    'chicago': { 
        path: 'C:\\Users\\chris\\Chicago SEC.tif', 
        name: 'Chicago Sectional',
        bounds: null // Will be loaded from GeoTIFF
    },
    'detroit': { 
        path: 'C:\\Users\\chris\\Detroit SEC.tif', 
        name: 'Detroit Sectional',
        bounds: null
    },
    'greenbay': { 
        path: 'C:\\Users\\chris\\Green Bay SEC.tif', 
        name: 'Green Bay Sectional',
        bounds: null
    }
};

// Cache for GeoTIFF objects and metadata
const tiffCache = {};

// Initialize GeoTIFF files and load bounds
async function initializeCharts() {
    console.log('Initializing aviation charts...');
    
    for (const [id, config] of Object.entries(chartConfigs)) {
        if (fs.existsSync(config.path)) {
            try {
                const tiff = await GeoTIFF.fromFile(config.path);
                const image = await tiff.getImage();
                const bbox = image.getBoundingBox();
                const origin = image.getOrigin();
                const resolution = image.getResolution();
                const width = image.getWidth();
                const height = image.getHeight();
                const geoKeys = image.getGeoKeys();
                
                console.log(`\n✓ Loaded ${config.name}:`);
                console.log(`  Dimensions: ${width}x${height}`);
                console.log(`  BBox (native): [${bbox[0].toFixed(2)}, ${bbox[1].toFixed(2)}, ${bbox[2].toFixed(2)}, ${bbox[3].toFixed(2)}]`);
                console.log(`  Origin: [${origin[0].toFixed(2)}, ${origin[1].toFixed(2)}]`);
                console.log(`  Resolution: [${resolution[0].toFixed(6)}, ${resolution[1].toFixed(6)}]`);
                console.log(`  GeoKeys:`, geoKeys);
                
                // Check for color map (palette)
                const fileDirectory = image.fileDirectory;
                const colorMap = fileDirectory.ColorMap;
                console.log(`  SamplesPerPixel: ${fileDirectory.SamplesPerPixel}`);
                console.log(`  PhotometricInterpretation: ${fileDirectory.PhotometricInterpretation}`);
                console.log(`  Has ColorMap: ${colorMap ? 'Yes (' + colorMap.length + ' entries)' : 'No'}`);
                
                // Build proj4 definition for this chart's Lambert Conformal Conic projection
                const lccProj = `+proj=lcc +lat_1=${geoKeys.ProjStdParallel1GeoKey} +lat_2=${geoKeys.ProjStdParallel2GeoKey} +lat_0=${geoKeys.ProjFalseOriginLatGeoKey} +lon_0=${geoKeys.ProjFalseOriginLongGeoKey} +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs`;
                config.projection = lccProj;
                console.log(`  Projection: ${lccProj}`);
                
                config.bounds = bbox;
                config.width = width;
                config.height = height;
                config.colorMap = colorMap;
                
                // Store raw raster data for reprojection
                const raster = await image.readRasters();
                tiffCache[config.path] = { tiff, image, raster };
                
            } catch (error) {
                console.error(`✗ Failed to load ${config.name}:`, error.message);
            }
        } else {
            console.warn(`✗ Chart file not found: ${config.path}`);
        }
    }
    
    console.log('\nChart initialization complete.');
}

// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    
    // Log when response finishes
    res.on('finish', () => {
        logW3C(req, res, startTime);
    });
    
    next();
});

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Health check
app.get('/health', (req, res) => {
    const loadedCharts = Object.entries(chartConfigs)
        .filter(([id, config]) => tiffCache[config.path])
        .map(([id, config]) => ({ id, name: config.name }));
    
    res.json({
        status: 'ok',
        charts: loadedCharts.length,
        available: loadedCharts
    });
});

// List available charts
app.get('/charts', (req, res) => {
    const available = Object.entries(chartConfigs)
        .filter(([id, config]) => tiffCache[config.path])
        .map(([id, config]) => ({
            id,
            name: config.name,
            url: `/charts/${id}/{z}/{x}/{y}.png`,
            bounds: config.bounds
        }));
    
    res.json({ charts: available });
});

// Tile cache status - returns total bytes, file count, and per-chart breakdown
app.get('/cache/status', (req, res) => {
    try {
        const stats = { totalBytes: 0, files: 0, charts: {} };

        function walk(dir) {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const it of items) {
                const p = path.join(dir, it.name);
                if (it.isDirectory()) walk(p);
                else if (it.isFile() && p.endsWith('.png')) {
                    const st = fs.statSync(p);
                    stats.totalBytes += st.size;
                    stats.files += 1;
                    const rel = path.relative(TILE_CACHE_DIR, p).split(path.sep);
                    if (rel.length >= 4) {
                        const chart = rel[0];
                        if (!stats.charts[chart]) stats.charts[chart] = { files: 0, bytes: 0 };
                        stats.charts[chart].files += 1;
                        stats.charts[chart].bytes += st.size;
                    }
                }
            }
        }

        walk(TILE_CACHE_DIR);

        // Add human-readable sizes
        stats.totalHuman = typeof formatBytes === 'function' ? formatBytes(stats.totalBytes) : String(stats.totalBytes);
        for (const [k, v] of Object.entries(stats.charts)) {
            v.human = typeof formatBytes === 'function' ? formatBytes(v.bytes) : String(v.bytes);
        }

        res.json(stats);
    } catch (e) {
        console.error('Error computing cache status:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- Proxy fallback for external GIS tile layers (ArcGIS/MapServer or chart-style)
// If a request comes in for /tile/:layer/:z/:y/:x and the server does not have
// that chart, attempt to fetch the tile from configured external sources.
// Priority: environment variable `GIS_TILE_BASES` or `TILE_PROXY_TARGET` (comma-separated),
// otherwise fall back to `config.gisTileBases` array defined in `config.js`.
let EXTERNAL_TILE_BASES = [];
// Use configured GIS tile bases from `config.gisTileBases`. Do not read
// runtime environment variables so behavior is deterministic from config.js.
if (Array.isArray(config.gisTileBases) && config.gisTileBases.length > 0) {
    EXTERNAL_TILE_BASES = config.gisTileBases.map(s => String(s).trim()).filter(Boolean);
}

function cachePathFor(layer, z, x, y, ext) {
    const safeLayer = layer ? layer.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'tiles';
    const dir = path.join(TILE_CACHE_DIR, safeLayer, String(z), String(x));
    const filename = `${y}${ext}`;
    return path.join(dir, filename);
}

async function tryFetchCandidates(candidates) {
    for (const url of candidates) {
        try {
            console.log(`[geotiff-proxy] trying upstream: ${url}`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (res) {
                console.log(`[geotiff-proxy] upstream response: ${url} -> ${res.status} ${res.statusText || ''} ct=${res.headers.get('content-type')}`);
            }
            if (res && res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                const ct = res.headers.get('content-type') || 'application/octet-stream';
                return { url, buf, contentType: ct };
            }
        } catch (e) {
            console.warn('[geotiff-proxy] fetch error for', url, e && e.message ? e.message : e);
            // try next candidate
        }
    }
    return null;
}

async function fetchAndCache(layer, z, x, y, candidates) {
    const result = await tryFetchCandidates(candidates);
    if (!result) return null;
    let ext = '.png';
    if (/jpeg|jpg/i.test(result.contentType)) ext = '.jpg';
    else if (/webp/i.test(result.contentType)) ext = '.webp';

    const out = cachePathFor(layer, z, x, y, ext);
    try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const tmp = out + '.tmp';
        fs.writeFileSync(tmp, result.buf);
        fs.renameSync(tmp, out);
        return { out, contentType: result.contentType, size: result.buf.length, source: result.url };
    } catch (e) {
        return { out: null, contentType: result.contentType, size: result.buf.length, source: result.url, buf: result.buf };
    }
}

// Accept /tile/:layer/:z/:y/:x requests from client UI and try external GIS sources
app.get('/tile/:layer/:z/:y/:x', async (req, res) => {
    try {
        const { layer, z, y, x } = req.params;

        // First check local cache for common extensions
        const exts = ['.png', '.jpg', '.jpeg', '.webp'];
        for (const ext of exts) {
            const p = cachePathFor(layer, z, x, y, ext);
            if (fs.existsSync(p)) {
                const ct = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
                res.set('Content-Type', ct);
                res.set('X-Cache', 'HIT');
                return fs.createReadStream(p).pipe(res);
            }
        }

        // Build candidate upstream URLs
        const candidates = [];
        // If environment-specified external bases exist, try each
        for (const baseRaw of EXTERNAL_TILE_BASES) {
            const base = baseRaw.replace(/\/$/, '');
            if (/arcgis|MapServer/i.test(base)) {
                candidates.push(`${base}/tile/${z}/${y}/${x}`);
                candidates.push(`${base}/tile/${z}/${y}/${x}.png`);
            }
            // chart-style
            candidates.push(`${base}/tile/${layer}/${z}/${x}/${y}.png`);
            candidates.push(`${base}/tile/${layer}/${z}/${x}/${y}`);
            candidates.push(`${base}/${layer}/${z}/${x}/${y}.png`);
        }

        // Also try forming candidate from known local geotiff charts mapping if any
        // If no external bases configured, respond 404 quickly
        if (candidates.length === 0) return res.status(404).send('No external tile sources configured');

        const cached = await fetchAndCache(layer, z, x, y, candidates);
        if (!cached) return res.status(502).send('Tile not available from external sources');
        if (cached.out && fs.existsSync(cached.out)) {
            res.set('Content-Type', cached.contentType || 'application/octet-stream');
            res.set('X-Cache', 'MISS');
            return fs.createReadStream(cached.out).pipe(res);
        }
        if (cached.buf) {
            res.set('Content-Type', cached.contentType || 'application/octet-stream');
            res.set('X-Cache', 'MISS');
            return res.send(Buffer.from(cached.buf));
        }
        return res.status(502).send('Tile fetch failed');
    } catch (e) {
        console.error('Error in /tile proxy handler:', e && e.stack ? e.stack : e);
        return res.status(500).send('Internal proxy error');
    }
});


// Try to serve cached tile from disk before rendering
app.get('/charts/:chart/:z/:x/:y.png', (req, res, next) => {
    try {
        const { chart, z, x, y } = req.params;
        const cachePath = path.join(TILE_CACHE_DIR, chart, String(z), String(x), `${y}.png`);
        if (fs.existsSync(cachePath)) {
            const stream = fs.createReadStream(cachePath);
            res.set('Content-Type', 'image/png');
            stream.pipe(res);
            stream.on('end', () => logW3C(req, res, 0));
            stream.on('error', (e) => {
                console.error('Error streaming cached tile:', e.message);
                next();
            });
            return;
        }
    } catch (e) {
        // ignore cache errors and continue to rendering
    }
    next();
});

// Serve chart tiles with on-the-fly reprojection from in-memory raster
app.get('/charts/:chart/:z/:x/:y.png', async (req, res) => {
    try {
        const { chart, z, x, y } = req.params;
        const config = chartConfigs[chart];
        if (!config) return res.status(404).json({ error: 'Chart not found' });

        const cached = tiffCache[config.path];
        if (!cached) return res.status(404).json({ error: 'Chart not loaded' });

        const zoom = parseInt(z);
        const tileX = parseInt(x);
        const tileY = parseInt(y);
        const tileSize = 256;

        const { image, raster, colorMap } = cached;
        const [geoMinX, geoMinY, geoMaxX, geoMaxY] = config.bounds;
        const chartWidth = image.getWidth();
        const chartHeight = image.getHeight();

        const webMercator = 'EPSG:3857';
        const mercatorExtent = 20037508.34;

        const tilePixels = new Uint8Array(tileSize * tileSize * 3);

        for (let i = 0; i < tileSize; i++) { // y-pixel in tile
            for (let j = 0; j < tileSize; j++) { // x-pixel in tile
                const mercX = mercatorExtent * (-1 + (2 * (tileX + j / tileSize)) / Math.pow(2, zoom));
                const mercY = mercatorExtent * (1 - (2 * (tileY + i / tileSize)) / Math.pow(2, zoom));

                const [lccX, lccY] = proj4(webMercator, config.projection, [mercX, mercY]);

                if (lccX >= geoMinX && lccX <= geoMaxX && lccY >= geoMinY && lccY <= geoMaxY) {
                    const pixelX = Math.floor(((lccX - geoMinX) / (geoMaxX - geoMinX)) * chartWidth);
                    const pixelY = Math.floor(((geoMaxY - lccY) / (geoMaxY - geoMinY)) * chartHeight);

                    if (pixelX >= 0 && pixelX < chartWidth && pixelY >= 0 && pixelY < chartHeight) {
                        const rasterIndex = pixelY * chartWidth + pixelX;
                        const paletteIndex = raster[0][rasterIndex];

                        if (colorMap && paletteIndex !== undefined) {
                            const paletteSize = colorMap.length / 3;
                            const r = colorMap[paletteIndex] >> 8;
                            const g = colorMap[paletteSize + paletteIndex] >> 8;
                            const b = colorMap[paletteSize * 2 + paletteIndex] >> 8;

                            const tileIndex = (i * tileSize + j) * 3;
                            tilePixels[tileIndex] = r;
                            tilePixels[tileIndex + 1] = g;
                            tilePixels[tileIndex + 2] = b;
                        }
                    }
                }
            }
        }

        const finalTile = await Sharp(Buffer.from(tilePixels), {
            raw: {
                width: tileSize,
                height: tileSize,
                channels: 3
            }
        }).png().toBuffer();

        // Save tile to disk cache (async, non-blocking)
        (async () => {
            try {
                const cachePath = path.join(TILE_CACHE_DIR, chart, String(zoom), String(tileX), `${tileY}.png`);
                const cacheDir = path.dirname(cachePath);
                if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
                // write temp then rename for atomicity
                fs.writeFile(cachePath + '.tmp', finalTile, (err) => {
                    if (!err) fs.rename(cachePath + '.tmp', cachePath, () => {});
                });
            } catch (e) {
                console.error('Failed to write tile cache:', e.message);
            }
        })();

        res.set('Content-Type', 'image/png');
        res.send(finalTile);

    } catch (error) {
        console.error(`[TILE REQUEST] ERROR serving tile:`, error.message, error.stack);
        sendEmptyTile(res);
    }
});

// Helper to send empty/transparent tile
async function sendEmptyTile(res) {
    const emptyTile = await Sharp({
        create: {
            width: 256,
            height: 256,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    }).png().toBuffer();
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(emptyTile);
}

// Start server
async function start() {
    await initializeCharts();
    // Start periodic pruning job
    setTimeout(() => pruneTileCache().catch(err => console.error('Initial tile prune failed:', err)), 5000);
    setInterval(() => pruneTileCache().catch(err => console.error('Tile prune failed:', err)), TILE_PRUNE_INTERVAL_SECONDS * 1000);

    app.listen(PORT, () => {
        console.log(`GeoTIFF Tile Server running on http://localhost:${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
        console.log(`Available charts: http://localhost:${PORT}/charts`);
        console.log(`W3C access log: ${logFilePath}`);
    });
}

start().catch(err => {
    console.error('Failed to start GeoTIFF server:', err);
    process.exit(1);
});

// --- Tile cache pruning and helpers ---
async function pruneTileCache() {
    try {
        console.log('Running tile cache prune...');

        // Attempt to fetch PiAware receiver location (configured in config.js)
        const piawareUrl = config && config.dataSource && config.dataSource.piAwareUrl ? config.dataSource.piAwareUrl : null;
        let receiver = null;
        if (piawareUrl) {
            try {
                const base = piawareUrl.replace('/data/aircraft.json', '');
                const receiverUrl = base + '/data/receiver.json';
                receiver = await fetchJson(receiverUrl, 2000);
            } catch (e) {
                console.warn('Could not fetch PiAware receiver.json for pruning:', e.message);
            }
        }

        const files = [];
        let total = 0;

        function walk(dir) {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const it of items) {
                const p = path.join(dir, it.name);
                if (it.isDirectory()) walk(p);
                else if (it.isFile() && p.endsWith('.png')) {
                    const stat = fs.statSync(p);
                    total += stat.size;
                    const rel = path.relative(TILE_CACHE_DIR, p).split(path.sep);
                    const meta = { path: p, size: stat.size, mtime: stat.mtimeMs };
                    if (rel.length >= 4) {
                        meta.chart = rel[0];
                        meta.z = parseInt(rel[1], 10);
                        meta.x = parseInt(rel[2], 10);
                        meta.y = parseInt(rel[3].replace('.png',''), 10);
                        if (receiver && Number.isFinite(meta.z) && Number.isFinite(meta.x) && Number.isFinite(meta.y)) {
                            const { lat, lon } = tileCenterLatLon(meta.x, meta.y, meta.z);
                            const rlat = receiver.location && receiver.location.lat ? receiver.location.lat : receiver.lat || receiver.latitude;
                            const rlon = receiver.location && receiver.location.lon ? receiver.location.lon : receiver.lon || receiver.longitude;
                            if (rlat !== undefined && rlon !== undefined) {
                                meta.distance = haversineDistance(rlat, rlon, lat, lon);
                            }
                        }
                    }
                    files.push(meta);
                }
            }
        }

        walk(TILE_CACHE_DIR);

        if (total <= TILE_CACHE_MAX_BYTES) {
            console.log(`Tile cache size OK: ${formatBytes(total)} / ${formatBytes(TILE_CACHE_MAX_BYTES)}`);
            return;
        }

        files.sort((a, b) => {
            if (a.distance !== undefined && b.distance !== undefined) return b.distance - a.distance;
            return a.mtime - b.mtime;
        });

        for (const f of files) {
            if (total <= TILE_CACHE_MAX_BYTES) break;
            try {
                fs.unlinkSync(f.path);
                total -= f.size;
                console.log(`Pruned ${f.path} (${formatBytes(f.size)}). New total: ${formatBytes(total)}`);
            } catch (e) {
                console.warn('Failed to delete cache file during prune:', f.path, e.message);
            }
        }

        console.log(`Prune complete. New cache size: ${formatBytes(total)}`);
    } catch (e) {
        console.error('Tile cache prune error:', e.message, e.stack);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function tileCenterLatLon(x, y, z) {
    const n = Math.pow(2, z);
    const lon = x / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lon };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    function toRad(deg) { return deg * Math.PI / 180; }
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // kilometers
}

function fetchJson(url, timeoutMs=2000) {
    return new Promise((resolve, reject) => {
        try {
            const httpMod = url.startsWith('https') ? require('https') : require('http');
            const req = httpMod.get(url, { timeout: timeoutMs }, (res) => {
                if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        } catch (e) { reject(e); }
    });
}
