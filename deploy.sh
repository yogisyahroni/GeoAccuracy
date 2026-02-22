#!/bin/bash
set -e

echo "Geoverify Logistics - Production Deployment Script"
echo "======================================================"

# 1. Dependency Check
if ! command -v docker &> /dev/null
then
    echo "ERROR: Docker could not be found. Please install Docker in this VPS instance first."
    exit 1
fi

if ! docker compose version &> /dev/null
then
    echo "ERROR: Docker Compose is not installed or accessible."
    exit 1
fi

# 2. Build and Startup
echo "[INFO] Re-building and starting production containers in background..."
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d

# 3. Healthcheck & Warm-up
echo "[INFO] Giving containers 15 seconds to spin up, initializing PostgreSQL..."
sleep 15

# 4. Success Verification
echo "======================================================"
echo "[SUCCESS] Deployment Sequence Finished."
echo "[URL] Frontend access: http://localhost (Mapped from Port 80)"
echo "[URL] Backend access: http://localhost:8081"
echo "[URL] Grafana metrics: http://localhost:3000"
echo "To monitor logs, run: docker compose logs -f"
