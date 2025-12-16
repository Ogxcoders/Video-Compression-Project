/**
 * Worker Entry Point
 * Runs the background compression worker
 * 
 * Production: Uses compiled JavaScript from dist/
 * Development: Uses ts-node with TypeScript source
 * 
 * Usage: 
 *   Production: node worker.js
 *   Development: npm run worker:dev
 */

const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const workerPath = path.join(__dirname, 'dist', 'workers', 'compression-worker.js');
  console.log(`[Worker] Starting production worker from: ${workerPath}`);
  require(workerPath);
} else {
  console.log('[Worker] Starting development worker with ts-node...');
  require('ts-node/register');
  require('tsconfig-paths/register');
  require('./src/workers/compression-worker.ts');
}
