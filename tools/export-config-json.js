#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

/**
 * export-config-json.js
 * 
 * Loads the `config.js` module and writes out a JSON5 `config.json` file that
 * mirrors the current effective configuration. This helps Python tools and
 * various scripts that rely on `config.json`.
 */

function writeConfig() {
  const projectRoot = path.join(__dirname, '..');
  const configJsPath = path.join(projectRoot, 'config.js');
  const outPath = path.join(projectRoot, 'config.json');

  if (!fs.existsSync(configJsPath)) {
    console.error('config.js not found; aborting export.');
    process.exit(1);
  }

  // Require via node so any dotenv/env processing is applied
  const config = require(configJsPath);

  // If config is a module with getters (like config-loader) export its plain object
  let configObj = config;
  if (typeof config.getAll === 'function') {
    configObj = config.getAll();
  }

  // Write JSON5 so comments can be preserved in the future if needed
  const jsonText = JSON5.stringify(configObj, null, 2);
  fs.writeFileSync(outPath, jsonText, 'utf8');
  console.log(`Exported config.json to ${outPath}`);
}

if (require.main === module) {
  writeConfig();
}

module.exports = { writeConfig };