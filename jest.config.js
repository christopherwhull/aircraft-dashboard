module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/geotiff-cache-status.test.js'],
  collectCoverageFrom: [
    'lib/**/*.js',
    'server.js',
    '!lib/**/index.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  setupFiles: ['<rootDir>/__tests__/jest.setup.js']
};