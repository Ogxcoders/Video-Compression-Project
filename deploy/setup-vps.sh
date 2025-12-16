#!/bin/bash

# ============================================
# VPS Video Compression API - Setup Script
# ============================================
# This script sets up the video compression API on a fresh VPS
# 
# Requirements:
#   - Ubuntu 20.04+ / Debian 11+
#   - Root or sudo access
#
# Usage:
#   chmod +x setup-vps.sh
#   sudo ./setup-vps.sh
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
APP_DIR="/var/www/vps-api"
APP_USER="www-data"
NODE_VERSION="20"

log_info "Starting VPS Video Compression API setup..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root or with sudo"
    exit 1
fi

# Update system
log_info "Updating system packages..."
apt-get update -y
apt-get upgrade -y

# Install dependencies
log_info "Installing system dependencies..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    ffmpeg \
    redis-server \
    nginx \
    certbot \
    python3-certbot-nginx

# Install Node.js
log_info "Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

# Verify Node.js installation
log_info "Node.js version: $(node --version)"
log_info "NPM version: $(npm --version)"

# Install PM2 globally
log_info "Installing PM2..."
npm install -g pm2

# Create app directory
log_info "Setting up application directory..."
mkdir -p ${APP_DIR}
mkdir -p ${APP_DIR}/logs
mkdir -p /var/log/vps-api
mkdir -p /media/uploads
mkdir -p /media/content

# Set permissions
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}
chown -R ${APP_USER}:${APP_USER} /var/log/vps-api
chown -R ${APP_USER}:${APP_USER} /media/uploads
chown -R ${APP_USER}:${APP_USER} /media/content

# Configure Redis
log_info "Configuring Redis..."
cat > /etc/redis/redis.conf << 'EOF'
bind 127.0.0.1
port 6379
daemonize no
supervised systemd
pidfile /var/run/redis/redis-server.pid
loglevel notice
logfile /var/log/redis/redis-server.log
databases 16
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis
maxmemory 512mb
maxmemory-policy noeviction
appendonly yes
appendfilename "appendonly.aof"
EOF

# Enable and start Redis
systemctl enable redis-server
systemctl restart redis-server

# Wait for Redis to be ready
log_info "Waiting for Redis to start..."
sleep 2
redis-cli ping

log_info "============================================"
log_info "Base system setup complete!"
log_info "============================================"
log_info ""
log_info "Next steps:"
log_info "1. Copy your application files to ${APP_DIR}"
log_info "2. Create .env file with your configuration"
log_info "3. Run: cd ${APP_DIR} && npm install --production"
log_info "4. Run: npm run build"
log_info "5. Run: pm2 start ecosystem.config.js"
log_info "6. Run: pm2 save"
log_info "7. Run: pm2 startup (and follow instructions)"
log_info ""
log_info "To check status: pm2 status"
log_info "To view logs: pm2 logs"
log_info "============================================"
