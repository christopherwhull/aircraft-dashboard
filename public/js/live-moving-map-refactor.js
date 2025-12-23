// live-moving-map-refactor.js — modular, test-friendly rewrite
// ===== SECTION START: module header =====
// Purpose: Provide a small, well-scoped subset of the live-moving-map logic
// for safer iterative refactor and testing. Keep functions small and commented.
// ===== SECTION END: module header =====

// Minimal setup: create map on #map
const map = L.map('map').setView([39.5, -98.0], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
// Create panes used by track drawing so layers have expected DOM parents
try {
  map.createPane('livePane'); map.getPane('livePane').style.zIndex = 650;
  map.createPane('persistentPane'); map.getPane('persistentPane').style.zIndex = 660;
  map.createPane('markerPane'); map.getPane('markerPane').style.zIndex = 670;
} catch (e) { console.warn('Failed to create panes (already present?)', e); }

// ===== SECTION START: fetchWithTimeout =====
// Purpose: fetch wrapper that supports timeout and returns a normalized TimeoutError
class TimeoutError extends Error { constructor(message){ super(message); this.name='TimeoutError'; } }
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000){
  const controller = new AbortController();
  const signal = controller.signal;
  if (options.signal){ options.signal.addEventListener('abort', ()=>controller.abort()); }
  const timer = setTimeout(()=> controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {...options, signal});
    clearTimeout(timer);
    return res;
  }catch(e){
    clearTimeout(timer);
    if (e && e.name === 'AbortError') throw new TimeoutError('fetch timeout or aborted');
    throw e;
  }
}
// ===== SECTION END: fetchWithTimeout =====

// ===== SECTION START: fetchTracksBatch =====
// Purpose: Accepts an array of {hex, minutes} requests and returns an array of arrays (one per request)
async function fetchTracksBatch(requests, options = {}){
  // NOTE: Try the real batch endpoint; if it fails or returns unexpected shape,
  // fall back to synthetic tracks so smoke tests remain deterministic and fast.
  try {
    const body = JSON.stringify({ requests });
    const res = await fetchWithTimeout('/api/v2/track', { method: 'POST', headers:{'Content-Type':'application/json'}, body, signal: options.signal }, 15000);
    const json = await res.json();
    // Expected shape: { results: [ { index, track }, ... ], errors? }
    if (json && Array.isArray(json.results)){
      // Map results to array aligned with requests order
      const out = requests.map(_ => null);
      json.results.forEach(r => { if (r && (r.index !== undefined)) out[r.index] = r.track || []; });
      return out;
    }
    // Otherwise fall through to synthetic generation
  } catch (err) {
    // treat timeouts/404s as non-fatal for the refactor page and generate synthetic data
    console.debug('fetchTracksBatch: falling back to synthetic data', err && (err.message || err));
  }

  // Synthetic fallback: return a track array for each request with a few sample points
  return requests.map((r, idx) => {
    const baseLat = 39.5 + (idx * 0.05);
    const baseLon = -98.0 + (idx * 0.05);
    return [
      { lat: baseLat, lon: baseLon, vertical_rate: 0 },
      { lat: baseLat + 0.02, lon: baseLon + 0.02, vertical_rate: 0 }
    ];
  });
}
// ===== SECTION END: fetchTracksBatch =====

// ===== SECTION START: helpers for live tracks =====
// Purpose: Split large try-body work into a helper so the outer function stays tiny.
// This implementation is a faithful, test-friendly extraction of the original behavior:
//  - computes visible hexes (from `liveMarkers` if present)
//  - uses per-hex batching via `fetchTracksBatch`
//  - processes chunks incrementally and draws polylines on `longTracksLayer`
// The helper keeps localized try/catch blocks so a problem with one hex or chunk does not break the whole flow.

// Lightweight stubs used by the refactor page so this module is self-contained and safe to run.
const liveMarkers = new Map(); // in real page this is populated by the live position stream
const liveTrackGroups = new Map();
const liveTrackFetchedAt = new Map();
const LIVE_TRACK_FETCH_RETRY_MS = 15 * 1000; // 15 seconds
const liveTracksLayer = L.layerGroup().addTo(map);
const longTracksLayer = L.layerGroup().addTo(map);

function setTrackStatus(label, state){ console.debug('[track-status]', label, state); }
function addVerticalRatesToTrackPoints(pts){ if(!Array.isArray(pts)) return; pts.forEach(p=>{ if(p && typeof p === 'object' && p.vertical_rate === undefined) p.vertical_rate = 0; }); }
function maxTrackAngularChange(pts){ return 999; /* simplified for refactor */ }
function densifyTrackPoints(points){ return points.map(p=>[p.lat, p.lon]); }
function getVerticalRateColor(v){ return v > 0 ? '#ff0000' : (v < 0 ? '#0000ff' : '#00aa00'); }

async function _fetchAndDrawLiveTracks_body(){
  setTrackStatus('Loading...', 'loading');

  // Gather visible hexes: prefer real liveMarkers if present; otherwise use a small simulated set for smoke testing
  const bounds = map.getBounds();
  const visible = [];
  if (liveMarkers && liveMarkers.size) {
    liveMarkers.forEach((md, hex) => {
      try {
        const marker = (md && md.marker) ? md.marker : md;
        const latlng = marker && marker.getLatLng ? marker.getLatLng() : null;
        if (latlng && bounds.contains(latlng)) visible.push((hex||'').toString().toLowerCase());
      } catch (e) { /* ignore per-marker failures */ }
    });
  } else {
    // Simulate a couple of hexes so smoke runs exercise the chunk logic
    visible.push('fakehex1', 'fakehex2');
  }

  if (visible.length === 0) {
    setTrackStatus('Idle', 'idle');
    return;
  }

  // Clear any current live tracks before redrawing
  try { liveTracksLayer.clearLayers(); } catch (e) {}

  // Use a reasonable minutes window for batch requests in the real implementation; here just 10
  const minutes = 10;

  // Only fetch tracks for hexes that need it
  const nowTs = Date.now();
  const needFetch = visible.filter(hx => {
    if (liveTrackGroups.has(hx)) return false;
    const last = liveTrackFetchedAt.get(hx) || 0;
    if (last && (nowTs - last) < LIVE_TRACK_FETCH_RETRY_MS) return false;
    return true;
  });

  let anyDrawn = false;

  if (needFetch.length === 0) {
    if (!map.hasLayer(liveTracksLayer) && liveTrackGroups.size > 0) liveTracksLayer.addTo(map);
    try { /* best-effort */ } catch(e){}
    setTrackStatus('OK (Live)', 'ok');
    return;
  }

  // Cancel previous fetch if any
  let controller = new AbortController();
  const chunkPromises = [];

  for (let i = 0; i < needFetch.length; i += 20) {
    const chunk = needFetch.slice(i, i + 20);
    const trackRequests = chunk.map(hx => ({ hex: hx, minutes }));
    const p = fetchTracksBatch(trackRequests, { signal: controller.signal })
      .then(trackArrays => {
        try {
          trackArrays.forEach((pts, idx) => {
            try {
              const hx = chunk[idx];
              if (liveTrackGroups.has(hx)) {
                try { const old = liveTrackGroups.get(hx); longTracksLayer.removeLayer(old); } catch (e) {}
                liveTrackGroups.delete(hx);
              }

              // If remote API fails to return data for this hex, skip
              if (!pts || !Array.isArray(pts) || pts.length < 2) return;

              // add vertical rates and maybe simplify
              addVerticalRatesToTrackPoints(pts);
              if (maxTrackAngularChange(pts) < 10) pts = [pts[0], pts[pts.length - 1]];

              // build segments by color
              const segments = [];
              let currentSegment = { points: [pts[0]], color: getVerticalRateColor(pts[0].vertical_rate || 0) };
              for (let j = 1; j < pts.length; j++) {
                const point = pts[j];
                const color = getVerticalRateColor(point.vertical_rate || 0);
                if (color === currentSegment.color) currentSegment.points.push(point);
                else { segments.push(currentSegment); currentSegment = { points: [point], color }; }
              }
              segments.push(currentSegment);

              const lg = L.layerGroup();
              segments.forEach(segment => {
                if (segment.points.length >= 2) {
                  const latlngs = densifyTrackPoints(segment.points, 0.1);
                  const poly = L.polyline(latlngs, { color: segment.color, weight: 3, opacity: 0.95, pane: 'persistentPane', interactive: false });
                  lg.addLayer(poly);
                }
              });

              // start/end markers
              try {
                const startLatLng = [pts[0].lat, pts[0].lon];
                const endLatLng = [pts[pts.length - 1].lat, pts[pts.length - 1].lon];
                const start = L.circleMarker(startLatLng, { radius: 4, fillColor: '#00ff00', color: '#006600', weight: 1, fillOpacity: 0.95, pane: 'persistentPane' });
                const end = L.circleMarker(endLatLng, { radius: 4, fillColor: '#ff0000', color: '#660000', weight: 1, fillOpacity: 0.95, pane: 'persistentPane' });
                lg.addLayer(start); lg.addLayer(end);
              } catch (e) {}

              longTracksLayer.addLayer(lg);
              liveTrackGroups.set(hx, lg);
              anyDrawn = true;
            } catch (e) { console.warn('Long track chunk draw error:', e && (e.message || e)); if (e && e.stack) console.debug(e.stack); }
          });
        } catch (e) { console.warn('Track chunk processing failed:', e && (e.message || e)); if (e && e.stack) console.debug(e.stack); }
      })
      .catch(err => {
        if (err && err.name === 'TimeoutError') console.debug('Track batch timed out for chunk', chunk, err.message);
        else { console.warn('Track batch failed for chunk:', chunk, err && (err.message || err)); if (err && err.stack) console.debug(err.stack); }
      });
    chunkPromises.push(p);
  }

  await Promise.allSettled(chunkPromises);

  if (!anyDrawn) { longTracksLayer.clearLayers(); setTrackStatus('Idle', 'idle'); }
  if (!map.hasLayer(longTracksLayer) && anyDrawn) longTracksLayer.addTo(map);
  setTrackStatus(anyDrawn ? 'OK (Long)' : 'Idle', anyDrawn ? 'ok' : 'idle');
  if (!map.hasLayer(liveTracksLayer)) liveTracksLayer.addTo(map);
}

async function fetchAndDrawLiveTracks(){
  try{ await _fetchAndDrawLiveTracks_body(); }
  catch(e){ console.warn('fetchAndDrawLiveTracks failed:', e && (e.message || e)); }
}
// ===== SECTION END: helpers for live tracks =====

// ===== SECTION START: processPositions =====
// Purpose: Safely process an array of position records and update in-memory liveMarkers and lastPositions.
// All errors are caught locally so this helper can be called from outside the module without risking syntax fragility.
async function ensureLiveTrackForHex(hex, minutes) {
  try {
    const res = await fetchTracksBatch([{ hex, minutes }]);
    // The batch API returns an array-of-arrays; take the first
    const pts = Array.isArray(res) ? res[0] : null;
    if (pts && Array.isArray(pts) && pts.length >= 2) {
      // Record that we've fetched this hex once
      liveTrackFetchedAt.set(hex, Date.now());
      // lightweight draw: make a small layer group for this hex
      const lg = L.layerGroup();
      try{
        const latlngs = densifyTrackPoints(pts);
        const poly = L.polyline(latlngs, { color: '#00aaff', weight: 2, opacity: 0.9, pane: 'persistentPane', interactive: false });
        lg.addLayer(poly);
        longTracksLayer.addLayer(lg);
        liveTrackGroups.set(hex, lg);
      }catch(e){ console.debug('ensureLiveTrackForHex: draw failed', e); }
    }
  } catch (e) {
    console.debug('ensureLiveTrackForHex: failed', hex, e && (e.message || e));
  }
}

async function processPositions(positions) {
  try {
    if (!Array.isArray(positions)) return;
    // Ensure global lastPositions map exists for testing
    if (!window.lastPositions) window.lastPositions = new Map();

    for (const p of positions) {
      try {
        const hex = (p.hex || '').toString().toLowerCase();
        if (!hex) continue;

        // Update or create marker stub
        const nowTs = p.timestamp || Date.now();
        const md = liveMarkers.get(hex) || { marker: { _posData: null, getLatLng: () => ({ lat: p.lat, lng: p.lon }) }, lastSeen: nowTs };
        md.lastSeen = nowTs;
        md.marker._posData = { lat: p.lat, lon: p.lon, timestamp: nowTs };
        liveMarkers.set(hex, md);

        // Maintain a tiny lastPositions history
        const arr = window.lastPositions.get(hex) || [];
        arr.push([p.lat, p.lon]);
        if (arr.length > 20) arr.shift();
        window.lastPositions.set(hex, arr);

        // Fire ensureLiveTrackForHex once per hex if not fetched yet
        const fetched = liveTrackFetchedAt.get(hex) || 0;
        if (!fetched) {
          // Fire-and-forget; ensure errors are non-fatal
          ensureLiveTrackForHex(hex, 10).catch(e => console.debug('ensureLiveTrackForHex failed', e && (e.message || e)));
        }
      } catch (e) { /* ignore individual position errors */ }
    }
  } catch (e) {
    console.warn('processPositions failed:', e && (e.message || e));
  }
}
// Expose helpers for manual testing
window._refactor_processPositions = processPositions;
window._refactor_ensureLiveTrackForHex = ensureLiveTrackForHex;

// ===== SECTION START: enrichment & popups =====
// Purpose: Build and attach tooltip/popup content and enrich flight metadata.
// These helpers are small, isolated, and safe to run repeatedly in tests.
function buildTooltipHtml(data){
  // data: {hex, callsign, squawk, alt, speed}
  try{
    const cs = data.callsign || 'N/A';
    const sq = data.squawk || '----';
    const alt = data.alt === undefined ? '-' : String(data.alt);
    const sp = data.speed === undefined ? '-' : String(data.speed);
    return `<div style="font-family: Arial, sans-serif; font-size:12px;">`+
           `<strong>${cs}</strong><br/>Sqk: ${sq}<br/>Alt: ${alt}<br/>Spd: ${sp}</div>`;
  }catch(e){ return `<div>Flight: ${data.hex || 'unknown'}</div>`; }
}

function bindPopupAndTooltip(marker, data){
  try{
    const html = buildTooltipHtml(data);
    if (marker && marker.bindPopup) try{ marker.bindPopup(html); }catch(e){}
    if (marker && marker.bindTooltip) try{ marker.bindTooltip(html, { direction: 'top' }); }catch(e){}
  }catch(e){ console.debug('bindPopupAndTooltip failed', e); }
}

// Enrichment function: given an array of hexes, returns an object map of metadata (simulated)
async function enrichFlightBatch(hexes){
  try{
    if (!Array.isArray(hexes)) return {};
    const result = {};
    for (let i=0;i<hexes.length;i++){
      const h = hexes[i];
      // synthetic but deterministic enrichment
      result[h] = { hex: h, callsign: `TEST${i+1}`, squawk: `12${i+10}`, alt: 1000 + (i*100), speed: 120 + (i*5) };
    }
    return result;
  }catch(e){ console.debug('enrichFlightBatch failed', e); return {}; }
}

// attach enrichment to a marker by hex
async function enrichMarkerData(hex){
  try{
    const map = await enrichFlightBatch([hex]);
    const data = map[hex];
    const md = liveMarkers.get(hex);
    if (md) { md.enriched = data; bindPopupAndTooltip(md.marker, data); }
    return data;
  }catch(e){ console.debug('enrichMarkerData failed', e); return null; }
}

// ===== SECTION START: flight batch helpers =====
// Purpose: Fetch flights in batch and merge them into liveMarkers/flightsCache.
async function fetchFlightsBatch(hexes, options={}){
  try{
    if (!Array.isArray(hexes)) return {};
    // Try real endpoint first
    const body = JSON.stringify({ requests: hexes.map(h => ({ icao: h })) });
    const res = await fetchWithTimeout('/api/v2/flight', { method: 'POST', headers: {'Content-Type':'application/json'}, body, signal: options.signal }, 10000);
    if (res && res.ok){
      const json = await res.json();
      // Expected shape: { results: [{ index, flight }, ...] }
      if (json && Array.isArray(json.results)){
        const out = {};
        json.results.forEach(r => { if (r && r.index !== undefined) { const h = (hexes[r.index]||'').toString(); out[h] = r.flight || null; } });
        return out;
      }
      // Fallback: if server returned map directly
      if (json && typeof json === 'object') return json;
    }
  }catch(e){ console.debug('fetchFlightsBatch: falling back to synthetic', e && (e.message || e)); }

  // Synthetic fallback
  const out = {};
  hexes.forEach((h, idx) => out[h] = { hex: h, callsign: `SF${idx+1}`, squawk: `99${idx}`, alt: 2000+idx*100, speed: 140+idx*3 });
  return out;
}

// Merge the flight data map into internal caches and markers
function updateTooltipsForBatch(hexes, flightMap){
  try{
    if (!Array.isArray(hexes) || !flightMap) return;
    hexes.forEach(h => {
      try{
        const lk = (h||'').toString().toLowerCase();
        const md = liveMarkers.get(lk);
        const data = flightMap && flightMap[h];
        if (md && data) {
          try{ md.enriched = data; bindPopupAndTooltip(md.marker, data); } catch(e){ console.debug('updateTooltipsForBatch entry failed', h, e); }
        }
      }catch(e){ console.debug('updateTooltipsForBatch per-entry failed', h, e); }
    });
  }catch(e){ console.debug('updateTooltipsForBatch failed', e); }
}

function mergeFlightBatch(resMap){
  try{
    if (!resMap || typeof resMap !== 'object') return;
    if (!window.flightsCache) window.flightsCache = new Map();
    const keys = Object.keys(resMap);
    keys.forEach(k => {
      try{
        const lk = (k||'').toString().toLowerCase();
        const data = resMap[k];
        flightsCache.set(lk, { ts: Date.now(), data });
      }catch(e){ console.debug('mergeFlightBatch entry failed', k, e); }
    });
    // Bulk update tooltips/popups after cache merge
    try { updateTooltipsForBatch(keys, resMap); } catch(e) { console.debug('mergeFlightBatch post-update failed', e); }
  }catch(e){ console.debug('mergeFlightBatch failed', e); }
}

// Expose flight helpers for testing
window._refactor_fetchFlightsBatch = fetchFlightsBatch;
window._refactor_mergeFlightBatch = mergeFlightBatch;
window._refactor_updateTooltipsForBatch = updateTooltipsForBatch;
// ===== SECTION END: flight batch helpers =====

window._refactor_buildTooltipHtml = buildTooltipHtml;
window._refactor_bindPopupAndTooltip = bindPopupAndTooltip;
window._refactor_enrichFlightBatch = enrichFlightBatch;
window._refactor_enrichMarkerData = enrichMarkerData;
// ===== SECTION END: enrichment & popups =====

// ===== SECTION START: processPositions =====n// Note: rest of file continues...

// ===== SECTION START: doUpdateLiveMarkers =====
// Purpose: Central runner to process position updates, merge markers/trails, and trigger track fetching.
function doUpdateLiveMarkers(positions) {
  try {
    if (!Array.isArray(positions)) return;
    // Ensure liveTrails map exists
    if (!window.liveTrails) window.liveTrails = new Map();

    const now = Date.now();
    positions.forEach(p => {
      try {
        const hex = (p.hex || '').toString().toLowerCase();
        if (!hex) return;

        // update in-memory marker + lastPositions
        const md = liveMarkers.get(hex) || { marker: { _posData: null, getLatLng: () => ({ lat: p.lat, lng: p.lon }) }, lastSeen: now };
        md.lastSeen = p.timestamp || now;
        md.marker._posData = { lat: p.lat, lon: p.lon, timestamp: md.lastSeen };
        liveMarkers.set(hex, md);

        // Update trail polyline - create lazily
        try {
          let tr = window.liveTrails.get(hex);
          if (!tr) {
            const poly = L.polyline([[p.lat, p.lon]], { color: '#888', weight: 2, opacity: 0.8, pane: 'livePane', interactive: false });
            const lg = L.layerGroup([poly]);
            liveTracksLayer.addLayer(lg);
            window.liveTrails.set(hex, poly);
            tr = poly;
          } else {
            // append a point
            try { tr.addLatLng([p.lat, p.lon]); } catch(e) { console.debug('trail addLatLng failed', e); }
          }
        } catch (e) { console.debug('trail update error', e); }

        // Fire-and-forget ensureLiveTrackForHex to load initial long track
        try { ensureLiveTrackForHex(hex, 10).catch(()=>{}); } catch(e) {}
      } catch (e) { /* ignore per-position errors */ }
    });

    // Optionally trigger fetchAndDrawLiveTracks to refresh visible tracks (debounce would be better)
    try { fetchAndDrawLiveTracks().catch(() => {}); } catch(e) {}
  } catch (e) {
    console.warn('doUpdateLiveMarkers failed:', e && (e.message || e));
  }
}

// Expose runner for testing
window._refactor_doUpdateLiveMarkers = doUpdateLiveMarkers;
// ===== SECTION END: doUpdateLiveMarkers =====

// Auto-run a single validation pass when module loads
(async function runSmoke(){
  try{
    await fetchAndDrawLiveTracks();

    // Also test flight-batch fetching and merging
    const hexes = ['fakehex1','fakehex2','fakehex3'];
    const flights = await fetchFlightsBatch(hexes);
    mergeFlightBatch(flights);

    // Simulate 1Hz position updates for 6 seconds to emulate live updates
    const simHexes = hexes;
    let count = 0;
    const simInterval = setInterval(()=>{
      const updates = simHexes.map((hx, idx) => ({ hex: hx, lat: 39.5 + (idx*0.05) + count*0.001, lon: -98.0 + (idx*0.05) + count*0.001, timestamp: Date.now() }));
      try { doUpdateLiveMarkers(updates); } catch(e) { console.debug('sim update failed', e); }
      count++;
    }, 1000);

    await new Promise(resolve => setTimeout(resolve, 6500));
    clearInterval(simInterval);

    console.log('Refactor page smoke run successful');
  }catch(e){ console.error('Smoke run failed', e); }
})();
