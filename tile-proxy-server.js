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
const crypto = require('crypto');
const https = require('https');

// Setup logging to file
const LOG_FILE = path.join(__dirname, 'tile-proxy.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    // Write to file synchronously to ensure it's logged
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(`[${timestamp}] ${message}`); // Also log to console with timestamp
}

const app = express();
const PORT = process.env.PORT || 3004;
const TILE_CACHE_DIR = process.env.TILE_CACHE_DIR || path.join(__dirname, 'tile_cache');
const TILE_CACHE_MAX_BYTES = parseInt(process.env.TILE_CACHE_MAX_BYTES || String(5 * 1024 * 1024 * 1024), 10); // 5 GB default
const TILE_PRUNE_INTERVAL_SECONDS = parseInt(process.env.TILE_PRUNE_INTERVAL_SECONDS || '604800', 10); // default 7 days (was 1 hour)
const TILE_CACHE_STALE_DAYS = parseInt(process.env.TILE_CACHE_STALE_DAYS || '7', 10); // Check for updates every 7 days
const GIS_TILE_BASES = (process.env.GIS_TILE_BASES || 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Terminal/MapServer').split(';').map(s => s.trim());
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);

// Record startup script mtime for code sync checking
const STARTUP_SCRIPT_MTIME = fs.statSync(__filename).mtime;

// Load configuration
const config = require('./config');

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
    
    // Alternative aviation chart providers
    'vfr-vfrmap': 'https://vfrmap.com/tiles/{z}/{x}/{y}.jpg',
    'vfr-openaip': 'https://2.tile.maps.openaip.net/geowebcache/service/tms/1.0.0/openaip_basemap@EPSG:900913@png/{z}/{x}/{y}.png',
    // Additional ArcGIS base map layers
    'arcgis-imagery': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{flipped_y}/{x}',
    'arcgis-street': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{flipped_y}/{x}',
    'arcgis-topo': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{flipped_y}/{x}'
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

    // Check if code is out of sync
    const currentMtime = fs.statSync(__filename).mtime;
    if (currentMtime > STARTUP_SCRIPT_MTIME) {
        log(`WARNING: Code is out of sync! File modified at ${currentMtime.toISOString()}, server started with ${STARTUP_SCRIPT_MTIME.toISOString()}`);
    }

    // Create cache path
    const cacheLayer = layer;
    const cacheDir = path.join(TILE_CACHE_DIR, cacheLayer, z, x);
    const cachePath = path.join(cacheDir, `${y}.png`);
    const metaPath = `${cachePath}.meta.json`;

    // Check cache first (skip for base map layers)
    if (!['osm', 'carto', 'opentopo', 'arcgis-imagery', 'arcgis-street', 'arcgis-topo'].includes(layer)) {
        if (fs.existsSync(cachePath)) {
            const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
            const stat = fs.statSync(cachePath);
            const cacheTime = meta.timestamp ? new Date(meta.timestamp) : stat.mtime;
            const ageDays = (Date.now() - cacheTime.getTime()) / (1000 * 60 * 60 * 24);
            const isStale = ageDays > TILE_CACHE_STALE_DAYS;
            
            if (!isStale) {
                // Serve cached tile if not stale
                const size = meta.size || stat.size;
                const checksum = meta.checksum || 'unknown';
                log(`CACHE HIT: Request ${layer}/${z}/${x}/${y} -> Serving cached tile (${ageDays.toFixed(1)} days old), size: ${size} bytes, checksum: ${checksum}`);
                res.set('Content-Type', meta.contentType || 'image/png');
                res.set('Cache-Control', 'public, max-age=3600'); // Cache aviation charts for 1 hour
                return res.sendFile(cachePath);
            } else {
                log(`CACHE STALE: Request ${layer}/${z}/${x}/${y} -> Cached tile is ${ageDays.toFixed(1)} days old, fetching fresh copy`);
                // Continue to fetch fresh copy below
            }
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

    // Note: ArcGIS API key is now passed in Authorization header, not as query parameter

    try {
        log(`SERVER REQUEST: Fetching ${url} for ${layer}/${z}/${x}/${y}`);

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
                'Sec-Fetch-Site': 'cross-site',
                // Add ArcGIS API key as X-Esri-Authorization header for ArcGIS services
                ...(url.includes('arcgis.com') && config.arcgis && config.arcgis.apiKey ? {
                    'X-Esri-Authorization': `Bearer ${config.arcgis.apiKey}`
                } : {})
            }
        });
        if (response.ok && (response.headers.get('content-type')?.startsWith('image/') || response.headers.get('content-type') === 'application/octet-stream')) {
            const buffer = await response.arrayBuffer();

            // Calculate checksum
            const checksum = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

            log(`SERVER RESPONSE: ${buffer.byteLength} bytes from ${url}, status ${response.status}, content-type: ${response.headers.get('content-type')}, checksum: ${checksum}`);

            // Cache the tile (skip for base map layers)
            if (!['osm', 'carto', 'opentopo', 'arcgis-imagery', 'arcgis-street', 'arcgis-topo'].includes(layer)) {
                // Check if we should replace existing cached tile
                let shouldCache = true;
                if (fs.existsSync(cachePath)) {
                    const existingMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
                    const existingStat = fs.statSync(cachePath);
                    const existingSize = existingMeta.size || existingStat.size;
                    
                    // Allow refresh if new tile is at least 2KB (2048 bytes) - indicates it's a valid tile
                    const MIN_VALID_TILE_SIZE = 2048; // 2KB minimum for valid tiles
                    if (buffer.byteLength >= MIN_VALID_TILE_SIZE) {
                        if (buffer.byteLength > existingSize) {
                            log(`CACHE REPLACE: Replacing existing tile (${existingSize} bytes) with larger new tile (${buffer.byteLength} bytes)`);
                        } else {
                            log(`CACHE REFRESH: Refreshing existing tile (${existingSize} bytes) with valid new tile (${buffer.byteLength} bytes)`);
                        }
                    } else {
                        log(`CACHE PRESERVE: Keeping existing tile (${existingSize} bytes) - new tile is too small (${buffer.byteLength} bytes < ${MIN_VALID_TILE_SIZE})`);
                        shouldCache = false;
                    }
                }
                
                if (shouldCache) {
                    fs.mkdirSync(cacheDir, { recursive: true });
                    fs.writeFileSync(cachePath, Buffer.from(buffer));

                    // Cache metadata
                    const meta = {
                        sourceUrl: url,
                        contentType: response.headers.get('content-type'),
                        timestamp: new Date().toISOString(),
                        upstreamService: upstreamTemplate,
                        requestedLayer: layer,
                        size: buffer.byteLength,
                        checksum: checksum
                    };
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

                    log(`CACHED TILE: ${cachePath}, size: ${buffer.byteLength} bytes, checksum: ${checksum}`);
                }
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
            log(`SERVER RESPONSE: ${response.status} ${response.statusText} from ${url}, content-type: ${response.headers.get('content-type')} - not valid image, returning 404`);
            // Continue to return 404 below
        }
    } catch (e) {
        log(`Failed to fetch from upstream: ${e.message} for ${url}`);
    }

    // Return 404 for missing tiles instead of transparent PNG
    // This allows Leaflet to handle missing tiles properly
    return res.status(404).json({ error: `Tile not found: ${layer}/${z}/${x}/${y}` });
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
        log('Tile cache pruning is disabled - preserving all cached tiles');

        // Calculate current cache size for logging only
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

        log(`Tile cache size: ${formatBytes(total)} (pruning disabled)`);
    } catch (e) {
        console.error('Tile cache status check error:', e.message, e.stack);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

let pruneInterval;
let initialPruneTimeout;

// Only start the server if this file is run directly (not imported for testing)
if (require.main === module) {
  app.listen(PORT, () => {
    log(`Tile proxy server listening on port ${PORT}`);
    log(`Cache directory: ${TILE_CACHE_DIR}`);
    log(`Cache max size: ${formatBytes(TILE_CACHE_MAX_BYTES)}`);
    log(`Cache prune interval: ${TILE_PRUNE_INTERVAL_SECONDS} seconds`);

    // Start cache pruning
    initialPruneTimeout = setTimeout(() => pruneTileCache().catch(err => console.error('Initial tile prune failed:', err)), 5000);
    pruneInterval = setInterval(() => pruneTileCache().catch(err => console.error('Tile prune failed:', err)), TILE_PRUNE_INTERVAL_SECONDS * 1000);
  });
}

// Export the app and cleanup function for testing
module.exports = app;
module.exports.cleanup = () => {
  if (pruneInterval) {
    clearInterval(pruneInterval);
  }
  if (initialPruneTimeout) {
    clearTimeout(initialPruneTimeout);
  }
};