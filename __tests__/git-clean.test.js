const { execSync } = require('child_process');

describe('Git repository cleanliness', () => {
    test('working tree should be clean (no uncommitted changes)', () => {
    const config = require('../config');
    if (!config.server || !config.server.enforceGitClean) {
      console.log('ENFORCE_GIT_CLEAN not enabled in config; skipping git clean check.');
      return;
    }
    let status = '';
    try {
      status = execSync('git status --porcelain', { encoding: 'utf8' });
    } catch (err) {
      // If git is not present, skip the test (not fatal)
      console.warn('git not available; skipping git cleanliness test.');
      return;
    }
    expect(status.trim()).toBe('');
  });
});
