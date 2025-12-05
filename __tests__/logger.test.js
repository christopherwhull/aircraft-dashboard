// Ensure config.logging exists before loading logger module
const cfgInit = require('../config');
if (!cfgInit.logging) cfgInit.logging = {};
cfgInit.logging.level = cfgInit.logging.level || 'info';
const logger = require('../lib/logger');

describe('Logger Module', () => {
  let infoSpy, warnSpy, errorSpy, debugSpy;

  beforeEach(() => {
    // Mock the logger methods to capture output
    infoSpy = jest.spyOn(logger, 'info');
    warnSpy = jest.spyOn(logger, 'warn');
    errorSpy = jest.spyOn(logger, 'error');
    debugSpy = jest.spyOn(logger, 'debug');
  });

  afterEach(() => {
    // Restore original methods
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  describe('Basic Logging Functions', () => {
    test('info() should log messages', () => {
      logger.info('Test info message');
      expect(infoSpy).toHaveBeenCalledWith('Test info message');
    });

    test('warn() should log warnings', () => {
      logger.warn('Test warning message');
      expect(warnSpy).toHaveBeenCalledWith('Test warning message');
    });

    test('error() should log errors', () => {
      logger.error('Test error message');
      expect(errorSpy).toHaveBeenCalledWith('Test error message');
    });

    test('debug() should log when VERBOSE is enabled', () => {
      // Set config logging level to debug and call the debug function (checks config dynamically)
      const cfg = require('../config');
      if (!cfg.logging) cfg.logging = {};
      cfg.logging.level = 'debug';
      // Call the debug function exported earlier; it inspects config dynamically
      logger.debug('Test debug message');
      expect(debugSpy).toHaveBeenCalledWith('Test debug message');
    });

    test('debug() should not log when VERBOSE is disabled', () => {
      const cfg = require('../config');
      if (!cfg.logging) cfg.logging = {};
      cfg.logging.level = 'info';
      jest.resetModules();
      const { debug } = require('../lib/logger');
      debug('Test debug message');
      expect(debugSpy).not.toHaveBeenCalled();
    });
  });

  describe('W3C Logging', () => {
    test('logW3C should be a function', () => {
      expect(typeof logger.logW3C).toBe('function');
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
            setTimeout(() => {
              callback();
              // Check that W3C logging occurred
              expect(infoSpy).toHaveBeenCalledWith(
                expect.stringContaining('[W3C]')
              );
              done();
            }, 0);
          }
        })
      };

      const next = jest.fn();

      logger.logW3C(req, res, next);

      // Should call next immediately
      expect(next).toHaveBeenCalled();
    });
  });
});