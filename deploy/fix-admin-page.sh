#!/bin/bash

# ============================================
# Fix Admin Page - Quick Rebuild Script
# ============================================
# Use this when the /admin page shows a blank screen
# caused by stale JavaScript chunks (404 errors)
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

APP_DIR="${1:-/var/www/vps-api}"

log_info "============================================"
log_info "Fixing Admin Page - Rebuilding Static Files"
log_info "============================================"

# Check if directory exists
if [ ! -d "${APP_DIR}" ]; then
    log_error "App directory not found: ${APP_DIR}"
    exit 1
fi

cd "${APP_DIR}"

# Stop services
log_info "Stopping PM2 services..."
pm2 stop all 2>/dev/null || true

# Clean old build
log_info "Cleaning old build files..."
rm -rf .next

# Reinstall dependencies (in case of issues)
log_info "Checking dependencies..."
npm ci --production=false

# Build fresh
log_info "Building Next.js application..."
npm run build

# Verify build exists
if [ ! -d ".next/standalone" ]; then
    log_error "Build failed! .next/standalone not found"
    exit 1
fi

# CRITICAL: Copy static files to standalone directory
log_info "Copying static files to standalone server..."
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# Verify static files were copied
if [ ! -d ".next/standalone/.next/static" ]; then
    log_error "Static files not copied correctly!"
    exit 1
fi

log_info "Static files copied successfully!"

# Count chunk files
CHUNK_COUNT=$(find .next/standalone/.next/static/chunks -name "*.js" | wc -l)
log_info "Found ${CHUNK_COUNT} JavaScript chunk files"

# Restart PM2
log_info "Restarting PM2 services..."
pm2 restart all

# Wait for startup
sleep 3

# Show status
log_info "============================================"
log_info "Fix Complete!"
log_info "============================================"
pm2 status

log_info ""
log_info "Test the admin page:"
log_info "  curl -I https://v.ogtemplate.com/admin"
log_info ""
log_info "If still broken, try clearing browser cache:"
log_info "  - Press Ctrl+Shift+R (Windows/Linux)"
log_info "  - Press Cmd+Shift+R (Mac)"
log_info "============================================"
