// tile-proxy-server.js
// Simple tile proxy for ArcGIS MapServer and chart tile endpoints.
// - Proxies requests for /tile/:layer/:z/:y/:x, /tile/:z/:y/:x and /:layer/:z/:x/:y
// - Attempts several candidate upstream URLs (ArcGIS REST /tile/{z}/{y}/{x}, chart-style /{layer}/{z}/{x}/{y}.png, etc.)
// - Caches successful responses on disk under TILE_CACHE_DIR
// - Exposes GET /cache/status to inspect cache size and file count
//
// Usage:
//   TILE_PROXY_TARGET=http://tiles.example.com/MapServer PORT=3003 node tile-proxy-server.js

const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

const config = require('./config');
// Use a dedicated tile-proxy port from config.js (fallback to 3004)
const PORT = (config && config.server && config.server.tileProxyPort) ? parseInt(config.server.tileProxyPort, 10) : 3004;
// `config.gisTileBases` is the canonical upstream list for tiles
const TILE_PROXY_TARGET = '';
const TILE_CACHE_DIR = path.join(process.cwd(), 'tile_cache');
const REQUEST_TIMEOUT_MS = 5000;
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'tile-proxy.log');

// When true, only upstream bases that explicitly reference the requested
// layer name are used. This prevents the proxy from falling back to a
// different MapServer/service (which can cause a request for one logical
// layer to return tiles from another service). Enable by setting
// `tileProxy.strictLayerMatch = true` in `config.js`.
const STRICT_LAYER_MATCH = !!(config && config.tileProxy && config.tileProxy.strictLayerMatch);

if (!fs.existsSync(LOG_DIR)) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}
}
let _logStream = null;
try {
    _logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
} catch (e) {
    console.error('Failed to open tile proxy log file', LOG_FILE, e && e.message ? e.message : e);
}

function logToFile(line) {
    try {
        const ts = new Date().toISOString();
        const out = `[${ts}] ${line}\n`;
        if (_logStream) _logStream.write(out);
    } catch (e) {
        // ignore
    }
}

function log() {
    try {
        const args = Array.from(arguments).map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        console.log(args);
        logToFile(args);
    } catch (e) {
        console.log.apply(console, arguments);
    }
}

if (!fs.existsSync(TILE_CACHE_DIR)) fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });

const app = express();
app.use(morgan('combined'));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cachePathFor(layer, z, x, y, ext) {
    const safeLayer = layer ? layer.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'tiles';
    const dir = path.join(TILE_CACHE_DIR, safeLayer, String(z), String(x));
    const filename = `${y}${ext}`; // ext includes dot
    return path.join(dir, filename);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, dm = 2, sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function tryFetchCandidates(candidates) {
    for (const url of candidates) {
        try {
            log(`[proxy] trying upstream: ${url}`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (res) {
                log(`[proxy] upstream response for ${url}: ${res.status} ${res.statusText || ''}`);
            }
            if (res && res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                const ct = res.headers.get('content-type') || 'application/octet-stream';
                log(`[proxy] success from ${url} (bytes=${buf.length}, ct=${ct})`);
                return { url, buf, contentType: ct };
            }
        } catch (e) {
            log(`[proxy] error fetching ${url}: ${e && e.message ? e.message : e}`);
            // try next candidate
        }
    }
    return null;
}

async function fetchAndCache(layer, z, x, y, candidates) {
    const result = await tryFetchCandidates(candidates);
    if (!result) return null;
    // decide extension from content-type
    let ext = '.png';
    if (/jpeg|jpg/i.test(result.contentType)) ext = '.jpg';
    else if (/png/i.test(result.contentType)) ext = '.png';
    else if (/webp/i.test(result.contentType)) ext = '.webp';

    // Determine the upstream service name from the successful URL when possible.
    // If the upstream URL indicates a different MapServer/service than the
    // requested `layer`, prefer using the upstream service name for the cache
    // path to avoid writing IFR tiles into VFR cache directories (and vice versa).
    let cacheLayer = layer || 'arc';
    try {
        const m = /\/services\/([^\/]+)\/MapServer/i.exec(result.url || '');
        if (m && m[1]) {
            // ArcGIS services sometimes include URL-encoded names; normalize
            cacheLayer = decodeURIComponent(m[1]);
        }
    } catch (e) {
        // ignore parsing errors and use provided layer
    }

    if (cacheLayer !== (layer || 'arc')) {
        log(`[proxy] upstream service name '${cacheLayer}' differs from requested layer '${layer}'; caching under '${cacheLayer}'`);
    }

    const out = cachePathFor(cacheLayer, z, x, y, ext);
    // Only cache image/* content types to disk. Avoid caching HTML or JSON error pages.
    const isImage = /^image\//i.test(result.contentType || '');
    if (!isImage) {
        log(`[proxy] non-image content-type '${result.contentType}' from ${result.url}; not caching to disk`);
        return { out: null, contentType: result.contentType, size: result.buf.length, source: result.url, buf: result.buf };
    }
    try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        // atomic write
        const tmp = out + '.tmp';
        fs.writeFileSync(tmp, result.buf);
        // Attempt atomic rename; Windows sometimes fails with EPERM when files are
        // briefly locked by other processes. If rename fails, fall back to copy
        // + unlink to ensure the tile is persisted.
        try {
            fs.renameSync(tmp, out);
        } catch (renameErr) {
            log(`[proxy] rename failed ${tmp} -> ${out}: ${renameErr && renameErr.message ? renameErr.message : renameErr}`);
            try {
                fs.copyFileSync(tmp, out);
                fs.unlinkSync(tmp);
                log(`[proxy] fallback copy+unlink succeeded for ${out}`);
            } catch (fallbackErr) {
                log(`[proxy] fallback copy/unlink failed for ${tmp} -> ${out}: ${fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr}`);
                // rethrow so outer catch will handle and we won't pretend the tile was cached
                throw fallbackErr;
            }
        }
        // write metadata next to tile
        try {
            const meta = {
                sourceUrl: result.url,
                contentType: result.contentType,
                timestamp: new Date().toISOString(),
                upstreamService: cacheLayer,
                requestedLayer: layer || null,
                size: result.buf.length
            };
            const metaPath = out + '.meta.json';
            const tmpMeta = metaPath + '.tmp';
            fs.writeFileSync(tmpMeta, JSON.stringify(meta));
            try { fs.renameSync(tmpMeta, metaPath); } catch (e) { try { fs.copyFileSync(tmpMeta, metaPath); fs.unlinkSync(tmpMeta); } catch (e2) { log(`[proxy] failed to write metadata ${metaPath}: ${e2 && e2.message ? e2.message : e2}`); } }
        } catch (me) {
            log(`[proxy] metadata write failed for ${out}: ${me && me.message ? me.message : me}`);
        }
        const maxCandidatesToShow = 6;
        log(`[proxy] cached tile to ${out} (bytes=${result.buf.length}) from ${result.url}; candidates:`);
        const candidatesToShow = candidates.slice(0, maxCandidatesToShow);
        for (const c of candidatesToShow) log(`  - ${c}`);
        if (candidates.length > maxCandidatesToShow) log(`  - ... and ${candidates.length - maxCandidatesToShow} more`);
        return { out, contentType: result.contentType, size: result.buf.length, source: result.url };
    } catch (e) {
        log(`[proxy] failed to write cache file ${out}: ${e && e.message ? e.message : e}`);
        // if write fails, still return buffer
        return { out: null, contentType: result.contentType, size: result.buf.length, source: result.url, buf: result.buf };
    }
}

function dirStats(dir) {
    let total = 0, files = 0;
    function walk(d) {
        if (!fs.existsSync(d)) return;
        const items = fs.readdirSync(d, { withFileTypes: true });
        for (const it of items) {
            const p = path.join(d, it.name);
            if (it.isDirectory()) walk(p);
            else if (it.isFile()) {
                files++;
                try { total += fs.statSync(p).size; } catch(e) {}
            }
        }
    }
    walk(dir);
    return { total, files };
}

app.get('/cache/status', (req, res) => {
    const st = dirStats(TILE_CACHE_DIR);
    res.json({ cacheDir: TILE_CACHE_DIR, totalBytes: st.total, files: st.files, human: formatBytes(st.total) });
});

// POST /cache/clear
// Optional query param `layer` to clear a single layer directory instead of the whole cache.
app.post('/cache/clear', (req, res) => {
    try {
        const layer = req.query.layer ? String(req.query.layer).trim() : null;
        const parent = path.dirname(TILE_CACHE_DIR);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        let dst = null;

        if (layer) {
            const safeLayer = layer.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const src = path.join(TILE_CACHE_DIR, safeLayer);
            if (!fs.existsSync(src)) {
                log(`[proxy] clear cache requested for layer '${safeLayer}', but directory not found: ${src}`);
                return res.json({ ok: true, message: 'layer not found', layer: safeLayer });
            }
            dst = path.join(parent, `tile_cache_backup_${safeLayer}_${ts}`);
            let i = 1;
            while (fs.existsSync(dst)) { dst = path.join(parent, `tile_cache_backup_${safeLayer}_${ts}_${i}`); i++; }
            try {
                fs.renameSync(src, dst);
                log(`[proxy] backed up layer cache ${src} -> ${dst}`);
            } catch (err) {
                log(`[proxy] rename failed for layer cache ${src} -> ${dst}: ${err && err.message ? err.message : err}`);
                try {
                    fs.cpSync(src, dst, { recursive: true });
                    fs.rmSync(src, { recursive: true, force: true });
                    log(`[proxy] copied then removed layer cache ${src} -> ${dst}`);
                } catch (err2) {
                    log(`[proxy] fallback copy/remove failed: ${err2 && err2.stack ? err2.stack : err2}`);
                    throw err2;
                }
            }
            return res.json({ ok: true, backedUp: dst, layer: safeLayer });
        }

        // Full cache clear
        if (fs.existsSync(TILE_CACHE_DIR)) {
            dst = path.join(parent, `tile_cache_backup_${ts}`);
            let i = 1;
            while (fs.existsSync(dst)) { dst = path.join(parent, `tile_cache_backup_${ts}_${i}`); i++; }
            try {
                fs.renameSync(TILE_CACHE_DIR, dst);
                log(`[proxy] backed up entire tile_cache -> ${dst}`);
            } catch (err) {
                log(`[proxy] rename failed for entire cache ${TILE_CACHE_DIR} -> ${dst}: ${err && err.message ? err.message : err}`);
                try {
                    fs.cpSync(TILE_CACHE_DIR, dst, { recursive: true });
                    fs.rmSync(TILE_CACHE_DIR, { recursive: true, force: true });
                    log(`[proxy] copied then removed entire tile_cache -> ${dst}`);
                } catch (err2) {
                    log(`[proxy] fallback copy/remove failed for entire cache: ${err2 && err2.stack ? err2.stack : err2}`);
                    throw err2;
                }
            }
        } else {
            log('[proxy] clear cache requested but tile_cache does not exist');
            dst = null;
        }
        // recreate empty cache dir
        fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
        log('[proxy] recreated empty tile_cache directory');
        return res.json({ ok: true, backedUpTo: dst || null });
    } catch (e) {
        log('[proxy] cache clear failed:', e && e.stack ? e.stack : e);
        return res.status(500).json({ ok: false, error: String(e), stack: (e && e.stack) ? e.stack : null });
    }
});

// GET /cache/tile-metadata?layer=...&z=...&x=...&y=...
// Returns the metadata JSON written alongside cached tiles, or basic file info
// if the tile exists but no metadata was written.
app.get('/cache/tile-metadata', (req, res) => {
    try {
        const layer = req.query.layer ? String(req.query.layer).trim() : null;
        const z = req.query.z != null ? String(req.query.z).trim() : null;
        const x = req.query.x != null ? String(req.query.x).trim() : null;
        const y = req.query.y != null ? String(req.query.y).trim() : null;
        if (!z || !x || !y) return res.status(400).json({ ok: false, error: 'missing required query params z,x,y' });

        const searchLayer = layer || 'arc';
        const exts = ['.png', '.jpg', '.jpeg', '.webp'];
        for (const ext of exts) {
            const tilePath = cachePathFor(searchLayer, z, x, y, ext);
            const metaPath = tilePath + '.meta.json';
            if (fs.existsSync(metaPath)) {
                try {
                    const raw = fs.readFileSync(metaPath, 'utf8');
                    const meta = JSON.parse(raw);
                    return res.json({ ok: true, meta, tilePath, metaPath });
                } catch (e) {
                    log(`[proxy] failed to read/parse metadata ${metaPath}: ${e && e.message ? e.message : e}`);
                    return res.status(500).json({ ok: false, error: 'failed to read metadata', detail: String(e) });
                }
            }
            if (fs.existsSync(tilePath)) {
                try {
                    const st = fs.statSync(tilePath);
                    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
                    const meta = { contentType, size: st.size, mtime: st.mtime.toISOString(), upstreamService: searchLayer, requestedLayer: layer || null };
                    return res.json({ ok: true, meta, tilePath });
                } catch (e) {
                    log(`[proxy] failed to stat tile ${tilePath}: ${e && e.message ? e.message : e}`);
                }
            }
        }
        return res.status(404).json({ ok: false, error: 'metadata not found' });
    } catch (e) {
        log('[proxy] tile-metadata error:', e && e.stack ? e.stack : e);
        return res.status(500).json({ ok: false, error: String(e) });
    }
});

// Accept both ArcGIS-style /tile/:z/:y/:x and chart-style /tile/:layer/:z/:x/:y
app.get(['/tile/:layer/:z/:y/:x', '/tile/:z/:y/:x'], async (req, res) => {
    try {
        const params = req.params;
        let layer = params.layer;
        let z, x, y;
        if (params.x !== undefined && params.y !== undefined && params.z !== undefined && layer) {
            // /tile/:layer/:z/:y/:x  (note ordering in some clients differs)
            z = params.z; y = params.y; x = params.x; // preserve user ordering
        }
        if (!z && params.z && params.y && params.x) {
            // could be /tile/:z/:y/:x
            z = params.z; y = params.y; x = params.x;
        }

        // build candidate upstream URLs
        // Build list of candidate bases: use `config.gisTileBases` defined in `config.js`
        let bases = [];
        if (Array.isArray(config.gisTileBases) && config.gisTileBases.length) {
            bases = config.gisTileBases.map(s => String(s).trim()).filter(Boolean);
        }

        // Build candidate upstream URLs from all configured bases (env or config)
        const candidates = [];
        const fallbackBase = 'http://localhost:3003';
        // If a layer is requested, prefer any configured base URL that already
        // references that layer (e.g. .../IFR_AreaLow/MapServer). This avoids
        // serving an image from a different MapServer under the wrong layer
        // cache key (which was causing IFR tiles to be cached under VFR paths).
        let useBases = (bases.length ? bases : [fallbackBase]);
        if (layer && useBases.length > 1) {
            const lowerLayer = String(layer).toLowerCase();
            const preferred = useBases.filter(b => String(b).toLowerCase().includes(lowerLayer));
            if (preferred.length) {
                if (STRICT_LAYER_MATCH) {
                    // Only use bases that explicitly reference the requested layer.
                    useBases = preferred;
                } else {
                    // move preferred bases to the front, preserving order (legacy behavior)
                    useBases = [...preferred, ...useBases.filter(b => !preferred.includes(b))];
                }
            }
        }
        for (const bRaw of useBases) {
            const b = String(bRaw).replace(/\/$/, '');
            if (/arcgis|MapServer/i.test(b)) {
                // ArcGIS REST uses /tile/{z}/{y}/{x}
                candidates.push(`${b}/tile/${z}/${y}/${x}`);
                candidates.push(`${b}/tile/${z}/${y}/${x}.png`);
            }
            // chart-style candidates
            if (layer) {
                candidates.push(`${b}/tile/${layer}/${z}/${x}/${y}.png`);
                candidates.push(`${b}/tile/${layer}/${z}/${x}/${y}`);
                candidates.push(`${b}/${layer}/${z}/${x}/${y}.png`);
                candidates.push(`${b}/${layer}/${z}/${y}/${x}.png`);
            } else {
                // no layer provided: try direct tile/{z}/{x}/{y} with/without ext
                candidates.push(`${b}/tile/${z}/${x}/${y}.png`);
                candidates.push(`${b}/tile/${z}/${x}/${y}`);
            }
        }

        // try cache first
        // look for common extensions
        const exts = ['.png', '.jpg', '.jpeg', '.webp'];
        for (const ext of exts) {
            const p = cachePathFor(layer || 'arc', z, x, y, ext);
            if (fs.existsSync(p)) {
                const ct = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
                res.setHeader('Content-Type', ct);
                res.setHeader('X-Cache', 'HIT');
                log(`[proxy] cache HIT for ${layer || 'arc'} ${z}/${x}/${y} -> ${p}`);
                fs.createReadStream(p).pipe(res);
                return;
            }
        }

        const maxCandidatesToShow = 6;
        log(`[proxy] cache MISS for ${layer || 'arc'} ${z}/${x}/${y}; candidates (${candidates.length}):`);
        const candidatesToShow = candidates.slice(0, maxCandidatesToShow);
        for (const c of candidatesToShow) log(`  - ${c}`);
        if (candidates.length > maxCandidatesToShow) log(`  - ... and ${candidates.length - maxCandidatesToShow} more`);
        const cached = await fetchAndCache(layer, z, x, y, candidates);
        if (!cached) return res.status(502).send('Tile not available');
        if (cached.out && fs.existsSync(cached.out)) {
            res.setHeader('Content-Type', cached.contentType || 'application/octet-stream');
            res.setHeader('X-Cache', 'MISS');
            log(`[proxy] serving cached file ${cached.out} (source: ${cached.source})`);
            fs.createReadStream(cached.out).pipe(res);
            return;
        }
        // fallback: if buffer available, send directly
        if (cached.buf) {
            res.setHeader('Content-Type', cached.contentType || 'application/octet-stream');
            res.setHeader('X-Cache', 'MISS');
            log(`[proxy] serving buffer response (bytes=${cached.size}) from ${cached.source}`);
            return res.send(Buffer.from(cached.buf));
        }
        return res.status(502).send('Tile fetch failed');
    } catch (e) {
        console.error('Tile proxy error:', e && e.stack ? e.stack : e);
        return res.status(500).send('Internal error');
    }
});

// Also accept legacy chart-style /:layer/:z/:x/:y (some client code uses this pattern)
app.get('/:layer/:z/:x/:y', async (req, res) => {
    // reuse logic by rewriting to /tile/:layer/:z/:y/:x but careful about param order
    const { layer, z, x, y } = req.params;
    // forward to same handler by building candidates and caching here
    try {
        // Build candidate bases similar to the /tile handler
        let bases = [];
        if (Array.isArray(config.gisTileBases) && config.gisTileBases.length) {
            bases = config.gisTileBases.map(s => String(s).trim()).filter(Boolean);
        }
        const candidates = [];
        const fallbackBase = 'http://localhost:3003';
        let useBases = (bases.length ? bases : [fallbackBase]);
        if (layer && useBases.length > 1) {
            const lowerLayer = String(layer).toLowerCase();
            const preferred = useBases.filter(b => String(b).toLowerCase().includes(lowerLayer));
            if (preferred.length) {
                if (STRICT_LAYER_MATCH) {
                    useBases = preferred;
                } else {
                    useBases = [...preferred, ...useBases.filter(b => !preferred.includes(b))];
                }
            }
        }
        for (const bRaw of useBases) {
            const base = String(bRaw).replace(/\/$/, '');
            if (/arcgis|MapServer/i.test(base)) {
                candidates.push(`${base}/tile/${z}/${y}/${x}`);
                candidates.push(`${base}/tile/${z}/${y}/${x}.png`);
            }
            candidates.push(`${base}/tile/${layer}/${z}/${x}/${y}.png`);
            candidates.push(`${base}/${layer}/${z}/${x}/${y}.png`);
        }

        // check cache first
        const exts = ['.png', '.jpg', '.jpeg', '.webp'];
        for (const ext of exts) {
            const p = cachePathFor(layer, z, x, y, ext);
            if (fs.existsSync(p)) {
                const ct = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
                res.setHeader('Content-Type', ct);
                res.setHeader('X-Cache', 'HIT');
                fs.createReadStream(p).pipe(res);
                return;
            }
        }

        const cached = await fetchAndCache(layer, z, x, y, candidates);
        if (!cached) return res.status(502).send('Tile not available');
        if (cached.out && fs.existsSync(cached.out)) {
            res.setHeader('Content-Type', cached.contentType || 'application/octet-stream');
            res.setHeader('X-Cache', 'MISS');
            fs.createReadStream(cached.out).pipe(res);
            return;
        }
        if (cached.buf) {
            res.setHeader('Content-Type', cached.contentType || 'application/octet-stream');
            res.setHeader('X-Cache', 'MISS');
            return res.send(Buffer.from(cached.buf));
        }
        return res.status(502).send('Tile fetch failed');
    } catch (e) {
        console.error('Proxy error:', e);
        return res.status(500).send('Internal error');
    }
});

app.get('/', (req, res) => {
    const targets = Array.isArray(config.gisTileBases) ? config.gisTileBases.join(', ') : '(none configured)';
    res.send(`Tile proxy running. Upstream bases: ${targets}. Cache dir: ${TILE_CACHE_DIR}`);
});

app.listen(PORT, () => {
    console.log(`Tile proxy server listening on http://localhost:${PORT}`);
    console.log(`Upstream bases: ${Array.isArray(config.gisTileBases) ? config.gisTileBases.join(', ') : '(none configured)'}`);
    console.log(`Tile cache dir: ${TILE_CACHE_DIR}`);
});

module.exports = app;
