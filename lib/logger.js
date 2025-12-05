const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

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
        new winston.transports.Console(),
        transport,
    ],
});

module.exports = logger;

