/**
 * PM2 Ecosystem Configuration
 * Manages both Next.js API server and background compression worker
 * 
 * Deployment Types:
 *   - VPS (Direct): Uses __dirname for paths, works with local file structure
 *   - Docker: Uses /app paths for containerized deployment
 * 
 * Usage (VPS):
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only vps-api
 *   pm2 start ecosystem.config.js --only vps-worker
 *   pm2 save                        # Save process list for auto-restart
 *   pm2 startup                     # Enable PM2 startup on boot
 *   pm2 logs
 *   pm2 monit
 * 
 * Usage (Docker):
 *   pm2-runtime ecosystem.config.js
 */

const path = require('path');

const isDocker = process.env.DOCKER === 'true' || process.env.RUNNING_IN_DOCKER === 'true';
const APP_DIR = isDocker ? '/app' : __dirname;
const LOG_DIR = isDocker ? '/app/logs' : path.join(__dirname, 'logs');

module.exports = {
  apps: [
    {
      name: "vps-api",
      script: isDocker ? "server.js" : ".next/standalone/server.js",
      cwd: APP_DIR,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        HOSTNAME: "0.0.0.0"
      },
      env_production: {
        NODE_ENV: "production"
      },
      error_file: path.join(LOG_DIR, 'api-error.log'),
      out_file: path.join(LOG_DIR, 'api-out.log'),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true
    },
    {
      name: "vps-worker",
      script: "dist/workers/compression-worker.js",
      cwd: APP_DIR,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      kill_timeout: 30000,
      wait_ready: false,
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      },
      error_file: path.join(LOG_DIR, 'worker-error.log'),
      out_file: path.join(LOG_DIR, 'worker-out.log'),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true
    }
  ]
};
