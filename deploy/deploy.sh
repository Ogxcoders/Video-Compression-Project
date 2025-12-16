#!/bin/bash

# ============================================
# VPS Video Compression API - Deployment Script
# ============================================
# Run this script to deploy/update the application
# 
# Usage:
#   ./deploy.sh              # Deploy to default /var/www/vps-api
#   ./deploy.sh /custom/path # Deploy to custom path
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
APP_DIR="${1:-/var/www/vps-api}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log_info "============================================"
log_info "Deploying VPS Video Compression API"
log_info "============================================"
log_info "Project dir: ${PROJECT_DIR}"
log_info "Target dir: ${APP_DIR}"
log_info ""

# Check if we're in the right directory
if [ ! -f "${PROJECT_DIR}/package.json" ]; then
    log_error "package.json not found. Run this script from the project directory."
    exit 1
fi

# Check if target directory exists
if [ ! -d "${APP_DIR}" ]; then
    log_warn "Creating target directory ${APP_DIR}..."
    sudo mkdir -p ${APP_DIR}
    sudo chown -R $(whoami):$(whoami) ${APP_DIR}
fi

# Stop existing PM2 processes
log_info "Stopping existing services..."
pm2 stop all 2>/dev/null || true

# Copy files to target directory
log_info "Copying application files..."
rsync -av --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='logs/*' \
    "${PROJECT_DIR}/" "${APP_DIR}/"

# Navigate to app directory
cd "${APP_DIR}"

# Install dependencies
log_info "Installing production dependencies..."
npm ci --production=false

# Build the application
log_info "Building Next.js application..."
npm run build

# Verify build
if [ ! -f "dist/workers/compression-worker.js" ]; then
    log_error "Worker build failed! dist/workers/compression-worker.js not found"
    exit 1
fi

if [ ! -d ".next/standalone" ]; then
    log_error "Next.js build failed! .next/standalone not found"
    exit 1
fi

log_info "Build successful!"

# Copy static files for standalone server
log_info "Copying static files for standalone server..."
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# Create logs directory
mkdir -p logs

# Start PM2
log_info "Starting PM2 services..."
pm2 start ecosystem.config.js --env production

# Save PM2 process list
log_info "Saving PM2 process list..."
pm2 save

# Show status
log_info "============================================"
log_info "Deployment complete!"
log_info "============================================"
pm2 status

log_info ""
log_info "Useful commands:"
log_info "  pm2 logs          - View logs"
log_info "  pm2 monit         - Monitor processes"
log_info "  pm2 restart all   - Restart all services"
log_info ""
log_info "To enable auto-start on boot:"
log_info "  pm2 startup"
log_info "  (Follow the command it outputs)"
log_info "============================================"
