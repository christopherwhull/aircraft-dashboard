// Jest setup: ensure tests run with consistent config.js overrides
const config = require('../config');
// Ensure test environment label
if (!config.server) config.server = {};
config.server.env = 'test';
// Provide stable git override values for tests
if (!config.server.gitCommitOverride) config.server.gitCommitOverride = 'test';
if (typeof config.server.gitDirtyOverride === 'undefined') config.server.gitDirtyOverride = false;
// Control whether we enforce git cleanliness in tests via config
if (typeof config.server.enforceGitClean === 'undefined') config.server.enforceGitClean = false;
