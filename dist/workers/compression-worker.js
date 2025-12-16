"use strict";
/**
 * Video Compression Worker
 * Processes video compression jobs from the BullMQ queue
 * Features resilient Redis connection with automatic restart on failures
 * Converted from PHP worker.php - Migrated from Bull to BullMQ
 *
 * Run with: npx ts-node src/workers/compression-worker.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = startWorker;
exports.processJob = processJob;
const bullmq_1 = require("bullmq");
const config_1 = require("../lib/config");
const logger_1 = require("../lib/logger");
const queue_1 = require("../lib/queue");
const video_compressor_1 = require("../lib/video-compressor");
const hls_converter_1 = require("../lib/hls-converter");
const image_compressor_1 = require("../lib/image-compressor");
const webhook_1 = require("../lib/webhook");
const ffmpeg_1 = require("../lib/ffmpeg");
const utils_1 = require("../lib/utils");
const logger = (0, logger_1.createLogger)('WORKER');
const WORKER_RESTART_DELAY_BASE = 5000;
const WORKER_RESTART_DELAY_MAX = 60000;
const WORKER_MAX_RESTART_ATTEMPTS = 0;
let isShuttingDown = false;
let isRestartScheduled = false;
let isRestarting = false;
let worker = null;
let restartAttempts = 0;
let restartTimeoutId = null;
async function processJob(job) {
    const { jobId, postId, year, month, wpThumbnailUrl, wpThumbnailPath } = job.data;
    logger.info('Processing job', { jobId, postId });
    try {
        await (0, queue_1.updateJobProgress)(jobId, webhook_1.PROGRESS_STAGES.QUEUED.percent);
        await (0, webhook_1.sendProgressUpdate)(jobId, postId, 'processing', webhook_1.PROGRESS_STAGES.QUEUED.percent, webhook_1.PROGRESS_STAGES.QUEUED.stage);
        const progressCallback = async (percent, stage) => {
            await (0, queue_1.updateJobProgress)(jobId, percent);
            await (0, webhook_1.sendProgressUpdate)(jobId, postId, 'processing', percent, stage);
        };
        const compressionResult = await (0, video_compressor_1.compressVideoJob)(job.data, progressCallback);
        if (!compressionResult.success) {
            logger.error('Compression failed', {
                jobId,
                postId,
                error: compressionResult.error
            });
            await (0, webhook_1.sendFailureWebhook)(jobId, postId, compressionResult.error || 'Compression failed');
            return compressionResult;
        }
        if (compressionResult.paths) {
            logger.info('Starting HLS conversion', { jobId, postId });
            await (0, queue_1.updateJobProgress)(jobId, webhook_1.PROGRESS_STAGES.HLS_CONVERSION.percent);
            await (0, webhook_1.sendProgressUpdate)(jobId, postId, 'processing', webhook_1.PROGRESS_STAGES.HLS_CONVERSION.percent, webhook_1.PROGRESS_STAGES.HLS_CONVERSION.stage);
            const hlsResult = await (0, hls_converter_1.convertToHLSStreaming)(compressionResult.paths, postId, year, month);
            if (hlsResult.success && hlsResult.hls_urls) {
                compressionResult.hlsUrls = hlsResult.hls_urls;
            }
            else {
                logger.warning('HLS conversion failed, continuing without HLS', {
                    jobId,
                    error: hlsResult.error
                });
            }
        }
        if (wpThumbnailUrl) {
            logger.info('Starting thumbnail compression', { jobId, postId, thumbnailUrl: wpThumbnailUrl });
            await (0, queue_1.updateJobProgress)(jobId, 80);
            await (0, webhook_1.sendProgressUpdate)(jobId, postId, 'processing', 80, 'thumbnail_compression');
            const thumbnailResult = await (0, image_compressor_1.compressThumbnail)(postId, year, month, wpThumbnailUrl, wpThumbnailPath);
            if (thumbnailResult.success && thumbnailResult.publicUrl) {
                compressionResult.thumbnailUrl = thumbnailResult.publicUrl;
                compressionResult.thumbnailStats = {
                    originalSize: thumbnailResult.originalSize || 0,
                    compressedSize: thumbnailResult.compressedSize || 0,
                    compressionRatio: thumbnailResult.compressionRatio || 0
                };
                if (!compressionResult.urls) {
                    compressionResult.urls = {};
                }
                compressionResult.urls.thumbnail_webp = thumbnailResult.publicUrl;
                logger.info('Thumbnail compression completed', {
                    jobId,
                    postId,
                    url: thumbnailResult.publicUrl,
                    compressionRatio: `${thumbnailResult.compressionRatio}%`
                });
            }
            else {
                logger.warning('Thumbnail compression failed, continuing without thumbnail', {
                    jobId,
                    error: thumbnailResult.error
                });
            }
        }
        await (0, queue_1.updateJobProgress)(jobId, webhook_1.PROGRESS_STAGES.COMPLETE.percent);
        await (0, webhook_1.sendProgressUpdate)(jobId, postId, 'completed', webhook_1.PROGRESS_STAGES.COMPLETE.percent, webhook_1.PROGRESS_STAGES.COMPLETE.stage);
        await (0, webhook_1.sendCompletionWebhook)(jobId, postId, compressionResult);
        logger.info('Job completed successfully', { jobId, postId });
        return compressionResult;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Job processing error', { jobId, postId, error: errorMessage });
        await (0, webhook_1.sendFailureWebhook)(jobId, postId, errorMessage);
        return {
            success: false,
            error: errorMessage,
            jobId,
            postId
        };
    }
}
async function startWorker() {
    logger.info('Starting compression worker...');
    const cfg = (0, config_1.config)();
    logger.info('Configuration loaded', {
        mediaUploadsDir: cfg.media_uploads_dir,
        mediaContentDir: cfg.media_content_dir,
        redisHost: cfg.redis.host,
        redisPort: cfg.redis.port
    });
    const dirResult = (0, utils_1.initializeMediaDirectories)();
    if (!dirResult.success) {
        logger.error('Failed to initialize media directories', { errors: dirResult.errors });
        console.error('CRITICAL: Cannot start worker - media directories are not writable.');
        console.error('Errors:', dirResult.errors.join('\n'));
        console.error('Please check your MEDIA_UPLOADS_DIR and MEDIA_CONTENT_DIR environment variables.');
        process.exit(1);
    }
    await (0, ffmpeg_1.initializeFfmpeg)();
    const connection = {
        host: cfg.redis.host,
        port: cfg.redis.port,
        password: cfg.redis.password || undefined,
        db: cfg.redis.database
    };
    worker = new bullmq_1.Worker('compression_queue', async (job) => {
        if (isShuttingDown) {
            throw new Error('Worker is shutting down');
        }
        return processJob(job);
    }, {
        connection,
        concurrency: cfg.parallel_limit || 1,
        limiter: {
            max: cfg.parallel_limit || 1,
            duration: 1000
        }
    });
    worker.on('completed', (job, result) => {
        logger.info('Job marked completed in queue', {
            jobId: job.id,
            success: result?.success
        });
    });
    worker.on('failed', (job, err) => {
        logger.error('Job marked failed in queue', {
            jobId: job?.id,
            error: err?.message,
            attempts: job?.attemptsMade
        });
    });
    worker.on('error', (error) => {
        logger.error('Worker error', { error: error.message });
        if (!isShuttingDown && error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ECONNRESET')) {
            logger.warning('Redis connection issue detected, scheduling worker restart...');
            scheduleWorkerRestart();
        }
    });
    worker.on('stalled', (jobId) => {
        logger.warning('Job stalled', { jobId });
    });
    worker.on('ioredis:close', () => {
        logger.warning('Worker Redis connection closed');
        if (!isShuttingDown) {
            scheduleWorkerRestart();
        }
    });
    restartAttempts = 0;
    logger.info('Worker started', {
        concurrency: cfg.parallel_limit || 1,
        parallelCompression: cfg.parallel_compression
    });
    console.log('Worker is running. Press Ctrl+C to stop.');
}
function calculateRestartDelay() {
    const delay = Math.min(WORKER_RESTART_DELAY_BASE * Math.pow(2, Math.min(restartAttempts, 4)), WORKER_RESTART_DELAY_MAX);
    return delay;
}
async function scheduleWorkerRestart() {
    if (isShuttingDown) {
        logger.info('Shutdown in progress, skipping worker restart');
        return;
    }
    if (isRestartScheduled || isRestarting) {
        logger.debug('Restart already scheduled or in progress, skipping duplicate request');
        return;
    }
    if (WORKER_MAX_RESTART_ATTEMPTS > 0 && restartAttempts >= WORKER_MAX_RESTART_ATTEMPTS) {
        logger.error('Max restart attempts reached, exiting', { attempts: restartAttempts });
        process.exit(1);
    }
    isRestartScheduled = true;
    restartAttempts++;
    const delay = calculateRestartDelay();
    logger.info(`Scheduling worker restart in ${delay}ms`, {
        attempt: restartAttempts,
        maxAttempts: WORKER_MAX_RESTART_ATTEMPTS || 'unlimited'
    });
    if (worker) {
        try {
            await worker.close();
            worker = null;
        }
        catch (err) {
            logger.warning('Error closing worker before restart', {
                error: err instanceof Error ? err.message : String(err)
            });
        }
    }
    if (restartTimeoutId) {
        clearTimeout(restartTimeoutId);
    }
    restartTimeoutId = setTimeout(async () => {
        restartTimeoutId = null;
        if (isShuttingDown) {
            isRestartScheduled = false;
            return;
        }
        isRestarting = true;
        logger.info('Attempting worker restart...');
        try {
            await startWorker();
            isRestartScheduled = false;
            isRestarting = false;
        }
        catch (error) {
            logger.error('Worker restart failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            isRestarting = false;
            isRestartScheduled = false;
            scheduleWorkerRestart();
        }
    }, delay);
}
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        logger.warning('Shutdown already in progress');
        return;
    }
    isShuttingDown = true;
    isRestartScheduled = false;
    isRestarting = false;
    if (restartTimeoutId) {
        clearTimeout(restartTimeoutId);
        restartTimeoutId = null;
    }
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    if (worker) {
        try {
            await worker.pause(true);
            logger.info('Worker paused');
            await new Promise((resolve) => {
                const checkInterval = setInterval(async () => {
                    const isRunning = worker ? await worker.isRunning() : false;
                    if (!isRunning) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 1000);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 30000);
            });
            logger.info('Active jobs completed');
            await worker.close();
            logger.info('Worker closed');
        }
        catch (error) {
            logger.error('Error during shutdown', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    logger.info('Worker shutdown complete');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', { error: error.message, stack: error.stack });
    if (!isShuttingDown) {
        logger.info('Attempting recovery from uncaught exception...');
        scheduleWorkerRestart();
    }
    else {
        process.exit(1);
    }
});
process.on('unhandledRejection', (reason) => {
    logger.fatal('Unhandled rejection', {
        reason: reason instanceof Error ? reason.message : String(reason)
    });
    if (!isShuttingDown) {
        logger.info('Attempting recovery from unhandled rejection...');
        scheduleWorkerRestart();
    }
});
async function startWithRetry() {
    const maxInitialRetries = 10;
    const initialRetryDelay = 3000;
    for (let attempt = 1; attempt <= maxInitialRetries; attempt++) {
        try {
            logger.info(`Starting worker (attempt ${attempt}/${maxInitialRetries})...`);
            await startWorker();
            return;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Worker start attempt ${attempt} failed`, { error: errorMessage });
            if (attempt < maxInitialRetries) {
                const delay = initialRetryDelay * attempt;
                logger.info(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            else {
                logger.fatal('All initial start attempts failed, entering supervisory mode');
                scheduleWorkerRestart();
            }
        }
    }
}
startWithRetry();
