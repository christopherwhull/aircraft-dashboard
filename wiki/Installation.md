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