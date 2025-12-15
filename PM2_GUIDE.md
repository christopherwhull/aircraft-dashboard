# PM2 Process Management Guide

This guide covers the PM2 process management setup for the AirSquawk aircraft dashboard application.

## Overview

The application uses PM2 to manage a multi-service architecture with optimized resource usage:

- **aircraft-dashboard**: Main web server (4 cluster instances for load balancing)
- **websocket-server**: Real-time WebSocket server (1 instance)
- **tile-proxy-server**: Aviation chart tile caching proxy (1 instance)

## Installation

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

## Configuration

The PM2 configuration is defined in `ecosystem.config.js` with the following settings:

### aircraft-dashboard
- **Instances**: 4 (cluster mode for horizontal scaling)
- **Memory Limit**: 1GB (auto-restart if exceeded)
- **Ports**: 3000-3003 (load balanced)
- **Logs**: `./logs/pm2-aircraft-dashboard*`

### websocket-server
- **Instances**: 1 (fork mode)
- **Memory Limit**: 512MB
- **Port**: 3003
- **Logs**: `./logs/pm2-websocket-server*`

### tile-proxy-server
- **Instances**: 1 (fork mode)
- **Memory Limit**: 512MB
- **Port**: 3004
- **Logs**: `./logs/pm2-tile-proxy-server*`

## Basic Operations

### Starting Services

```bash
# Start all services
pm2 start ecosystem.config.js

# Start individual services
pm2 start ecosystem.config.js --only aircraft-dashboard
pm2 start ecosystem.config.js --only websocket-server
pm2 start ecosystem.config.js --only tile-proxy-server
```

### Monitoring

```bash
# List all processes
pm2 list
pm2 status

# Real-time monitoring
pm2 monit

# Process details
pm2 show aircraft-dashboard
pm2 describe websocket-server
```

### Logs

```bash
# View all logs
pm2 logs

# View specific service logs
pm2 logs aircraft-dashboard
pm2 logs websocket-server --lines 50

# Follow logs (tail -f)
pm2 logs --follow
pm2 logs aircraft-dashboard --follow

# Export logs
pm2 logs > pm2_logs_backup.txt
```

### Management

```bash
# Restart services
pm2 restart ecosystem.config.js
pm2 restart aircraft-dashboard

# Stop services
pm2 stop ecosystem.config.js
pm2 stop aircraft-dashboard

# Delete services (removes from PM2)
pm2 delete ecosystem.config.js
pm2 delete aircraft-dashboard websocket-server tile-proxy-server
```

## Advanced Operations

### Scaling

```bash
# Scale aircraft-dashboard instances
pm2 scale aircraft-dashboard 2    # Reduce to 2 instances
pm2 scale aircraft-dashboard 8    # Increase to 8 instances

# Scale other services (if needed)
pm2 scale websocket-server 2
```

### Resource Monitoring

```bash
# View resource usage
pm2 list

# Monitor in real-time
pm2 monit

# Check specific process
pm2 show aircraft-dashboard
```

### Log Management

```bash
# Rotate logs
pm2 reloadLogs

# Clear logs
pm2 flush

# Archive logs
pm2 logs > logs_$(date +%Y%m%d_%H%M%S).txt
```

## Troubleshooting

### Common Issues

#### Services Not Starting
```bash
# Check for port conflicts
netstat -ano | findstr :3000
netstat -ano | findstr :3003
netstat -ano | findstr :3004

# Check PM2 logs
pm2 logs --err

# Restart PM2 daemon
pm2 kill
pm2 start ecosystem.config.js
```

#### High Memory Usage
```bash
# Check memory usage
pm2 monit

# Restart memory-intensive services
pm2 restart aircraft-dashboard

# Scale down instances
pm2 scale aircraft-dashboard 2
```

#### Services Crashing
```bash
# Check error logs
pm2 logs --err --lines 100

# View specific service logs
pm2 logs aircraft-dashboard --err

# Check application logs
tail -f logs/pm2-aircraft-dashboard-error.log
```

### Recovery Commands

```bash
# Complete reset
pm2 kill
pm2 start ecosystem.config.js

# Selective restart
pm2 restart aircraft-dashboard
pm2 restart websocket-server
pm2 restart tile-proxy-server

# Check all services
pm2 list
pm2 logs --lines 10
```

## Production Deployment

### Auto-start on Boot

```bash
# Generate startup script
pm2 startup

# Follow the instructions provided by PM2
# This typically involves running a command like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# Save current PM2 configuration
pm2 save
```

### Systemd Integration

```bash
# Check PM2 startup status
sudo systemctl status pm2-$USER

# View PM2 logs
sudo journalctl -u pm2-$USER -f
```

### Backup and Restore

```bash
# Backup PM2 configuration
pm2 save
pm2 list > pm2_processes_backup.txt

# Restore after system restart
pm2 resurrect
```

## Performance Optimization

### Current Optimized Setup

- **Total Memory**: ~486MB (vs 14GB with 20 instances)
- **CPU Cores**: 4 aircraft-dashboard workers
- **Load Balancing**: Automatic request distribution
- **Fault Tolerance**: Isolated service failures

### Monitoring Performance

```bash
# Real-time monitoring
pm2 monit

# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/health

# Monitor API endpoints
pm2 logs aircraft-dashboard | grep "API"
```

### Scaling Guidelines

- **Low Traffic**: 2 aircraft-dashboard instances
- **Medium Traffic**: 4 instances (current)
- **High Traffic**: 6-8 instances
- **Memory**: Monitor and adjust max_memory_restart
- **CPU**: Scale based on core count

## NPM Scripts

The following NPM scripts are available for PM2 management:

```json
{
  "start:pm2": "pm2 start ecosystem.config.js",
  "stop:pm2": "pm2 stop ecosystem.config.js && pm2 delete ecosystem.config.js",
  "restart:pm2": "pm2 restart ecosystem.config.js",
  "status:pm2": "pm2 list",
  "logs:pm2": "pm2 logs",
  "monit:pm2": "pm2 monit"
}
```

## File Structure

```
logs/
├── pm2-aircraft-dashboard.log
├── pm2-aircraft-dashboard-out.log
├── pm2-aircraft-dashboard-error.log
├── pm2-websocket-server.log
├── pm2-websocket-server-out.log
├── pm2-websocket-server-error.log
├── pm2-tile-proxy-server.log
├── pm2-tile-proxy-server-out.log
└── pm2-tile-proxy-server-error.log

ecosystem.config.js          # PM2 configuration
server.js                    # Main application
websocket-server.js          # WebSocket server
tile-proxy-server.js         # Tile proxy server
```

## Best Practices

1. **Monitor Regularly**: Use `pm2 monit` for real-time monitoring
2. **Log Rotation**: PM2 handles log rotation automatically
3. **Resource Limits**: Set appropriate memory limits to prevent OOM
4. **Backup Config**: Use `pm2 save` to persist configuration
5. **Test Scaling**: Scale instances based on load testing
6. **Update Carefully**: Test configuration changes before production
7. **Monitor Ports**: Ensure no port conflicts between services

## Support

For PM2-specific issues:
- PM2 Documentation: https://pm2.keymetrics.io/
- PM2 GitHub: https://github.com/Unitech/pm2

For application-specific issues, check the main application logs and documentation.</content>
<parameter name="filePath">C:\Users\chris\aircraft-dashboard-new\PM2_GUIDE.md