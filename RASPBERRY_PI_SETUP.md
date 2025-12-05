# Aircraft Dashboard - Raspberry Pi Installation Guide

This guide provides step-by-step instructions for installing and configuring the Aircraft Dashboard on a Raspberry Pi. The Aircraft Dashboard works with PiAware to provide real-time flight tracking and analytics.

## Table of Contents

- [Hardware Requirements](#hardware-requirements)
- [Software Prerequisites](#software-prerequisites)
- [PiAware Setup](#piaware-setup)
- [MinIO Setup](#minio-setup)
- [Aircraft Dashboard Installation](#aircraft-dashboard-installation)
- [Server Installation and Configuration](#server-installation-and-configuration)
- [Configuration](#configuration)
- [Running as a Service](#running-as-a-service)
- [Accessing the Dashboard](#accessing-the-dashboard)
- [Troubleshooting](#troubleshooting)
- [Performance Optimization](#performance-optimization)

## Hardware Requirements

### Minimum Requirements
- **Raspberry Pi Model**: 3B or newer (4B recommended)
- **RAM**: 1GB minimum (2GB recommended)
- **Storage**: 16GB microSD card minimum (32GB recommended)
- **Network**: Ethernet connection (WiFi can work but Ethernet is more reliable for ADS-B data)

### Recommended Hardware
- **Raspberry Pi 4B** with 4GB RAM
- **32GB+ microSD card** (Class 10, UHS-I)
- **USB SSD** for data storage (optional but recommended for performance)
- **RTL-SDR dongle** for ADS-B reception (if not using existing PiAware)

## Software Prerequisites

### Operating System
Use **Raspberry Pi OS (64-bit)** (formerly Raspbian):
```bash
# Check your OS version
cat /etc/os-release
```

If not using Raspberry Pi OS 64-bit, flash it using Raspberry Pi Imager:
1. Download Raspberry Pi Imager from https://www.raspberrypi.com/software/
2. Choose "Raspberry Pi OS (64-bit)" → "Raspberry Pi 4"
3. Flash to your microSD card

### System Updates
```bash
# Update package lists and upgrade system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git htop vim nano
```

### Node.js Installation
```bash
# Install Node.js 18.x (LTS) using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### Python Setup (for utility scripts)
```bash
# Install Python 3 and pip
sudo apt install -y python3 python3-pip python3-venv

# Install required Python packages
pip3 install requests boto3
```

## PiAware Setup

The Aircraft Dashboard requires PiAware for ADS-B data. You can either:
1. Use an existing PiAware installation on your network
2. Install PiAware on the same Raspberry Pi

### Option 1: Use Existing PiAware
If you have PiAware running elsewhere on your network:
```bash
# Test connectivity to your PiAware server
curl http://YOUR_PIAWARE_IP:8080/data/aircraft.json
```

### Option 2: Install PiAware on the Same Raspberry Pi

**Note**: This requires an RTL-SDR dongle connected to your Raspberry Pi.

```bash
# Install PiAware (FlightAware's ADS-B software)
wget https://flightaware.com/adsb/piaware/files/packages/pool/piaware/p/piaware-support/piaware-support_7.2_all.deb
sudo dpkg -i piaware-support_7.2_all.deb

# Install dump1090 (ADS-B decoder)
sudo apt install -y dump1090-fa

# Install PiAware
wget https://flightaware.com/adsb/piaware/files/packages/pool/piaware/p/piaware/piaware_8.2_arm64.deb
sudo dpkg -i piaware_8.2_arm64.deb

# Configure PiAware
sudo piaware-config allow-auto-updates yes
sudo piaware-config allow-manual-updates yes

# Start PiAware services
sudo systemctl enable piaware dump1090-fa
sudo systemctl start piaware dump1090-fa

# Check status
sudo systemctl status piaware
sudo systemctl status dump1090-fa
```

**Test PiAware**:
```bash
# Check if PiAware is receiving data
curl http://localhost:8080/data/aircraft.json | head -20
```

## MinIO Setup

MinIO provides S3-compatible storage for historical flight data.

### Install MinIO
```bash
# Download and install MinIO
wget https://dl.min.io/server/minio/release/linux-arm64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

# Create MinIO user and directories
sudo useradd -r minio-user -s /sbin/nologin
sudo mkdir -p /opt/minio/data
sudo chown minio-user:minio-user /opt/minio/data
```

### Create MinIO Service
```bash
# Create systemd service file
sudo tee /etc/systemd/system/minio.service > /dev/null <<EOF
[Unit]
Description=MinIO
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
User=minio-user
Group=minio-user
Environment="MINIO_ROOT_USER=minioadmin"
Environment="MINIO_ROOT_PASSWORD=minioadmin123"
ExecStart=/usr/local/bin/minio server /opt/minio/data --console-address ":9001"
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Start MinIO service
sudo systemctl daemon-reload
sudo systemctl enable minio
sudo systemctl start minio

# Check status
sudo systemctl status minio
```

### Configure MinIO Buckets
```bash
# Wait for MinIO to start
sleep 10

# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-arm64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure MinIO client
mc alias set local http://localhost:9000 minioadmin minioadmin123

# Create required buckets
mc mb local/aircraft-data
mc mb local/aircraft-data-new

# Set bucket policies (allow public read for aircraft data)
mc policy set download local/aircraft-data
mc policy set download local/aircraft-data-new
```

## Aircraft Dashboard Installation

### Clone and Install
```bash
# Clone the repository
git clone https://github.com/christopherwhull/aircraft-dashboard.git
cd aircraft-dashboard

# Install Node.js dependencies
npm install

# Make scripts executable
chmod +x tools/*.py tools/*.sh
```

## Server Installation and Configuration

The Aircraft Dashboard consists of multiple servers that work together:

- **Main Dashboard Server** (`server.js`) - Web interface and API (port 3002)
- **GeoTIFF Server** (`geotiff-server.js`) - Aviation chart tiles (port 3003)
- **Tile Proxy Server** (`tile-proxy-server.js`) - Map tile caching (port 3004)
- **Aircraft Tracker** (`aircraft_tracker.py`) - Background data collection

### Node.js Server Installation

#### Main Dashboard Server (Port 3002)
```bash
# Install dependencies
cd aircraft-dashboard
npm install

# Test the main server
node server.js
# Should start on http://localhost:3002
# Press Ctrl+C to stop
```

#### GeoTIFF Server (Port 3003)
```bash
# Install additional dependencies for GeoTIFF processing
sudo apt install -y libgdal-dev

# Test the GeoTIFF server
node geotiff-server.js
# Should start on http://localhost:3003
# Press Ctrl+C to stop
```

#### Tile Proxy Server (Port 3004)
```bash
# Test the tile proxy server
node tile-proxy-server.js
# Should start on http://localhost:3004
# Press Ctrl+C to stop
```

### Python Server Installation

#### Aircraft Tracker Setup
```bash
# Install Python dependencies
pip3 install requests boto3

# Test the aircraft tracker
python3 aircraft_tracker.py --help

# Run in test mode (doesn't save data)
python3 aircraft_tracker.py --test-mode --verbose
```

### Multi-Server Startup

#### Manual Startup (Testing)
```bash
# Terminal 1: Main dashboard server
cd aircraft-dashboard
node server.js

# Terminal 2: GeoTIFF server
cd aircraft-dashboard
node geotiff-server.js

# Terminal 3: Tile proxy server
cd aircraft-dashboard
node tile-proxy-server.js

# Terminal 4: Aircraft tracker
cd aircraft-dashboard
python3 aircraft_tracker.py
```

#### Automated Startup Scripts
```bash
# Use the provided startup script
cd aircraft-dashboard
chmod +x restart-server.sh
./restart-server.sh
```

#### Using npm Scripts
```bash
# Start all servers (main + GeoTIFF)
npm run start:all

# Start tile proxy separately
npm run proxy:tiles
```

### Initial Configuration
```bash
# Copy configuration template
cp config.js config.js.backup

# Edit configuration
nano config.js
```

Update the following settings in `config.js`:
```javascript
module.exports = {
  // PiAware configuration
  piAwareUrl: process.env.PIAWARE_URL || "http://localhost:8080/data/aircraft.json",

  // MinIO/S3 configuration
  s3: {
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin123",
    readBucket: process.env.READ_BUCKET || "aircraft-data",
    writeBucket: process.env.WRITE_BUCKET || "aircraft-data-new"
  },

  // Server configuration
  port: process.env.PORT || 3002,

  // Other settings...
};
```

## Configuration

### Environment Variables (Recommended)
Create an environment file for better security:
```bash
# Create environment file
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

### Test Configuration
```bash
# Test the dashboard manually first
cd aircraft-dashboard
node server.js
```

Open another terminal and test:
```bash
# Test health endpoint
curl http://localhost:3002/api/health

# Test PiAware connectivity
curl http://localhost:3002/api/piaware-status
```

## Running as a Service

The Aircraft Dashboard has multiple components that should run as systemd services for production use.

### Main Dashboard Service (Port 3002)
```bash
# Copy the service file to systemd
sudo cp aircraft-dashboard.service /etc/systemd/system/

# Edit the service file if needed
sudo nano /etc/systemd/system/aircraft-dashboard.service
```

The service file should look like this:
```ini
[Unit]
Description=Aircraft Dashboard Main Server
After=network.target minio.service piaware.service
Requires=minio.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryLimit=512M

[Install]
WantedBy=multi-user.target
```

### GeoTIFF Server Service (Port 3003)
```bash
# Create GeoTIFF service file
sudo tee /etc/systemd/system/geotiff-server.service > /dev/null <<EOF
[Unit]
Description=Aircraft Dashboard GeoTIFF Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node geotiff-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryLimit=256M

[Install]
WantedBy=multi-user.target
EOF
```

### Tile Proxy Server Service (Port 3004)
```bash
# Create tile proxy service file
sudo tee /etc/systemd/system/tile-proxy-server.service > /dev/null <<EOF
[Unit]
Description=Aircraft Dashboard Tile Proxy Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node tile-proxy-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryLimit=128M

[Install]
WantedBy=multi-user.target
EOF
```

### Aircraft Tracker Service (Python)
```bash
# Create aircraft tracker service file
sudo tee /etc/systemd/system/aircraft-tracker.service > /dev/null <<EOF
[Unit]
Description=Aircraft Tracker Python Service
After=network.target minio.service piaware.service
Requires=minio.service piaware.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/python3 aircraft_tracker.py --headless
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal
MemoryLimit=128M

[Install]
WantedBy=multi-user.target
EOF
```

### Enable and Start All Services
```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable all services to start on boot
sudo systemctl enable aircraft-dashboard
sudo systemctl enable geotiff-server
sudo systemctl enable tile-proxy-server
sudo systemctl enable aircraft-tracker

# Start all services
sudo systemctl start aircraft-dashboard
sudo systemctl start geotiff-server
sudo systemctl start tile-proxy-server
sudo systemctl start aircraft-tracker

# Check status of all services
sudo systemctl status aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker

# View logs for specific service
sudo journalctl -u aircraft-dashboard -f
sudo journalctl -u geotiff-server -f
sudo journalctl -u tile-proxy-server -f
sudo journalctl -u aircraft-tracker -f
```

### Service Management Commands
```bash
# Stop all services
sudo systemctl stop aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker

# Restart all services
sudo systemctl restart aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker

# Check if all services are running
sudo systemctl list-units --type=service --state=running | grep aircraft

# View all aircraft-related logs
sudo journalctl -u aircraft-dashboard -u geotiff-server -u tile-proxy-server -u aircraft-tracker --since today
```

## Accessing the Dashboard

### Local Access
Once all services are running, you can access the dashboard and related services:

- **Main Dashboard**: http://localhost:3002 (Aircraft tracking interface)
- **GeoTIFF Server**: http://localhost:3003 (Aviation chart tiles)
- **Tile Proxy Server**: http://localhost:3004 (Map tile caching)
- **MinIO Console**: http://localhost:9001 (login: minioadmin / minioadmin123)

### Service Status Check
```bash
# Check all aircraft services
sudo systemctl status aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker

# Quick port check
netstat -tlnp | grep -E ':(3002|3003|3004|9000|9001)'

# Test main dashboard
curl -s http://localhost:3002/api/health | head -10
```

### Remote Access (Optional)
For remote access, you can:
1. Use SSH tunneling
2. Set up a reverse proxy (nginx/apache)
3. Use a VPN

**Example SSH tunnel for main dashboard**:
```bash
# On your local machine
ssh -L 3002:localhost:3002 pi@YOUR_RPI_IP
# Then access http://localhost:3002
```

**Access all services remotely**:
```bash
# Tunnel all ports
ssh -L 3002:localhost:3002 -L 3003:localhost:3003 -L 3004:localhost:3004 -L 9001:localhost:9001 pi@YOUR_RPI_IP
```

## Troubleshooting

### Common Issues

#### "Cannot connect to PiAware"
```bash
# Check if PiAware is running
sudo systemctl status piaware dump1090-fa

# Test PiAware endpoint directly
curl http://localhost:8080/data/aircraft.json

# Check PiAware logs
sudo journalctl -u piaware -n 50
```

#### "Cannot connect to MinIO"
```bash
# Check MinIO status
sudo systemctl status minio

# Test MinIO endpoint
curl http://localhost:9000

# Check MinIO logs
sudo journalctl -u minio -n 50

# Verify credentials
mc alias list
```

#### "Dashboard service fails to start"
```bash
# Check service status and logs
sudo systemctl status aircraft-dashboard
sudo journalctl -u aircraft-dashboard -n 50

# Test manual startup
cd aircraft-dashboard
node server.js
```

#### "Out of memory errors"
```bash
# Check memory usage
free -h
htop

# Increase swap space if needed
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile  # Change CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

#### "RTL-SDR not working"
```bash
# Check USB devices
lsusb | grep RTL

# Check kernel modules
lsmod | grep rtl

# Install rtl-sdr tools
sudo apt install -y rtl-sdr

# Test RTL-SDR
rtl_test
```

#### "GeoTIFF server not serving charts"
```bash
# Check if GeoTIFF service is running
sudo systemctl status geotiff-server

# Test GeoTIFF endpoint
curl http://localhost:3003/health

# Check logs
sudo journalctl -u geotiff-server -n 50

# Test manual startup
cd aircraft-dashboard
node geotiff-server.js
```

#### "Tile proxy not caching tiles"
```bash
# Check tile proxy service
sudo systemctl status tile-proxy-server

# Test tile proxy endpoint
curl http://localhost:3004/cache/status

# Check tile cache directory
ls -la tile_cache/

# Check logs
sudo journalctl -u tile-proxy-server -n 50
```

#### "Aircraft tracker not collecting data"
```bash
# Check aircraft tracker service
sudo systemctl status aircraft-tracker

# Check if it's processing data
sudo journalctl -u aircraft-tracker -f

# Test manual run
cd aircraft-dashboard
python3 aircraft_tracker.py --test-mode --verbose

# Check MinIO bucket for new files
mc ls local/aircraft-data-new
```

#### "Port conflicts"
```bash
# Check what services are using the ports
sudo netstat -tlnp | grep -E ':(3002|3003|3004|8080|9000|9001)'

# Kill conflicting processes
sudo fuser -k 3002/tcp  # Replace with actual port
```

#### "Node.js memory issues on Raspberry Pi"
```bash
# Set Node.js memory limits
export NODE_OPTIONS="--max-old-space-size=256"

# Or set in service files
# Add to [Service] section: Environment="NODE_OPTIONS=--max-old-space-size=256"
```

### Performance Monitoring
```bash
# Monitor system resources
htop

# Monitor dashboard logs
sudo journalctl -u aircraft-dashboard -f

# Check MinIO performance
mc admin info local

# Monitor network traffic
sudo apt install -y nload
nload
```

## Performance Optimization

### Raspberry Pi Specific Optimizations
```bash
# Enable GPU memory (reduce GPU RAM for more CPU RAM)
sudo raspi-config nonint do_memory_split 256

# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon

# Optimize for performance
sudo raspi-config nonint do_cpu_gov performance
```

### Node.js Optimizations
```bash
# Set Node.js memory limit for main server
export NODE_OPTIONS="--max-old-space-size=256"

# For GeoTIFF server (uses more memory for image processing)
# Set in service file: Environment="NODE_OPTIONS=--max-old-space-size=128"

# Enable Node.js performance optimizations
export NODE_OPTIONS="--max-old-space-size=256 --optimize-for-size"
```

### Server-Specific Optimizations

#### Main Dashboard Server (Port 3002)
```bash
# Optimize for lower memory usage
# Add to aircraft-dashboard.service [Service] section:
# Environment="NODE_ENV=production"
# MemoryLimit=256M
# CPUQuota=50%
```

#### GeoTIFF Server (Port 3003)
```bash
# Optimize for image processing
# Add to geotiff-server.service [Service] section:
# Environment="NODE_OPTIONS=--max-old-space-size=128"
# MemoryLimit=128M
# Nice=-5  # Higher priority for chart rendering
```

#### Tile Proxy Server (Port 3004)
```bash
# Optimize for I/O operations
# Add to tile-proxy-server.service [Service] section:
# MemoryLimit=64M
# IOSchedulingClass=best-effort
# IOSchedulingPriority=0
```

#### Aircraft Tracker (Python)
```bash
# Optimize Python performance
# Add to aircraft-tracker.service [Service] section:
# Environment="PYTHONOPTIMIZE=1"
# MemoryLimit=64M
# CPUQuota=25%
```

### Storage Optimization
```bash
# Use external USB drive for MinIO data (optional)
sudo mkdir -p /mnt/usbdrive/minio
sudo mount /dev/sda1 /mnt/usbdrive  # Adjust device as needed
sudo ln -s /mnt/usbdrive/minio /opt/minio/data
```

### Network Optimization
```bash
# Optimize network settings for Raspberry Pi
sudo tee /etc/sysctl.d/99-network-tuning.conf > /dev/null <<EOF
net.core.rmem_max=262144
net.core.wmem_max=262144
net.ipv4.tcp_rmem=4096 87380 262144
net.ipv4.tcp_wmem=4096 87380 262144
EOF

sudo sysctl -p /etc/sysctl.d/99-network-tuning.conf
```

## Backup and Recovery

### Backup Configuration
```bash
# Backup aircraft dashboard configuration
tar -czf aircraft-dashboard-config-$(date +%Y%m%d).tar.gz \
  aircraft-dashboard/config.js \
  /etc/default/aircraft-dashboard \
  /etc/systemd/system/aircraft-dashboard.service \
  /etc/systemd/system/geotiff-server.service \
  /etc/systemd/system/tile-proxy-server.service \
  /etc/systemd/system/aircraft-tracker.service
```

### Backup MinIO Data
```bash
# Stop services before backup
sudo systemctl stop aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker minio

# Backup MinIO data
tar -czf minio-data-$(date +%Y%m%d).tar.gz /opt/minio/data

# Backup tile cache
tar -czf tile-cache-$(date +%Y%m%d).tar.gz aircraft-dashboard/tile_cache/

# Restart services
sudo systemctl start minio aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker
```

## Updating

### Update Aircraft Dashboard
```bash
cd aircraft-dashboard
git pull
npm install

# Restart all services
sudo systemctl restart aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker

# Check status
sudo systemctl status aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker
```

### Update System Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot  # Recommended after major updates
```

## Support

For issues specific to Raspberry Pi installation:
1. Check the troubleshooting section above
2. Review logs: `sudo journalctl -u aircraft-dashboard -f`
3. Check system resources: `htop`
4. Open an issue on GitHub: https://github.com/christopherwhull/aircraft-dashboard/issues

## Appendix: Complete Installation Script

For automated installation, you can use this script (review it first):

```bash
#!/bin/bash
# Aircraft Dashboard Raspberry Pi Installation Script
# Run as root or with sudo

set -e

echo "Aircraft Dashboard - Raspberry Pi Installation"
echo "=============================================="

# Update system
echo "Updating system..."
apt update && apt upgrade -y

# Install prerequisites
echo "Installing prerequisites..."
apt install -y curl wget git htop vim nano python3 python3-pip

# Install Node.js
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install MinIO
echo "Installing MinIO..."
wget https://dl.min.io/server/minio/release/linux-arm64/minio
chmod +x minio
mv minio /usr/local/bin/
useradd -r minio-user -s /sbin/nologin
mkdir -p /opt/minio/data
chown minio-user:minio-user /opt/minio/data

# Create MinIO service
echo "Creating MinIO service..."
tee /etc/systemd/system/minio.service > /dev/null <<EOF
[Unit]
Description=MinIO
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
User=minio-user
Group=minio-user
Environment="MINIO_ROOT_USER=minioadmin"
Environment="MINIO_ROOT_PASSWORD=minioadmin123"
ExecStart=/usr/local/bin/minio server /opt/minio/data --console-address ":9001"
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Install PiAware (optional - comment out if using existing)
echo "Installing PiAware..."
wget https://flightaware.com/adsb/piaware/files/packages/pool/piaware/p/piaware-support/piaware-support_7.2_all.deb
dpkg -i piaware-support_7.2_all.deb
apt install -y dump1090-fa
wget https://flightaware.com/adsb/piaware/files/packages/pool/piaware/p/piaware/piaware_8.2_arm64.deb
dpkg -i piaware_8.2_arm64.deb

# Clone and install Aircraft Dashboard
echo "Installing Aircraft Dashboard..."
git clone https://github.com/christopherwhull/aircraft-dashboard.git
cd aircraft-dashboard
npm install
chmod +x tools/*.py tools/*.sh

# Create environment configuration
echo "Creating configuration..."
tee /etc/default/aircraft-dashboard > /dev/null <<EOF
PIAWARE_URL=http://localhost:8080/data/aircraft.json
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
READ_BUCKET=aircraft-data
WRITE_BUCKET=aircraft-data-new
PORT=3002
EOF

# Copy service file
cp aircraft-dashboard.service /etc/systemd/system/

# Create additional service files
echo "Creating additional service files..."

# GeoTIFF Server Service
tee /etc/systemd/system/geotiff-server.service > /dev/null <<EOF
[Unit]
Description=Aircraft Dashboard GeoTIFF Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node geotiff-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryLimit=128M

[Install]
WantedBy=multi-user.target
EOF

# Tile Proxy Server Service
tee /etc/systemd/system/tile-proxy-server.service > /dev/null <<EOF
[Unit]
Description=Aircraft Dashboard Tile Proxy Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/node tile-proxy-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryLimit=64M

[Install]
WantedBy=multi-user.target
EOF

# Aircraft Tracker Service
tee /etc/systemd/system/aircraft-tracker.service > /dev/null <<EOF
[Unit]
Description=Aircraft Tracker Python Service
After=network.target minio.service piaware.service
Requires=minio.service piaware.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/aircraft-dashboard
EnvironmentFile=/etc/default/aircraft-dashboard
ExecStart=/usr/bin/python3 aircraft_tracker.py --headless
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal
MemoryLimit=64M

[Install]
WantedBy=multi-user.target
EOF

# Start services
echo "Starting services..."
systemctl daemon-reload
systemctl enable minio piaware dump1090-fa aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker
systemctl start minio piaware dump1090-fa aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker

echo "Installation complete!"
echo "Main Dashboard: http://localhost:3002"
echo "GeoTIFF Server: http://localhost:3003"
echo "Tile Proxy Server: http://localhost:3004"
echo "MinIO Console: http://localhost:9001"
echo "Check status: sudo systemctl status aircraft-dashboard geotiff-server tile-proxy-server aircraft-tracker"
```

Save as `install.sh`, make executable with `chmod +x install.sh`, and run with `sudo ./install.sh`.</content>
<parameter name="filePath">c:\Users\chris\aircraft-dashboard-new\RASPBERRY_PI_SETUP.md