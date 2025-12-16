"use strict";
/**
 * Configuration Module for Video Processing API
 * Converted from PHP config.php
 *
 * Supports environment variable configuration with sensible defaults
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
exports.validateConfig = validateConfig;
exports.config = config;
exports.reloadConfig = reloadConfig;
const path_1 = __importDefault(require("path"));
function getEnv(key, defaultValue = '') {
    return process.env[key] || defaultValue;
}
function getEnvNumber(key, defaultValue) {
    const value = process.env[key];
    if (value) {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
}
function getEnvBoolean(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined)
        return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
}
function getEnvArray(key, defaultValue) {
    const value = process.env[key];
    if (!value)
        return defaultValue;
    return value.split(',').map(s => s.trim()).filter(s => s);
}
const baseDir = process.env.APP_DIR || process.cwd();
function getMediaDir(envKey, defaultSubPath) {
    const envValue = process.env[envKey];
    if (envValue) {
        return envValue;
    }
    if (process.env.NODE_ENV === 'production') {
        return path_1.default.join('/app', 'public', 'media', defaultSubPath);
    }
    return path_1.default.join(baseDir, 'public', 'media', defaultSubPath);
}
function getConfig() {
    const replitDomain = getEnv('REPLIT_DOMAINS', getEnv('REPLIT_DEV_DOMAIN', 'localhost:5000'));
    const domain = replitDomain.includes(',') ? replitDomain.split(',')[0] : replitDomain;
    return {
        api_key: getEnv('API_KEY', 'CHANGE_ME_TO_A_SECURE_RANDOM_KEY'),
        allowed_origins: getEnvArray('ALLOWED_ORIGINS', ['*']),
        base_url: getEnv('BASE_URL', `https://${domain}`),
        ffmpeg_binary: getEnv('FFMPEG_PATH', 'ffmpeg'),
        ffmpeg_timeout: getEnvNumber('FFMPEG_TIMEOUT', 600),
        media_uploads_dir: getMediaDir('MEDIA_UPLOADS_DIR', 'uploads'),
        media_content_dir: getMediaDir('MEDIA_CONTENT_DIR', 'content'),
        log_file: getEnv('LOG_FILE', path_1.default.join(baseDir, 'logs', 'all.log')),
        debug: getEnvBoolean('DEBUG', true),
        hls_time: getEnvNumber('HLS_TIME', 2),
        cleanup_original: getEnvBoolean('CLEANUP_ORIGINAL', true),
        max_video_age_days: getEnvNumber('MAX_VIDEO_AGE_DAYS', 30),
        parallel_compression: getEnvBoolean('PARALLEL_COMPRESSION', false),
        parallel_limit: getEnvNumber('PARALLEL_LIMIT', 1),
        thumbnail_quality: getEnvNumber('THUMBNAIL_QUALITY', 75),
        thumbnail_max_width: getEnvNumber('THUMBNAIL_MAX_WIDTH', 320),
        thumbnail_max_height: getEnvNumber('THUMBNAIL_MAX_HEIGHT', 320),
        wordpress_webhook_url: getEnv('WORDPRESS_WEBHOOK_URL', ''),
        allowed_download_domains: getEnvArray('ALLOWED_DOWNLOAD_DOMAINS', ['*']),
        verify_ssl_downloads: getEnvBoolean('VERIFY_SSL_DOWNLOADS', true),
        redis: {
            host: getEnv('REDIS_HOST', '127.0.0.1'),
            port: getEnvNumber('REDIS_PORT', 6379),
            password: getEnv('REDIS_PASSWORD') || undefined,
            database: getEnvNumber('REDIS_DATABASE', 0)
        },
        admin_password: getEnv('ADMIN_PASSWORD', 'admin123'),
        resolutions: {
            '144p': {
                scale: '-2:144',
                bitrate: '150k',
                maxrate: '225k',
                bufsize: '450k'
            },
            '240p': {
                scale: '-2:240',
                bitrate: '300k',
                maxrate: '450k',
                bufsize: '900k'
            },
            '360p': {
                scale: '-2:360',
                bitrate: '500k',
                maxrate: '750k',
                bufsize: '1500k'
            },
            '480p': {
                scale: '-2:480',
                bitrate: '800k',
                maxrate: '1200k',
                bufsize: '2400k'
            }
        }
    };
}
function validateConfig(config) {
    const warnings = [];
    if (!config.api_key || config.api_key === 'CHANGE_ME_TO_A_SECURE_RANDOM_KEY') {
        warnings.push('API_KEY is not set or using default insecure value');
    }
    if (!process.env.BASE_URL) {
        warnings.push('BASE_URL environment variable is not set. Using auto-detected domain.');
    }
    return {
        valid: warnings.length === 0,
        warnings
    };
}
let cachedConfig = null;
function config() {
    if (!cachedConfig) {
        cachedConfig = getConfig();
    }
    return cachedConfig;
}
function reloadConfig() {
    cachedConfig = getConfig();
    return cachedConfig;
}
exports.default = config;
