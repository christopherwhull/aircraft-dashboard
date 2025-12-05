# Aircraft Dashboard Services Setup Guide

This guide provides focused instructions for running the Aircraft Tracker (Python) and Node.js servers as systemd services on Linux/Raspberry Pi.

## ⚠️ Potential Service Issues & Solutions

Before setting up services, be aware of these common problems:

### 1. **User Permissions**
- **Issue**: Service runs as 'pi' user but files owned by different user
- **Solution**: Ensure correct ownership: `sudo chown -R pi:pi /home/pi/aircraft-dashboard`

### 2. **Working Directory**
- **Issue**: Hardcoded `/home/pi/aircraft-dashboard` may not exist
- **Solution**: Verify path: `ls -la /home/pi/aircraft-dashboard`

### 3. **Environment Variables**
- **Issue**: `/etc/default/aircraft-dashboard` missing or incorrect
- **Solution**: Create proper environment file (see below)

### 4. **Memory Limits**
- **Issue**: 256M limit too high for Raspberry Pi with 1GB RAM
- **Solution**: Reduce to 128M for Node.js, 64M for Python on RPi

### 5. **Dependencies Not Ready**
- **Issue**: Services start before MinIO/PiAware are ready
- **Solution**: Check service status: `sudo systemctl status minio piaware`

### 6. **Python Path Issues**
- **Issue**: Python can't find modules or script not executable
- **Solution**: Check permissions: `ls -la aircraft_tracker.py`

### 7. **Node.js Path Issues**
- **Issue**: Node can't find node_modules or global modules
- **Solution**: Ensure npm install was run: `ls -la node_modules/`

## Prerequisites

- Aircraft Dashboard installed in `/home/pi/aircraft-dashboard` (or your preferred directory)
- MinIO and PiAware services running
- Environment configuration in `/etc/default/aircraft-dashboard`
- Correct file permissions and ownership

## Node.js Server Service (Port 3002)

### Create Service File
```bash
sudo tee /etc/systemd/system/aircraft-dashboard.service > /dev/null <<EOF
[Unit]
Description=Aircraft Dashboard Main Server
After=network.target minio.service
Requires=minio.service
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=-/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node server.js
ExecStartPre=/bin/bash -c 'test -f /home/pi/aircraft-dashboard/server.js'
ExecStartPre=/bin/bash -c 'test -d /home/pi/aircraft-dashboard/node_modules'
Restart=always
RestartSec=10
TimeoutStartSec=30
StandardOutput=journal
StandardError=journal
MemoryLimit=128M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF
```

### Raspberry Pi Memory Optimization
For Raspberry Pi with limited RAM, use these settings:
```bash
# For Raspberry Pi 4 with 4GB RAM
MemoryLimit=256M
CPUQuota=75%

# For Raspberry Pi 3/Zero with 1GB RAM
MemoryLimit=128M
CPUQuota=50%
```

### Enable and Start Node.js Service
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable aircraft-dashboard

# Start the service
sudo systemctl start aircraft-dashboard

# Check status
sudo systemctl status aircraft-dashboard
```

## Python Aircraft Tracker Service

### Create Service File
```bash
sudo tee /etc/systemd/system/aircraft-tracker.service > /dev/null <<EOF
[Unit]
Description=Aircraft Tracker Python Service
After=network.target minio.service piaware.service
Requires=minio.service piaware.service
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=-/etc/default/aircraft-dashboard
ExecStart=/usr/bin/python3 aircraft_tracker.py --headless
ExecStartPre=/bin/bash -c 'test -f /home/pi/aircraft-dashboard/aircraft_tracker.py'
ExecStartPre=/bin/bash -c 'test -x /home/pi/aircraft-dashboard/aircraft_tracker.py'
Restart=always
RestartSec=30
TimeoutStartSec=60
StandardOutput=journal
StandardError=journal
MemoryLimit=64M
CPUQuota=25%

[Install]
WantedBy=multi-user.target
EOF
```

**Note**: The service uses the `--headless` option to suppress console output, making it suitable for running as a background service without terminal interaction.

### Raspberry Pi Memory Optimization
For Raspberry Pi with limited RAM:
```bash
# For Raspberry Pi 4 with 4GB RAM
MemoryLimit=128M
CPUQuota=25%

# For Raspberry Pi 3/Zero with 1GB RAM
MemoryLimit=64M
CPUQuota=15%
```

### Enable and Start Python Service
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable aircraft-tracker

# Start the service
sudo systemctl start aircraft-tracker

# Check status
sudo systemctl status aircraft-tracker
```

## Environment Configuration

Create `/etc/default/aircraft-dashboard` with your settings:
```bash
sudo tee /etc/default/aircraft-dashboard > /dev/null <<EOF
# PiAware Configuration
PIAWARE_URL=http://localhost:8080/data/aircraft.json

# MinIO/S3 Configuration
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
READ_BUCKET=aircraft-data
WRITE_BUCKET=aircraft-data-new

# Server Configuration
PORT=3002
EOF
```

## Service Management Commands

### Check Service Status
```bash
# Check both services
sudo systemctl status aircraft-dashboard aircraft-tracker

# View detailed logs
sudo journalctl -u aircraft-dashboard -f
sudo journalctl -u aircraft-tracker -f
```

### Stop Services
```bash
sudo systemctl stop aircraft-dashboard aircraft-tracker
```

### Restart Services
```bash
sudo systemctl restart aircraft-dashboard aircraft-tracker
```

### Disable Services (Prevent Auto-Start)
```bash
sudo systemctl disable aircraft-dashboard aircraft-tracker
```

### View Logs
```bash
# Last 50 lines from Node.js server
sudo journalctl -u aircraft-dashboard -n 50

# Last 50 lines from Python tracker
sudo journalctl -u aircraft-tracker -n 50

# Follow logs in real-time
sudo journalctl -u aircraft-dashboard -f
sudo journalctl -u aircraft-tracker -f

# View logs from today
sudo journalctl -u aircraft-dashboard --since today
sudo journalctl -u aircraft-tracker --since today
```

## Troubleshooting

### Service Won't Start

#### Check Service Status
```bash
# Check if service is running
sudo systemctl status aircraft-dashboard
sudo systemctl status aircraft-tracker

# Check if service failed to start
sudo systemctl list-units --failed
```

#### View Detailed Logs
```bash
# View last 50 lines of logs
sudo journalctl -u aircraft-dashboard -n 50 --no-pager
sudo journalctl -u aircraft-tracker -n 50 --no-pager

# Follow logs in real-time
sudo journalctl -u aircraft-dashboard -f
sudo journalctl -u aircraft-tracker -f

# View logs with timestamps
sudo journalctl -u aircraft-dashboard -o short-iso --since "1 hour ago"
```

### Common Startup Issues

#### 1. **Permission Denied**
```bash
# Check file ownership
ls -la /home/pi/aircraft-dashboard/

# Fix ownership
sudo chown -R pi:pi /home/pi/aircraft-dashboard/

# Check if scripts are executable
ls -la /home/pi/aircraft-dashboard/*.py
ls -la /home/pi/aircraft-dashboard/*.js

# Make scripts executable
chmod +x /home/pi/aircraft-dashboard/aircraft_tracker.py
chmod +x /home/pi/aircraft-dashboard/server.js
```

#### 2. **Working Directory Not Found**
```bash
# Check if directory exists
ls -la /home/pi/aircraft-dashboard/

# If using different path, update service file
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: WorkingDirectory=/path/to/your/aircraft-dashboard

sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard
```

#### 3. **Environment File Missing**
```bash
# Check if environment file exists
ls -la /etc/default/aircraft-dashboard

# Create environment file if missing
sudo tee /etc/default/aircraft-dashboard > /dev/null <<EOF
PIAWARE_URL=http://localhost:8080/data/aircraft.json
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
READ_BUCKET=aircraft-data
WRITE_BUCKET=aircraft-data-new
PORT=3002
EOF
```

#### 4. **Dependencies Not Running**
```bash
# Check MinIO status
sudo systemctl status minio

# Check PiAware status
sudo systemctl status piaware dump1090-fa

# Start dependencies if needed
sudo systemctl start minio piaware dump1090-fa
```

#### 5. **Node.js Issues**
```bash
# Check if node_modules exists
ls -la /home/pi/aircraft-dashboard/node_modules/

# Reinstall dependencies if needed
cd /home/pi/aircraft-dashboard
npm install

# Test Node.js manually
cd /home/pi/aircraft-dashboard
/usr/bin/node server.js
```

#### 6. **Python Issues**
```bash
# Check Python installation
python3 --version
pip3 list | grep -E "(requests|boto3)"

# Install missing packages
pip3 install requests boto3

# Test Python script manually
cd /home/pi/aircraft-dashboard
/usr/bin/python3 aircraft_tracker.py --help
```

#### 7. **Port Already in Use**
```bash
# Check what's using port 3002
sudo netstat -tlnp | grep :3002
sudo lsof -i :3002

# Kill conflicting process
sudo fuser -k 3002/tcp
```

#### 8. **Memory Issues**
```bash
# Check system memory
free -h

# Check service memory usage
sudo systemctl status aircraft-dashboard
sudo journalctl -u aircraft-dashboard | grep "Memory"

# Reduce memory limits for Raspberry Pi
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: MemoryLimit=128M

sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard
```

#### 9. **User Issues**
```bash
# Check if 'pi' user exists
id pi

# Check if user can access files
sudo -u pi ls -la /home/pi/aircraft-dashboard/

# Change service to run as different user
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: User=yourusername

sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard
```

### Service Restart Issues

#### Service Keeps Restarting
```bash
# Check restart count
sudo systemctl show aircraft-dashboard | grep -E "(Restart|ActiveState)"

# View recent restarts
sudo journalctl -u aircraft-dashboard --since "5 minutes ago" | grep -i restart

# Temporarily disable restart to debug
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: Restart=no

sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard
```

#### Service Won't Stop
```bash
# Force stop service
sudo systemctl kill aircraft-dashboard

# Check for zombie processes
ps aux | grep node
ps aux | grep python3

# Kill manually if needed
sudo pkill -f "node server.js"
sudo pkill -f "python3 aircraft_tracker.py"
```

### Network Issues

#### Service Can't Bind to Port
```bash
# Check if port is available
sudo netstat -tlnp | grep :3002

# Try different port in environment
sudo nano /etc/default/aircraft-dashboard
# Change: PORT=3003

sudo systemctl restart aircraft-dashboard
```

#### Can't Connect to MinIO/PiAware
```bash
# Test MinIO connection
curl http://localhost:9000

# Test PiAware connection
curl http://localhost:8080/data/aircraft.json

# Update environment file with correct URLs
sudo nano /etc/default/aircraft-dashboard
```

### Performance Issues

#### High CPU Usage
```bash
# Check CPU usage
top -p $(pgrep -f "node server.js")
top -p $(pgrep -f "python3 aircraft_tracker")

# Reduce CPU quota
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: CPUQuota=25%

sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard
```

#### High Memory Usage
```bash
# Monitor memory usage
sudo journalctl -u aircraft-dashboard | grep "Memory"

# Check current limits
systemctl show aircraft-dashboard | grep MemoryLimit

# Adjust limits
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: MemoryLimit=64M
```

### Raspberry Pi Specific Issues

#### SD Card Wear
```bash
# Check disk usage
df -h

# Move logs to RAM (tmpfs)
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Add: LogsDirectory=/var/log/aircraft-dashboard
# Add: LogsDirectoryMode=0755

# Use external USB drive for data
sudo nano /etc/default/aircraft-dashboard
# Change: S3_ENDPOINT=http://external-minio:9000
```

#### Overheating
```bash
# Check temperature
vcgencmd measure_temp

# Monitor throttling
vcgencmd get_throttled

# Reduce CPU usage
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: CPUQuota=25%
```

### Advanced Debugging

#### Enable Debug Logging
```bash
# Add debug environment variables
sudo nano /etc/default/aircraft-dashboard
# Add: DEBUG=*
# Add: NODE_ENV=development

sudo systemctl restart aircraft-dashboard
```

#### Create Custom Log Files
```bash
# Modify service to write to files
sudo nano /etc/systemd/system/aircraft-dashboard.service
# Change: StandardOutput=append:/var/log/aircraft-dashboard.log
# Change: StandardError=append:/var/log/aircraft-dashboard-error.log

sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard
```

#### Test Service in Isolation
```bash
# Stop all services
sudo systemctl stop aircraft-dashboard aircraft-tracker minio piaware

# Test Node.js manually
cd /home/pi/aircraft-dashboard
sudo -u pi /usr/bin/node server.js

# Test Python manually
cd /home/pi/aircraft-dashboard
sudo -u pi /usr/bin/python3 aircraft_tracker.py --test-mode
```

### Recovery Procedures

#### Complete Service Reset
```bash
# Stop and disable services
sudo systemctl stop aircraft-dashboard aircraft-tracker
sudo systemctl disable aircraft-dashboard aircraft-tracker

# Remove service files
sudo rm /etc/systemd/system/aircraft-dashboard.service
sudo rm /etc/systemd/system/aircraft-tracker.service

# Reload systemd
sudo systemctl daemon-reload

# Reinstall services (see setup instructions above)
```

#### Clean Environment Reset
```bash
# Backup current config
cp /etc/default/aircraft-dashboard /etc/default/aircraft-dashboard.backup

# Reset to defaults
sudo tee /etc/default/aircraft-dashboard > /dev/null <<EOF
PIAWARE_URL=http://localhost:8080/data/aircraft.json
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
READ_BUCKET=aircraft-data
WRITE_BUCKET=aircraft-data-new
PORT=3002
EOF

sudo systemctl restart aircraft-dashboard aircraft-tracker
```

## Performance Tuning

### Memory Limits
The services include optimized memory limits for Raspberry Pi. Current settings:
- **Node.js server**: 128M (Raspberry Pi optimized)
- **Python tracker**: 64M (Raspberry Pi optimized)

Adjust if needed for your hardware:
```bash
# Edit service files
sudo nano /etc/systemd/system/aircraft-dashboard.service
sudo nano /etc/systemd/system/aircraft-tracker.service

# Change MemoryLimit values, then reload:
sudo systemctl daemon-reload
sudo systemctl restart aircraft-dashboard aircraft-tracker
```

### CPU Quotas
Current CPU limits prevent services from consuming all resources:
- **Node.js server**: 50% CPU quota
- **Python tracker**: 25% CPU quota

### Raspberry Pi Specific Tuning
```bash
# For Raspberry Pi 4 with 4GB RAM
# Node.js: MemoryLimit=256M, CPUQuota=75%
# Python: MemoryLimit=128M, CPUQuota=25%

# For Raspberry Pi 3/Zero with 1GB RAM
# Node.js: MemoryLimit=128M, CPUQuota=50%
# Python: MemoryLimit=64M, CPUQuota=15%
```

### Log Rotation
Systemd automatically handles log rotation. View logs with:
```bash
# View all logs for a service
sudo journalctl -u aircraft-dashboard --no-pager | less

# View logs with timestamps
sudo journalctl -u aircraft-dashboard -o short-iso

# View logs from specific time period
sudo journalctl -u aircraft-dashboard --since "2024-01-01" --until "2024-01-02"
```

## Quick Setup Script

For automated setup, save this as `setup-services.sh`:
```bash
#!/bin/bash
# Quick service setup script

# Create environment file
sudo tee /etc/default/aircraft-dashboard > /dev/null <<EOF
PIAWARE_URL=http://localhost:8080/data/aircraft.json
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
READ_BUCKET=aircraft-data
WRITE_BUCKET=aircraft-data-new
PORT=3002
EOF

# Create Node.js service
sudo tee /etc/systemd/system/aircraft-dashboard.service > /dev/null <<EOF
[Unit]
Description=Aircraft Dashboard Main Server
After=network.target minio.service
Requires=minio.service
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=-/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node server.js
ExecStartPre=/bin/bash -c 'test -f /home/pi/aircraft-dashboard/server.js'
ExecStartPre=/bin/bash -c 'test -d /home/pi/aircraft-dashboard/node_modules'
Restart=always
RestartSec=10
TimeoutStartSec=30
StandardOutput=journal
StandardError=journal
MemoryLimit=128M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF

# Create Python service
sudo tee /etc/systemd/system/aircraft-tracker.service > /dev/null <<EOF
[Unit]
Description=Aircraft Tracker Python Service
After=network.target minio.service piaware.service
Requires=minio.service piaware.service
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=-/etc/default/aircraft-dashboard
ExecStart=/usr/bin/python3 aircraft_tracker.py --headless
ExecStartPre=/bin/bash -c 'test -f /home/pi/aircraft-dashboard/aircraft_tracker.py'
ExecStartPre=/bin/bash -c 'test -x /home/pi/aircraft-dashboard/aircraft_tracker.py'
Restart=always
RestartSec=30
TimeoutStartSec=60
StandardOutput=journal
StandardError=journal
MemoryLimit=64M
CPUQuota=25%

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable aircraft-dashboard aircraft-tracker
sudo systemctl start aircraft-dashboard aircraft-tracker

echo "Services installed and started!"
echo "Check status: sudo systemctl status aircraft-dashboard aircraft-tracker"
```

Run with: `chmod +x setup-services.sh && sudo ./setup-services.sh`</content>
<parameter name="filePath">c:\Users\chris\aircraft-dashboard-new\SERVICES_SETUP.md