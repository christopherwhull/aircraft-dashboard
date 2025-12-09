#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

function maskSecrets(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  if (clone.s3 && clone.s3.credentials) {
    clone.s3.credentials.accessKeyId = 'REPLACE_ME';
    clone.s3.credentials.secretAccessKey = 'REPLACE_ME';
  }
  if (clone.arcgis) {
    clone.arcgis.apiKey = 'REPLACE_ME';
  }
  return clone;
}

function writeExample() {
  const projectRoot = path.join(__dirname, '..');
  const configJsonPath = path.join(projectRoot, 'config.json');
  const outPath = path.join(projectRoot, 'config.example.json');

  if (!fs.existsSync(configJsonPath)) {
    console.error('config.json not found; run tools/export-config-json.js first or provide config.js to export.');
    process.exit(1);
  }

  const content = fs.readFileSync(configJsonPath, 'utf8');
  const parsed = JSON5.parse(content);
  const masked = maskSecrets(parsed);

  // Write templated JSON (human readable)
  const jsonText = JSON5.stringify(masked, null, 2);
  fs.writeFileSync(outPath, jsonText, 'utf8');
  console.log(`Exported masked example config to ${outPath}`);
}

if (require.main === module) writeExample();
module.exports = { writeExample };