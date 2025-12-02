// Jest setup: ensure tests run with consistent git-state-related env vars
process.env.GIT_COMMIT_OVERRIDE = process.env.GIT_COMMIT_OVERRIDE || 'test';
process.env.GIT_DIRTY_OVERRIDE = process.env.GIT_DIRTY_OVERRIDE || 'false';
process.env.NODE_ENV = 'test';
// Enforce git clean check in tests; set to 'false' to disable
// Default to not enforcing git cleanliness in automated test environments
process.env.ENFORCE_GIT_CLEAN = process.env.ENFORCE_GIT_CLEAN || 'false';
