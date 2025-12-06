"use strict";
/**
 * Job Queue Manager using BullMQ
 * Handles video compression job queue with status tracking
 * Converted from PHP RedisQueue.php - Migrated from Bull to BullMQ
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompressionQueue = getCompressionQueue;
exports.enqueueJob = enqueueJob;
exports.getJobStatus = getJobStatus;
exports.updateJobProgress = updateJobProgress;
exports.getQueueStats = getQueueStats;
exports.getQueueLength = getQueueLength;
exports.cleanupCompletedJobs = cleanupCompletedJobs;
exports.retryFailedJob = retryFailedJob;
exports.removeJob = removeJob;
exports.pauseQueue = pauseQueue;
exports.resumeQueue = resumeQueue;
exports.closeQueue = closeQueue;
exports.getRecentJobs = getRecentJobs;
const bullmq_1 = require("bullmq");
const config_1 = require("./config");
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('QUEUE');
let compressionQueue = null;
let queueEvents = null;
function getRedisConnection() {
    const cfg = (0, config_1.config)();
    return {
        host: cfg.redis.host,
        port: cfg.redis.port,
        password: cfg.redis.password || undefined,
        db: cfg.redis.database
    };
}
function getCompressionQueue() {
    if (!compressionQueue) {
        const cfg = (0, config_1.config)();
        const connection = getRedisConnection();
        compressionQueue = new bullmq_1.Queue('compression_queue', {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000
                },
                removeOnComplete: false,
                removeOnFail: false
            }
        });
        queueEvents = new bullmq_1.QueueEvents('compression_queue', { connection });
        queueEvents.on('waiting', ({ jobId }) => {
            logger.debug('Job waiting', { jobId });
        });
        queueEvents.on('active', ({ jobId }) => {
            logger.info('Job started processing', { jobId });
        });
        queueEvents.on('completed', ({ jobId, returnvalue }) => {
            const result = returnvalue ? JSON.parse(returnvalue) : null;
            logger.info('Job completed', {
                jobId,
                success: result?.success
            });
        });
        queueEvents.on('failed', ({ jobId, failedReason }) => {
            logger.error('Job failed', {
                jobId,
                error: failedReason
            });
        });
        queueEvents.on('stalled', ({ jobId }) => {
            logger.warning('Job stalled', { jobId });
        });
        logger.info('Compression queue initialized', {
            host: cfg.redis.host,
            port: cfg.redis.port
        });
    }
    return compressionQueue;
}
async function withTimeout(promise, timeoutMs, errorMessage) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
}
async function enqueueJob(jobData) {
    const ENQUEUE_TIMEOUT = 15000;
    try {
        const enqueueOperation = async () => {
            const queue = getCompressionQueue();
            const timestamp = Date.now();
            const jobId = `job_${jobData.postId}_${timestamp}`;
            const fullJobData = {
                ...jobData,
                jobId,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                attempts: 0
            };
            const existingJob = await queue.getJob(jobId);
            if (existingJob) {
                const state = await existingJob.getState();
                if (state === 'waiting' || state === 'active' || state === 'delayed') {
                    logger.warning('Job already exists in queue', { jobId, state });
                    return {
                        success: false,
                        error: `Job ${jobId} already exists in ${state} state`
                    };
                }
            }
            await queue.add('compress', fullJobData, {
                jobId,
                priority: 0,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000
                }
            });
            const waitingCount = await queue.getWaitingCount();
            logger.info('Job enqueued successfully', {
                jobId,
                postId: jobData.postId,
                queuePosition: waitingCount
            });
            return {
                success: true,
                jobId,
                queuePosition: waitingCount
            };
        };
        return await withTimeout(enqueueOperation(), ENQUEUE_TIMEOUT, 'Queue operation timed out. Redis may be unavailable.');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to enqueue job', { error: errorMessage, postId: jobData.postId });
        return {
            success: false,
            error: errorMessage
        };
    }
}
async function getJobStatus(jobId) {
    try {
        const queue = getCompressionQueue();
        const job = await queue.getJob(jobId);
        if (!job) {
            return { found: false };
        }
        const state = await job.getState();
        const progress = job.progress;
        let status;
        switch (state) {
            case 'completed':
                status = 'completed';
                break;
            case 'failed':
                status = 'failed';
                break;
            case 'active':
                status = 'processing';
                break;
            case 'waiting':
            case 'delayed':
            case 'prioritized':
            case 'waiting-children':
                status = 'pending';
                break;
            default:
                status = 'pending';
        }
        return {
            found: true,
            status,
            progress: typeof progress === 'number' ? progress : 0,
            data: job.data,
            result: job.returnvalue,
            error: job.failedReason
        };
    }
    catch (error) {
        logger.error('Failed to get job status', { jobId, error: String(error) });
        return { found: false, error: String(error) };
    }
}
async function updateJobProgress(jobId, progress, stage) {
    try {
        const queue = getCompressionQueue();
        const job = await queue.getJob(jobId);
        if (job) {
            await job.updateProgress(progress);
            logger.debug('Job progress updated', { jobId, progress, stage });
        }
    }
    catch (error) {
        logger.warning('Failed to update job progress', { jobId, error: String(error) });
    }
}
async function getQueueStats() {
    try {
        const queue = getCompressionQueue();
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount()
        ]);
        return {
            pending: waiting + delayed,
            processing: active,
            completed,
            failed,
            dead_letter: 0
        };
    }
    catch (error) {
        logger.error('Failed to get queue stats', { error: String(error) });
        return {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            dead_letter: 0
        };
    }
}
async function getQueueLength() {
    const queue = getCompressionQueue();
    return queue.getWaitingCount();
}
async function cleanupCompletedJobs(maxAge = 86400000) {
    try {
        const queue = getCompressionQueue();
        const grace = Math.floor(maxAge / 1000);
        const cleaned = await queue.clean(grace, 100, 'completed');
        logger.info('Cleaned completed jobs', { count: cleaned.length, maxAgeMs: maxAge });
        return cleaned.length;
    }
    catch (error) {
        logger.error('Failed to cleanup completed jobs', { error: String(error) });
        return 0;
    }
}
async function retryFailedJob(jobId) {
    try {
        const queue = getCompressionQueue();
        const job = await queue.getJob(jobId);
        if (job) {
            await job.retry();
            logger.info('Job retried', { jobId });
            return true;
        }
        return false;
    }
    catch (error) {
        logger.error('Failed to retry job', { jobId, error: String(error) });
        return false;
    }
}
async function removeJob(jobId) {
    try {
        const queue = getCompressionQueue();
        const job = await queue.getJob(jobId);
        if (job) {
            await job.remove();
            logger.info('Job removed', { jobId });
            return true;
        }
        return false;
    }
    catch (error) {
        logger.error('Failed to remove job', { jobId, error: String(error) });
        return false;
    }
}
async function pauseQueue() {
    const queue = getCompressionQueue();
    await queue.pause();
    logger.info('Queue paused');
}
async function resumeQueue() {
    const queue = getCompressionQueue();
    await queue.resume();
    logger.info('Queue resumed');
}
async function closeQueue() {
    if (queueEvents) {
        await queueEvents.close();
        queueEvents = null;
    }
    if (compressionQueue) {
        await compressionQueue.close();
        compressionQueue = null;
        logger.info('Queue closed');
    }
}
async function getRecentJobs(limit = 20) {
    try {
        const queue = getCompressionQueue();
        const [waiting, active, completed, failed] = await Promise.all([
            queue.getJobs(['waiting'], 0, limit),
            queue.getJobs(['active'], 0, limit),
            queue.getJobs(['completed'], 0, limit),
            queue.getJobs(['failed'], 0, limit)
        ]);
        const allJobs = [...waiting, ...active, ...completed, ...failed];
        const jobInfos = await Promise.all(allJobs.slice(0, limit).map(async (job) => {
            const state = await job.getState();
            let status;
            switch (state) {
                case 'completed':
                    status = 'completed';
                    break;
                case 'failed':
                    status = 'failed';
                    break;
                case 'active':
                    status = 'processing';
                    break;
                default: status = 'pending';
            }
            return {
                jobId: job.id || job.data.jobId,
                postId: job.data.postId,
                status,
                progress: job.progress || 0,
                createdAt: job.data.createdAt,
                updatedAt: job.data.updatedAt
            };
        }));
        return jobInfos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    catch (error) {
        logger.error('Failed to get recent jobs', { error: String(error) });
        return [];
    }
}
exports.default = getCompressionQueue;
