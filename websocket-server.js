const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('./lib/logger');
const { logW3C, initializeW3CLogger } = logger;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store the latest live data
let latestLiveData = null;

initializeW3CLogger({ server: { w3cLogDir: 'logs' } });
app.use(logW3C);

// WebSocket connection handling
io.on('connection', (socket) => {
    logger.info('WebSocket client connected');

    // Send latest data immediately on connection
    if (latestLiveData) {
        socket.emit('liveUpdate', latestLiveData);
    }

    socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected');
    });
});

// Endpoint for main server to push live updates
app.post('/api/live-update', express.json(), (req, res) => {
    try {
        latestLiveData = req.body;
        io.emit('liveUpdate', latestLiveData);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error processing live update:', error);
        res.status(500).json({ error: 'Failed to process live update' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        clients: io.engine.clientsCount,
        uptime: process.uptime()
    });
});

const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 3003;

server.listen(WEBSOCKET_PORT, () => {
    logger.info(`WebSocket server listening on port ${WEBSOCKET_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('WebSocket server shutting down');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('WebSocket server shutting down');
    server.close(() => {
        process.exit(0);
    });
});

module.exports = { io, app };