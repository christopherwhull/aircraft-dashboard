const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

// --- W3C Logging Middleware ---
// Custom middleware to log requests in W3C format, similar to IIS logs.
// This helps with monitoring and traffic analysis.
const logW3C = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const { method, path, query } = req;
        const { statusCode } = res;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '-';
        const contentLength = res.get('Content-Length') || '-';

        // Construct W3C-style log entry:
        // date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) cs(Referer) sc-status sc-substatus sc-win32-status time-taken
        const logEntry = [
            new Date().toISOString(),
            ip,
            method,
            path,
            JSON.stringify(query),
            statusCode,
            duration,
            userAgent,
            contentLength
        ].join(' ');
        
        // Log with a special [W3C] prefix for easy filtering
        logger.info(`[W3C] ${logEntry}`);
    });
    next();
};

const transport = new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '..', config.server.logFile),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
});

const logger = winston.createLogger({
    level: config.logging.level || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message }) => `${level}: ${message}`)
            )
        }),
        transport,
    ],
});

// --- Verbose/Debug Logging ---
// Custom debug function that respects VERBOSE environment variable,
// allowing dynamic control over detailed logging for troubleshooting.
const debug = (message) => {
    // Dynamically check the config's logging level
    const cfg = require('../config');
    const logLevel = (cfg.logging && cfg.logging.level) ? cfg.logging.level.toLowerCase() : 'info';
    
    if (logLevel === 'debug' || process.env.VERBOSE) {
        // Use console.debug for browsers that support it, otherwise console.log
        if (console.debug) {
            console.debug(`[DEBUG] ${message}`);
        } else {
            console.log(`[DEBUG] ${message}`);
        }
    }
};

module.exports = {
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
    debug,
    logW3C
};

