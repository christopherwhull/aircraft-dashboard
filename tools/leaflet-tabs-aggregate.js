#!/usr/bin/env node
// Simple aggregator to compute basic stats (min/avg/max) from tabs-time-summary.json

const fs = require('fs');
const path = require('path');

function statsFor(arr) {
    const ms = arr.map(x => x.latencyMs).filter(v => typeof v === 'number' && !isNaN(v));
    if (!ms.length) return { count: 0, min: null, max: null, avg: null, median: null };
    ms.sort((a,b) => a-b);
    const sum = ms.reduce((a,c) => a + c, 0);
    const avg = sum / ms.length;
    const median = (ms.length % 2 === 1) ? ms[(ms.length - 1) / 2] : (ms[ms.length/2 - 1] + ms[ms.length/2]) / 2;
    return { count: ms.length, min: ms[0], max: ms[ms.length -1], avg: Math.round(avg), median: Math.round(median) };
}

async function main() {
    const inFile = process.argv[2] || path.join('screenshots', 'testplan', 'leaflet-test-tabs', 'tabs-time-summary.json');
    if (!fs.existsSync(inFile)) {
        console.error('Input file not found:', inFile);
        process.exit(1);
    }
    const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
    const out = {};
    for (const tab of Object.keys(d)) {
        out[tab] = statsFor(d[tab]);
    }
    // Also compute overall across all tabs
    const allLatencies = [];
    for (const t of Object.keys(d)) {
        for (const r of d[t]) {
            if (typeof r.latencyMs === 'number' && !isNaN(r.latencyMs)) allLatencies.push(r.latencyMs);
        }
    }
    out.overall = statsFor(allLatencies.map(v => ({latencyMs:v}))); // re-use function
    const outFile = path.join(path.dirname(inFile), 'tabs-time-summary-aggregate.json');
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log('Wrote aggregated summary to', outFile);
    console.log(JSON.stringify(out, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });