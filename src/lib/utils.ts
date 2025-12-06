/**
 * Utility Functions for Video Processing API
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { config } from './config';
import { createLogger } from './logger';

const logger = createLogger('UTILS');

export function formatBytes(bytes: number, precision: number = 2): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  } else if (mins > 0) {
    return `${mins}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function generateJobId(postId: number): string {
  const timestamp = Date.now();
  return `job_${postId}_${timestamp}`;
}

export function validateApiKey(request: NextRequest): boolean {
  const cfg = config();
  const providedKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
  
  if (!providedKey) {
    return false;
  }

  if (!cfg.api_key || cfg.api_key === 'CHANGE_ME_TO_A_SECURE_RANDOM_KEY') {
    logger.warning('API key not configured on server');
    return false;
  }

  return providedKey === cfg.api_key;
}

export function getCorsHeaders(origin?: string): Record<string, string> {
  const cfg = config();
  const allowedOrigins = cfg.allowed_origins;

  let allowOrigin = '*';
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    allowOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Range, Accept-Ranges',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Access-Control-Max-Age': '86400'
  };
}

export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  return 'unknown';
}

export function sanitizePath(path: string): string {
  let sanitized = decodeURIComponent(decodeURIComponent(path));
  
  sanitized = sanitized.replace(/\x00/g, '');
  sanitized = sanitized.replace(/\\/g, '/');
  
  while (sanitized.includes('../') || sanitized.includes('..\\')) {
    sanitized = sanitized.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  }

  if (/(\.\.)|(\.\.)|(%2e%2e)|(%252e)/i.test(sanitized)) {
    throw new Error('Path contains forbidden sequences');
  }

  return sanitized;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function extractYearMonth(path: string): { year: number; month: number } | null {
  const match = path.match(/\/(\d{4})\/(\d{1,2})\//);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  backoff: number = 2
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fn();
        resolve(result);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries - 1) {
          const waitTime = delay * Math.pow(backoff, attempt);
          await sleep(waitTime);
        }
      }
    }
    
    reject(lastError);
  });
}

export function parseJsonSafe<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

export function ensureDirectoryExists(dirPath: string): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
      logger.info('Created directory', { path: dirPath });
    }
    
    try {
      fs.accessSync(dirPath, fs.constants.W_OK);
    } catch {
      return { 
        success: false, 
        error: `Directory exists but is not writable: ${dirPath}. Check permissions.` 
      };
    }
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('EACCES')) {
      logger.error('Permission denied creating directory', { 
        path: dirPath, 
        error: errorMessage,
        suggestion: 'Check that the container has write permissions to this path. You may need to set MEDIA_CONTENT_DIR and MEDIA_UPLOADS_DIR to writable paths like /app/public/media/content'
      });
      return { 
        success: false, 
        error: `Permission denied: Cannot create directory '${dirPath}'. Set MEDIA_CONTENT_DIR to a writable path (e.g., /app/public/media/content)` 
      };
    }
    
    logger.error('Failed to create directory', { path: dirPath, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

export function initializeMediaDirectories(): { success: boolean; errors: string[] } {
  const cfg = config();
  const errors: string[] = [];
  
  const dirs = [
    cfg.media_uploads_dir,
    cfg.media_content_dir,
    path.dirname(cfg.log_file)
  ];
  
  for (const dir of dirs) {
    const result = ensureDirectoryExists(dir);
    if (!result.success && result.error) {
      errors.push(result.error);
    }
  }
  
  if (errors.length > 0) {
    logger.error('Failed to initialize some media directories', { errors });
  } else {
    logger.info('Media directories initialized', { 
      uploads: cfg.media_uploads_dir,
      content: cfg.media_content_dir,
      logs: path.dirname(cfg.log_file)
    });
  }
  
  return { success: errors.length === 0, errors };
}

export default {
  formatBytes,
  formatDuration,
  generateJobId,
  validateApiKey,
  getCorsHeaders,
  getClientIP,
  sanitizePath,
  isValidUrl,
  extractYearMonth,
  sleep,
  retry,
  parseJsonSafe,
  truncateString,
  ensureDirectoryExists,
  initializeMediaDirectories
};
