// Ensure config.logging exists before loading logger module
const cfgInit = require('../config');
if (!cfgInit.logging) cfgInit.logging = {};
cfgInit.logging.level = cfgInit.logging.level || 'info';
const { debug, info, warn, error, logW3C } = require('../lib/logger');

describe('Logger Module', () => {
  let consoleSpy;

  beforeEach(() => {
    // Mock console methods to capture output
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('Basic Logging Functions', () => {
    test('info() should log messages', () => {
      info('Test info message');
      expect(consoleSpy.log).toHaveBeenCalledWith('Test info message');
    });

    test('warn() should log warnings', () => {
      warn('Test warning message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('Test warning message');
    });

    test('error() should log errors', () => {
      error('Test error message');
      expect(consoleSpy.error).toHaveBeenCalledWith('Test error message');
    });

    test('debug() should log when VERBOSE is enabled', () => {
      // Set config logging level to debug and call the debug function (checks config dynamically)
      const cfg = require('../config');
      if (!cfg.logging) cfg.logging = {};
      cfg.logging.level = 'debug';
      // Call the debug function exported earlier; it inspects config dynamically
      debug('Test debug message');
      // Accept either console.debug being called or console.log being called with the '[DEBUG]' prefix
      const debugCalled = consoleSpy.debug.mock.calls.some(call => call.includes('Test debug message'));
      const logCalled = consoleSpy.log.mock.calls.some(call => (call.length >= 2 && call[0] === '[DEBUG]' && call[1] === 'Test debug message') || (call.includes && call.includes('Test debug message')));
      expect(debugCalled || logCalled).toBe(true);
    });

    test('debug() should not log when VERBOSE is disabled', () => {
      const cfg = require('../config');
      if (!cfg.logging) cfg.logging = {};
      cfg.logging.level = 'info';
      jest.resetModules();
      const { debug } = require('../lib/logger');
      debug('Test debug message');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  describe('W3C Logging', () => {
    test('logW3C should be a function', () => {
      expect(typeof logW3C).toBe('function');
    });

    test('logW3C middleware should call next() and log on finish', (done) => {
      const req = {
        ip: '127.0.0.1',
        method: 'GET',
        path: '/test',
        query: {},
        get: jest.fn().mockReturnValue('Test-Agent')
      };

      const res = {
        statusCode: 200,
        get: jest.fn().mockReturnValue('1024'),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'finish') {
            // Simulate response finish after a short delay
            setTimeout(() => {
              callback();
              // Check that W3C logging occurred
              expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('[W3C]')
              );
              done();
            }, 10);
          }
        })
      };

      const next = jest.fn();

      logW3C(req, res, next);

      // Should call next immediately
      expect(next).toHaveBeenCalled();

      // Should set up finish event listener
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });
});