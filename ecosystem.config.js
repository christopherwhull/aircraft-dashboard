module.exports = {
  apps: [{
    name: 'aircraft-dashboard',
    script: 'server.js',
    instances: 4, // Use 4 cluster instances for horizontal scaling
    exec_mode: 'cluster', // Cluster mode for main server
    env_production: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    // Restart policies
    max_memory_restart: '1G',
    restart_delay: 1000,
    // Logging
    log_file: './logs/pm2-aircraft-dashboard.log',
    out_file: './logs/pm2-aircraft-dashboard-out.log',
    error_file: './logs/pm2-aircraft-dashboard-error.log',
    // Process management
    autorestart: false,
    watch: false, // Disable file watching in production
    // Graceful shutdown
    kill_timeout: 5000,
    // Remove wait_ready for now - app doesn't signal ready
    // wait_ready: true,
    // listen_timeout: 10000
  }, {
    name: 'websocket-server',
    script: 'websocket-server.js',
    instances: 1, // Single instance for WebSocket server
    exec_mode: 'fork', // Fork mode for WebSocket server
    env_production: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    // Restart policies
    max_memory_restart: '512M',
    restart_delay: 1000,
    // Logging
    log_file: './logs/pm2-websocket-server.log',
    out_file: './logs/pm2-websocket-server-out.log',
    error_file: './logs/pm2-websocket-server-error.log',
    // Process management
    autorestart: false,
    watch: false, // Disable file watching in production
    // Graceful shutdown
    kill_timeout: 3000
  }, {
    name: 'tile-proxy-server',
    script: 'tile-proxy-server.js',
    instances: 1, // Single instance for tile proxy server
    exec_mode: 'fork', // Fork mode for tile proxy server
    env_production: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development'
    },
    // Restart policies
    max_memory_restart: '512M',
    restart_delay: 1000,
    // Logging
    log_file: './logs/pm2-tile-proxy-server.log',
    out_file: './logs/pm2-tile-proxy-server-out.log',
    error_file: './logs/pm2-tile-proxy-server-error.log',
    // Process management
    autorestart: false,
    watch: false, // Disable file watching in production
    // Graceful shutdown
    kill_timeout: 3000
  }]
};