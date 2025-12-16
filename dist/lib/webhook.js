"use strict";
/**
 * Webhook Module for WordPress Integration
 * Sends progress updates and completion status to WordPress
 * Converted from PHP worker.php webhook functionality
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROGRESS_STAGES = void 0;
exports.sendWebhook = sendWebhook;
exports.sendProgressUpdate = sendProgressUpdate;
exports.sendCompletionWebhook = sendCompletionWebhook;
exports.sendFailureWebhook = sendFailureWebhook;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const config_1 = require("./config");
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('WEBHOOK');
const WEBHOOK_MAX_RETRIES = 3;
const WEBHOOK_RETRY_DELAY = 2000;
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function sendWebhookOnce(payload, url, cfg) {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new url_1.URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const httpModule = isHttps ? https_1.default : http_1.default;
            const postData = JSON.stringify(payload);
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'VideoCompressor-Webhook/1.0',
                    'X-API-Key': cfg.api_key
                },
                timeout: 30000,
                rejectUnauthorized: cfg.verify_ssl_downloads
            };
            const req = httpModule.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    const statusCode = res.statusCode || 0;
                    if (statusCode >= 200 && statusCode < 300) {
                        logger.info('Webhook sent successfully', {
                            jobId: payload.jobId,
                            statusCode
                        });
                        resolve({ success: true, statusCode });
                    }
                    else {
                        logger.warning('Webhook returned non-success status', {
                            jobId: payload.jobId,
                            statusCode,
                            response: responseData.substring(0, 200)
                        });
                        resolve({
                            success: false,
                            statusCode,
                            error: `HTTP ${statusCode}: ${responseData.substring(0, 100)}`
                        });
                    }
                });
            });
            req.on('error', (err) => {
                logger.error('Webhook request failed', {
                    jobId: payload.jobId,
                    error: err.message
                });
                resolve({ success: false, error: err.message });
            });
            req.on('timeout', () => {
                req.destroy();
                logger.error('Webhook request timed out', { jobId: payload.jobId });
                resolve({ success: false, error: 'Request timeout' });
            });
            req.write(postData);
            req.end();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Webhook send error', {
                jobId: payload.jobId,
                error: errorMessage
            });
            resolve({ success: false, error: errorMessage });
        }
    });
}
async function sendWebhook(payload, webhookUrl) {
    const cfg = (0, config_1.config)();
    const url = webhookUrl || cfg.wordpress_webhook_url;
    if (!url) {
        logger.debug('No webhook URL configured, skipping');
        return { success: true };
    }
    logger.info('Sending webhook', {
        jobId: payload.jobId,
        status: payload.status,
        progress: payload.progress
    });
    let lastError;
    for (let attempt = 1; attempt <= WEBHOOK_MAX_RETRIES; attempt++) {
        const result = await sendWebhookOnce(payload, url, cfg);
        if (result.success) {
            return result;
        }
        lastError = result.error;
        if (attempt < WEBHOOK_MAX_RETRIES) {
            const delayMs = WEBHOOK_RETRY_DELAY * attempt;
            logger.warning(`Webhook attempt ${attempt} failed, retrying in ${delayMs}ms`, {
                jobId: payload.jobId,
                error: result.error,
                attempt,
                maxRetries: WEBHOOK_MAX_RETRIES,
                nextRetryDelay: delayMs
            });
            await sleep(delayMs);
        }
    }
    logger.error('Webhook failed after all retries', {
        jobId: payload.jobId,
        error: lastError,
        attempts: WEBHOOK_MAX_RETRIES
    });
    return { success: false, error: `Failed after ${WEBHOOK_MAX_RETRIES} attempts: ${lastError}` };
}
async function sendProgressUpdate(jobId, postId, status, progress, stage) {
    const payload = {
        jobId,
        postId,
        status,
        progress,
        stage,
        timestamp: new Date().toISOString()
    };
    return sendWebhook(payload);
}
async function sendCompletionWebhook(jobId, postId, result) {
    const payload = {
        jobId,
        postId,
        status: result.success ? 'completed' : 'failed',
        progress: 100,
        stage: 'complete',
        result,
        timestamp: new Date().toISOString()
    };
    if (result.success && result.urls) {
        payload.compressed480pUrl = result.urls.compressed_480p;
        payload.compressed360pUrl = result.urls.compressed_360p;
        payload.compressed240pUrl = result.urls.compressed_240p;
        payload.compressed144pUrl = result.urls.compressed_144p;
        payload.compressedThumbnailWebp = result.urls.thumbnail_webp || result.thumbnailUrl;
    }
    if (result.success && result.hlsUrls) {
        payload.hlsMasterUrl = result.hlsUrls.master;
        payload.hls_480p = result.hlsUrls['480p'];
        payload.hls_360p = result.hlsUrls['360p'];
        payload.hls_240p = result.hlsUrls['240p'];
        payload.hls_144p = result.hlsUrls['144p'];
    }
    if (result.success && result.stats) {
        payload.original_size = result.stats.original_size;
        payload.compressed_size = result.stats.compressed_size;
        payload.compression_ratio = result.stats.compression_ratio;
        payload.duration = result.stats.duration;
        payload.processing_time = result.stats.processing_time;
    }
    if (result.success && result.thumbnailStats) {
        payload.thumbnail_stats = result.thumbnailStats;
    }
    logger.info('Sending completion webhook', {
        jobId,
        postId,
        hasUrls: !!result.urls,
        hasHlsUrls: !!result.hlsUrls,
        hlsMasterUrl: payload.hlsMasterUrl,
        compressed480p: payload.compressed480pUrl
    });
    return sendWebhook(payload);
}
async function sendFailureWebhook(jobId, postId, error) {
    const payload = {
        jobId,
        postId,
        status: 'failed',
        progress: 0,
        stage: 'error',
        error,
        timestamp: new Date().toISOString()
    };
    return sendWebhook(payload);
}
exports.PROGRESS_STAGES = {
    QUEUED: { percent: 0, stage: 'queued' },
    DOWNLOADING: { percent: 0, stage: 'downloading' },
    VALIDATING: { percent: 25, stage: 'validating' },
    COMPRESSING_START: { percent: 25, stage: 'compressing' },
    COMPRESSING_480P: { percent: 25, stage: 'compressing_480p' },
    COMPRESSING_360P: { percent: 50, stage: 'compressing_360p' },
    COMPRESSING_240P: { percent: 50, stage: 'compressing_240p' },
    COMPRESSING_144P: { percent: 75, stage: 'compressing_144p' },
    HLS_CONVERSION: { percent: 75, stage: 'hls_conversion' },
    FINALIZING: { percent: 75, stage: 'finalizing' },
    COMPLETE: { percent: 100, stage: 'complete' }
};
exports.default = {
    sendWebhook,
    sendProgressUpdate,
    sendCompletionWebhook,
    sendFailureWebhook,
    PROGRESS_STAGES: exports.PROGRESS_STAGES
};
