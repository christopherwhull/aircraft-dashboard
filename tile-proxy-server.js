#!/usr/bin/env node

/**
 * tile-proxy-server.js
 * Local tile proxy for FAA ArcGIS MapServer layers with disk-backed cache.
 * Based on TILE_PROXY_DOCUMENTATION.md
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Setup logging to file
const LOG_FILE = path.join(__dirname, 'tile-proxy.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    logStream.write(logMessage);
    console.log(message); // Also log to console
}

const app = express();
const PORT = process.env.PORT || 3004;
const TILE_CACHE_DIR = process.env.TILE_CACHE_DIR || path.join(__dirname, 'tile_cache');
const TILE_CACHE_MAX_BYTES = parseInt(process.env.TILE_CACHE_MAX_BYTES || String(5 * 1024 * 1024 * 1024), 10); // 5 GB default
const TILE_PRUNE_INTERVAL_SECONDS = parseInt(process.env.TILE_PRUNE_INTERVAL_SECONDS || '3600', 10); // default 1 hour
const GIS_TILE_BASES = (process.env.GIS_TILE_BASES || 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Terminal/MapServer').split(';').map(s => s.trim());
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);

// Layer to upstream URL mapping
const LAYER_UPSTREAMS = {
    'osm': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'carto': 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    'opentopo': 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    // FAA aviation chart layers from ArcGIS
    'vfr-terminal': 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Terminal/MapServer/tile/{z}/{y}/{x}',
    'vfr-sectional': 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}',
    'ifr-arealow': 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/IFR_AreaLow/MapServer/tile/{z}/{y}/{x}',
    'ifr-enroute-high': 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/IFR_High/MapServer/tile/{z}/{y}/{x}',
    // Additional ArcGIS base map layers
    'arcgis-imagery': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'arcgis-street': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    'arcgis-topo': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
};

// Ensure cache directory exists
if (!fs.existsSync(TILE_CACHE_DIR)) {
    fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
}

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Tile proxy server running',
        port: PORT,
        cacheDir: TILE_CACHE_DIR
    });
});

// Cache status
app.get('/cache/status', (req, res) => {
    try {
        let totalFiles = 0;
        let totalBytes = 0;

        function walk(dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    walk(fullPath);
                } else {
                    totalFiles++;
                    totalBytes += stat.size;
                }
            }
        }

        walk(TILE_CACHE_DIR);

        res.json({
            cacheDir: TILE_CACHE_DIR,
            totalFiles,
            totalBytes,
            totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(2)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Clear cache
app.post('/cache/clear', express.json(), (req, res) => {
    try {
        const backup = req.body && req.body.backup;
        if (backup) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = `${TILE_CACHE_DIR}_backup_${timestamp}`;
            fs.renameSync(TILE_CACHE_DIR, backupDir);
            fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
            res.json({ message: `Cache cleared with backup: ${backupDir}` });
        } else {
            // Remove all files
            function removeDir(dir) {
                if (fs.existsSync(dir)) {
                    fs.readdirSync(dir).forEach(file => {
                        const fullPath = path.join(dir, file);
                        if (fs.statSync(fullPath).isDirectory()) {
                            removeDir(fullPath);
                        } else {
                            fs.unlinkSync(fullPath);
                        }
                    });
                    fs.rmdirSync(dir);
                }
            }
            removeDir(TILE_CACHE_DIR);
            fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
            res.json({ message: 'Cache cleared' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tile metadata
app.get('/cache/tile-metadata', (req, res) => {
    const { layer, z, x, y } = req.query;
    if (!z || !x || !y) {
        return res.status(400).json({ error: 'Missing z, x, y parameters' });
    }

    const cacheLayer = layer || 'default';
    const tilePath = path.join(TILE_CACHE_DIR, cacheLayer, z, x, `${y}.jpg`);
    const metaPath = `${tilePath}.meta.json`;

    try {
        if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            res.json(meta);
        } else if (fs.existsSync(tilePath)) {
            const stat = fs.statSync(tilePath);
            res.json({
                contentType: 'image/jpeg',
                size: stat.size,
                mtime: stat.mtime.toISOString()
            });
        } else {
            res.status(404).json({ error: 'Tile not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tile serving with caching
app.get('/tile/:layer/:z/:x/:y', async (req, res) => {
    const { layer, z, x, y } = req.params;

    // Create cache path
    const cacheLayer = layer;
    const cacheDir = path.join(TILE_CACHE_DIR, cacheLayer, z, x);
    const cachePath = path.join(cacheDir, `${y}.png`);
    const metaPath = `${cachePath}.meta.json`;

    // Check cache first (skip for base map layers)
    if (!['osm', 'carto', 'opentopo', 'arcgis-imagery', 'arcgis-street', 'arcgis-topo'].includes(layer)) {
        if (fs.existsSync(cachePath)) {
            const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
            log(`Serving from cache: ${cachePath} for ${layer}/${z}/${x}/${y}`);
            res.set('Content-Type', meta.contentType || 'image/png');
            // Set cache control based on layer type
            if (['osm', 'carto', 'opentopo', 'arcgis-imagery', 'arcgis-street', 'arcgis-topo'].includes(layer)) {
                res.set('Cache-Control', 'public, max-age=86400'); // Cache base maps for 24 hours
            } else {
                res.set('Cache-Control', 'public, max-age=3600'); // Cache aviation charts for 1 hour
            }
            return res.sendFile(cachePath);
        }
    }

    // Get upstream URL for this layer
    const upstreamTemplate = LAYER_UPSTREAMS[layer];
    if (!upstreamTemplate) {
        return res.status(404).json({ error: `Unknown layer: ${layer}` });
    }

    // Build URL
    const flippedY = Math.pow(2, parseInt(z)) - 1 - parseInt(y);
    let url = upstreamTemplate
        .replace('{z}', z)
        .replace('{x}', x)
        .replace('{y}', y)
        .replace('{flipped_y}', flippedY)
        .replace('{s}', 'a') // subdomain, default to 'a'
        .replace('{r}', ''); // retina, empty for now

    try {
        log(`Fetching ${url}`);

        const response = await fetch(url, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.arcgis.com/',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site'
            }
        });
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
            const buffer = await response.arrayBuffer();

            log(`Fetched ${buffer.byteLength} bytes from ${url}, status ${response.status}`);

            // Cache the tile (skip for base map layers)
            if (!['osm', 'carto', 'opentopo', 'arcgis-imagery', 'arcgis-street', 'arcgis-topo'].includes(layer)) {
                fs.mkdirSync(cacheDir, { recursive: true });
                fs.writeFileSync(cachePath, Buffer.from(buffer));

                // Cache metadata
                const meta = {
                    sourceUrl: url,
                    contentType: response.headers.get('content-type'),
                    timestamp: new Date().toISOString(),
                    upstreamService: upstreamTemplate,
                    requestedLayer: layer,
                    size: buffer.byteLength
                };
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            }

            res.set('Content-Type', response.headers.get('content-type'));
            // Set cache control based on layer type
            if (['osm', 'carto', 'opentopo', 'arcgis-imagery', 'arcgis-street', 'arcgis-topo'].includes(layer)) {
                res.set('Cache-Control', 'public, max-age=86400'); // Cache base maps for 24 hours
            } else {
                res.set('Cache-Control', 'public, max-age=3600'); // Cache aviation charts for 1 hour
            }
            return res.send(Buffer.from(buffer));
        } else {
            console.warn(`Failed to fetch: ${response.status} ${response.statusText} for ${url}`);
        }
    } catch (e) {
        log(`Failed to fetch from upstream: ${e.message} for ${url}`);
    }

    // Return transparent 1x1 pixel PNG for missing tiles (normal for areas outside chart coverage)
    // This prevents Leaflet from showing tile errors for areas without aviation chart coverage
    const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache missing tiles for 1 hour
    return res.send(transparentPng);
});

// Legacy routes
app.get('/tile/:z/:y/:x', (req, res) => {
    res.redirect(`/tile/default/${req.params.z}/${req.params.y}/${req.params.x}`);
});

app.get('/:layer/:z/:x/:y', (req, res) => {
    res.redirect(`/tile/${req.params.layer}/${req.params.z}/${req.params.y}/${req.params.x}`);
});

// Cache pruning
async function pruneTileCache() {
    try {
        log('Running tile cache prune...');

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
                    files.push({ path: p, size: stat.size, mtime: stat.mtimeMs });
                }
            }
        }

        walk(TILE_CACHE_DIR);

        if (total <= TILE_CACHE_MAX_BYTES) {
            log(`Tile cache size OK: ${formatBytes(total)} / ${formatBytes(TILE_CACHE_MAX_BYTES)}`);
            return;
        }

        // Sort by modification time (oldest first)
        files.sort((a, b) => a.mtime - b.mtime);

        for (const f of files) {
            if (total <= TILE_CACHE_MAX_BYTES) break;
            try {
                fs.unlinkSync(f.path);
                total -= f.size;
                log(`Pruned ${f.path} (${formatBytes(f.size)}). New total: ${formatBytes(total)}`);
            } catch (e) {
                console.warn('Failed to delete cache file during prune:', f.path, e.message);
            }
        }

        log(`Prune complete. New cache size: ${formatBytes(total)}`);
    } catch (e) {
        console.error('Tile cache prune error:', e.message, e.stack);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

app.listen(PORT, () => {
    log(`Tile proxy server listening on port ${PORT}`);
    log(`Cache directory: ${TILE_CACHE_DIR}`);
    log(`Cache max size: ${formatBytes(TILE_CACHE_MAX_BYTES)}`);
    log(`Cache prune interval: ${TILE_PRUNE_INTERVAL_SECONDS} seconds`);

    // Start cache pruning
    setTimeout(() => pruneTileCache().catch(err => console.error('Initial tile prune failed:', err)), 5000);
    setInterval(() => pruneTileCache().catch(err => console.error('Tile prune failed:', err)), TILE_PRUNE_INTERVAL_SECONDS * 1000);
});