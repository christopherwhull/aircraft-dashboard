#!/usr/bin/env node

/**
 * Config Validation Script
 * Validates the config.json file for the Aircraft Dashboard
 */

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

const configPath = path.join(__dirname, 'config.json');

function validateConfig() {
  console.log('🔍 Validating config.json...\n');

  // Check if file exists
  if (!fs.existsSync(configPath)) {
    console.error('❌ config.json not found!');
    process.exit(1);
  }

  // Try to parse JSON
  let config;
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON5.parse(configData);
    console.log('✅ Valid JSON syntax');
  } catch (error) {
    console.error('❌ Invalid JSON syntax:', error.message);
    process.exit(1);
  }

  // Required sections
  const requiredSections = [
    'server', 'heatmap', 'screenshots', 'data', 'logging', 'ui', 'proxy',
    'dataSource', 'buckets', 'state', 's3', 'retention', 'backgroundJobs',
    'initialJobDelays', 'positionCache', 'api', 's3ListLimits', 'dataProcessing',
    'reception', 'development'
  ];

  const missingSections = requiredSections.filter(section => !config[section]);
  if (missingSections.length > 0) {
    console.error('❌ Missing required sections:', missingSections.join(', '));
    process.exit(1);
  }

  console.log('✅ All required sections present');

  // Validate specific values
  const validations = [
    { path: 'server.mainPort', type: 'number', min: 1000, max: 65535 },
    { path: 'server.tileProxyPort', type: 'number', min: 1000, max: 65535 },
    { path: 'proxy.port', type: 'number', min: 1000, max: 65535 },
    { path: 'heatmap.defaultOpacity', type: 'number', min: 0, max: 1 },
    { path: 'heatmap.maxOpacity', type: 'number', min: 0, max: 1 },
    { path: 'heatmap.minOpacity', type: 'number', min: 0, max: 1 },
    { path: 'heatmap.mapCenter.lat', type: 'number', min: -90, max: 90 },
    { path: 'heatmap.mapCenter.lon', type: 'number', min: -180, max: 180 },
    { path: 'heatmap.mapCenter.zoom', type: 'number', min: 1, max: 20 },
    { path: 'logging.maxSizeMB', type: 'number', min: 0 },
    { path: 'logging.rotationIntervalHours', type: 'number', min: 1 },
    { path: 'proxy.logging.maxSizeMB', type: 'number', min: 0 },
    { path: 'proxy.logging.rotationIntervalHours', type: 'number', min: 1 },
    { path: 'retention.positionRetentionMs', type: 'number', min: 1000 },
    { path: 'retention.gapMs', type: 'number', min: 1000 },
    { path: 'retention.minFlightDurationMs', type: 'number', min: 1000 },
    { path: 'retention.squawkRetentionDays', type: 'number', min: 1 },
    { path: 'retention.aircraftTrackingTimeoutMs', type: 'number', min: 1000 },
    { path: 'backgroundJobs.fetchDataInterval', type: 'number', min: 100 },
    { path: 'backgroundJobs.saveStateInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.saveAircraftDataInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.buildFlightsInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.buildHourlyPositionsInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.aggregateAirlinesInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.aggregateSquawkInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.aggregateHistoricalInterval', type: 'number', min: 1000 },
    { path: 'backgroundJobs.remakeHourlyRollupInterval', type: 'number', min: 1000 },
    { path: 'initialJobDelays.buildFlightsDelay', type: 'number', min: 0 },
    { path: 'initialJobDelays.buildHourlyPositionsDelay', type: 'number', min: 0 },
    { path: 'initialJobDelays.remakeHourlyRollupDelay', type: 'number', min: 0 },
    { path: 'positionCache.lookbackDays', type: 'number', min: 1 },
    { path: 'api.heatmap.defaultHours', type: 'number', min: 1 },
    { path: 'api.positionTimeseries.defaultMinutes', type: 'number', min: 1 },
    { path: 'api.positionTimeseries.defaultResolution', type: 'number', min: 1 },
    { path: 'api.receptionRange.defaultHours', type: 'number', min: 1 },
    { path: 'api.squawkTransitions.defaultHours', type: 'number', min: 1 },
    { path: 'api.historicalStats.defaultHours', type: 'number', min: 1 },
    { path: 'api.historicalStats.defaultResolution', type: 'number', min: 1 },
    { path: 'api.flights.defaultGap', type: 'number', min: 1 },
    { path: 's3ListLimits.maxKeys', type: 'number', min: 1 },
    { path: 'dataProcessing.flightsLookbackHours', type: 'number', min: 1 },
    { path: 'dataProcessing.hourlyPositionLookbackDays', type: 'number', min: 1 },
    { path: 'screenshots.defaultDelay', type: 'number', min: 1000 },
  ];

  let validationErrors = [];

  validations.forEach(validation => {
    const keys = validation.path.split('.');
    let value = config;
    for (const key of keys) {
      value = value?.[key];
    }

    if (value === undefined) {
      validationErrors.push(`${validation.path}: missing`);
      return;
    }

    if (typeof value !== validation.type) {
      validationErrors.push(`${validation.path}: expected ${validation.type}, got ${typeof value}`);
      return;
    }

    if (validation.min !== undefined && value < validation.min) {
      validationErrors.push(`${validation.path}: value ${value} below minimum ${validation.min}`);
    }

    if (validation.max !== undefined && value > validation.max) {
      validationErrors.push(`${validation.path}: value ${value} above maximum ${validation.max}`);
    }
  });

  if (validationErrors.length > 0) {
    console.error('❌ Validation errors:');
    validationErrors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }

  console.log('✅ All validations passed');

  // Summary
  console.log('\n📊 Configuration Summary:');
  console.log(`   - Server ports: ${config.server.mainPort} (main), ${config.server.tileProxyPort} (tiles), ${config.proxy.port} (proxy)`);
  console.log(`   - Heatmap opacity: ${config.heatmap.defaultOpacity}`);
  console.log(`   - Map center override: ${config.heatmap.mapCenter.enabled ? 'enabled' : 'disabled (uses piaware location)'}`);
  console.log(`   - Screenshot delay: ${config.screenshots.defaultDelay}ms`);
  console.log(`   - Interactive mode: ${config.screenshots.interactiveMode}`);
  console.log(`   - Theme: ${config.ui.theme}`);
  console.log(`   - Log level: ${config.logging.level}`);
  console.log(`   - Log directory: ${config.logging.directory}`);
  console.log(`   - Log max size: ${config.logging.maxSizeMB}MB (${config.logging.maxSizeMB === 0 ? 'unlimited' : 'limited'})`);
  console.log(`   - Proxy log cleanup: ${config.proxy.logging.cleanup.enabled ? 'enabled' : 'disabled'}`);

  console.log('\n🎉 Configuration is valid!');
}

if (require.main === module) {
  validateConfig();
}

module.exports = { validateConfig };