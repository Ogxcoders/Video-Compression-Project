#!/bin/bash
# Force Complete Rebuild Script
# This script ensures a 100% clean rebuild with no cached files

set -e

echo "=========================================="
echo "  VPS Force Rebuild Script"
echo "=========================================="
echo ""

# Step 1: Stop all containers
echo "[1/6] Stopping all containers..."
docker-compose down -v 2>/dev/null || true
echo "Done"

# Step 2: Remove all related images
echo ""
echo "[2/6] Removing old images..."
docker images | grep -E 'vps-api|vps-worker|nextjs-vps' | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
echo "Done"

# Step 3: Clear Docker build cache
echo ""
echo "[3/6] Clearing Docker build cache..."
docker builder prune -f 2>/dev/null || true
echo "Done"

# Step 4: Pull latest code
echo ""
echo "[4/6] Pulling latest code..."
git fetch origin main
git reset --hard origin/main
echo "Done"

# Step 5: Rebuild with no cache
echo ""
echo "[5/6] Building with no cache (this may take a few minutes)..."
docker-compose build --no-cache --pull
echo "Done"

# Step 6: Start containers
echo ""
echo "[6/6] Starting containers..."
docker-compose up -d
echo "Done"

# Wait for startup
echo ""
echo "Waiting 30 seconds for startup..."
sleep 30

# Verify
echo ""
echo "Checking deployment..."
curl -s http://localhost:5000/api/build-info | python3 -m json.tool 2>/dev/null || curl -s http://localhost:5000/api/build-info
echo ""

echo "=========================================="
echo "  Rebuild Complete!"
echo "=========================================="
echo ""
echo "If you still see 404 errors for CSS/JS, check:"
echo "1. Cloudflare cache - purge everything"
echo "2. Browser cache - hard refresh (Ctrl+Shift+R)"
echo "3. Run: ./deploy/verify-deployment.sh"
