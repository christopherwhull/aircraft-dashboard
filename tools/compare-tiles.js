#!/usr/bin/env node
// Compare tiles for multiple layers near a lat/lon (Chicago by default)
// Usage: node tools/compare-tiles.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { env } = require('process');

const outDir = path.join(__dirname, 'compare-output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const proxyBase = process.env.TILE_PROXY || 'http://localhost:3004';
const layers = ['IFR_AreaLow','IFR_High','VFR_Sectional'];
const lat = parseFloat(process.env.PIAWARE_LAT || '41.8781'); // Chicago
const lon = parseFloat(process.env.PIAWARE_LON || '-87.6298');
const z = parseInt(process.env.ZOOM || '10', 10);
const count = parseInt(process.env.TILE_COUNT || '10', 10);

function lonLatToTile(lon, lat, z){
  const n = Math.pow(2, z);
  const xtile = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const ytile = Math.floor((1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: xtile, y: ytile };
}

function sha256(buffer){
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

async function fetchTile(layer, z, x, y){
  const url = `${proxyBase}/tile/${layer}/${z}/${y}/${x}`;
  try{
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, buf: Buffer.from(buf), url };
  }catch(err){
    return { ok: false, status: 0, err: String(err), url };
  }
}

(async ()=>{
  console.log('Proxy base:', proxyBase);
  console.log('Center lat,lon:', lat, lon, 'zoom:', z);
  const center = lonLatToTile(lon, lat, z);
  console.log('Center tile x,y:', center.x, center.y);

  // select offsets in a spiral-ish small area
  const offsets = [];
  for(let r=0; offsets.length < count && r<10; r++){
    for(let dx = -r; dx<=r && offsets.length < count; dx++){
      for(let dy = -r; dy<=r && offsets.length < count; dy++){
        if(Math.abs(dx)===r || Math.abs(dy)===r){
          offsets.push({dx,dy});
        }
      }
    }
  }

  const report = [];

  for(let i=0;i<Math.min(count, offsets.length);i++){
    const off = offsets[i];
    const tx = center.x + off.dx;
    const ty = center.y + off.dy;
    const tileInfo = { index: i+1, x: tx, y: ty, z, results: [] };
    for(const layer of layers){
      const res = await fetchTile(layer, z, tx, ty);
      if(res.ok){
        const name = `${layer}_${z}_${ty}_${tx}.bin`;
        const outPath = path.join(outDir, name);
        fs.writeFileSync(outPath, res.buf);
        const hash = sha256(res.buf);
        tileInfo.results.push({ layer, status: res.status, size: res.buf.length, sha256: hash, path: outPath, url: res.url });
        console.log(`Saved ${name} ${res.buf.length} bytes ${hash}`);
      }else{
        tileInfo.results.push({ layer, status: res.status, err: res.err || null, url: res.url });
        console.log(`Failed ${layer} ${z}/${tx}/${ty} status=${res.status} ${res.err||''}`);
      }
    }
    report.push(tileInfo);
  }

  const summaryPath = path.join(outDir,'report.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ center:{lat,lon,z}, layers, report }, null, 2));
  console.log('\nWrote report to', summaryPath);
  console.log('Done.');
})().catch(err=>{ console.error('Fatal error', err); process.exit(2); });
