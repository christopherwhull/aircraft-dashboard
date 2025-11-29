# Installation

This page provides step-by-step installation instructions for development and production on Windows, Linux, and macOS.

Prerequisites
- Node.js 14+ (18 recommended)
- npm
- Python 3.8+ (optional, for utility scripts)
- MinIO (S3) for persistence (see [MinIO Setup](MINIO.md))

Clone the repo
```bash
git clone https://github.com/christopherwhull/aircraft-dashboard.git
cd aircraft-dashboard
```

Install dependencies
```bash
npm install
# Optional Python deps
pip install -r requirements.txt  # if present or install boto3 requests
```

Start (development)
```bash
# Quick local start
npm start
```

Run the Python tracker (optional)
```bash
python aircraft_tracker.py
```

Docker quick test (all-in-one)
- Use `docker-compose.yml` from the repo or examples in [LINUX_SETUP.md]

What to check after startup
- Server logs (console) for errors
- Dashboard available at `http://localhost:3002`
- `/api/config` should respond with configuration
- MinIO console (if using Docker) at `http://localhost:9001`

Next steps
- Configure `config.js` for your environment or set environment variables (see [Configuration](Configuration.md)).

How to run (Quick Start)

Follow these steps to start the Node.js server and the Python flight tracker. Commands are shown for both Unix (Linux/macOS) and Windows (PowerShell).

1) Start the Node.js server (dashboard)

Linux / macOS (bash):
```bash
# From the project root
npm install         # if you haven't installed dependencies yet
npm start           # starts server.js (default port 3002)
# or run the convenient restart script
npm run restart:unix
```

Windows (PowerShell):
```powershell
# From the project root
npm install
npm start
# or use the Windows restart helper
npm run restart:windows
```

2) Start the Python flight tracker (optional)

The flight tracker collects PiAware/minute files and uploads to MinIO. Run it in a separate terminal.

Linux / macOS (bash):
```bash
# Optional: create and activate a virtualenv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt  # if you have requirements, otherwise install boto3 requests
python aircraft_tracker.py
```

Windows (PowerShell):
```powershell
# Optional: create and activate a virtualenv
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python aircraft_tracker.py
```

3) Open the dashboard UI

Open your browser and go to:

```text
http://localhost:3002/
```

To verify the server is healthy and configuration is loaded:

```bash
# Check UI config endpoint
curl http://localhost:3002/api/config
```

Notes
- If you run the Node server or tracker on a remote host, replace `localhost` with the host IP.
- Use `npm run restart:unix` / `npm run restart:windows` scripts for convenient restarts during development.
- For production use, deploy the Node server with the provided `aircraft-dashboard.service` (Linux) or a managed Windows task.