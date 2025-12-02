const { execSync } = require('child_process');

describe('Git repository cleanliness', () => {
  test('working tree should be clean (no uncommitted changes)', () => {
    if (process.env.ENFORCE_GIT_CLEAN !== 'true') {
      console.log('ENFORCE_GIT_CLEAN not enabled; skipping git clean check.');
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
