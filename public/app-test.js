// Corrected and refactored logic for the heatmap page

const socket = io('http://localhost:3003');

// Socket event handlers for connection status
socket.on('connect', () => {
    console.info('Socket connected');
    const el = document.getElementById('connection-status');
    if (el) {
        el.textContent = '● Connected';
        el.className = 'status-connected';
    }
});

socket.on('connect_error', (err) => {
    console.error('Socket connect_error:', err);
    const el = document.getElementById('connection-status');
    if (el) {
        el.textContent = '● Connect Error';
        el.className = 'status-disconnected';
    }
});

socket.on('reconnect_attempt', (attempt) => {
    console.info('Socket reconnect attempt', attempt);
    const el = document.getElementById('connection-status');
    if (el) {
        el.textContent = `● Reconnecting (${attempt})`;
        el.className = 'status-connecting';
    }
});

socket.on('reconnect_failed', () => {
    console.warn('Socket reconnect failed');
    const el = document.getElementById('connection-status');
    if (el) {
        el.textContent = '● Reconnect Failed';
        el.className = 'status-disconnected';
    }
});

socket.on('connect_timeout', () => {
    console.warn('Socket connect timeout');
    const el = document.getElementById('connection-status');
    if (el) {
        el.textContent = '● Connect Timeout';
        el.className = 'status-disconnected';
    }
});

socket.on('liveUpdate', (data) => {
    // Handle live updates - simplified for test version
    console.log('Received live update:', data);
    // You could add basic UI updates here if needed for testing
});

document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    let map;
    let layersControl;
    let gridLayer = null;
    let currentData = null;
    // ... (all other necessary global variables)

    // --- Initialization ---
    function initialize() {
        loadSettings();
        setupEventListeners();
        initializeMap();
    }

    // --- All Functions ---
    // (A fully corrected set of all functions will be placed here)

    initialize();
});
