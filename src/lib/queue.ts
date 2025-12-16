/**
 * Job Queue Manager using BullMQ
 * Handles video compression job queue with status tracking
 * Converted from PHP RedisQueue.php - Migrated from Bull to BullMQ
 */

import { Queue, QueueEvents } from 'bullmq';
import { config } from './config';
import { createLogger } from './logger';
import { 
  VideoJobData, 
  JobStatus, 
  JobResult, 
  QueueStats 
} from '../types';

const logger = createLogger('QUEUE');

let compressionQueue: Queue<VideoJobData, JobResult> | null = null;
let queueEvents: QueueEvents | null = null;

function getRedisConnection() {
  const cfg = config();
  return {
    host: cfg.redis.host,
    port: cfg.redis.port,
    password: cfg.redis.password || undefined,
    db: cfg.redis.database
  };
}

export function getCompressionQueue(): Queue<VideoJobData, JobResult> {
  if (!compressionQueue) {
    const cfg = config();
    const connection = getRedisConnection();
    
    compressionQueue = new Queue<VideoJobData, JobResult>('compression_queue', {
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

    queueEvents = new QueueEvents('compression_queue', { connection });

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

export async function enqueueJob(jobData: Omit<VideoJobData, 'jobId' | 'status' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; jobId?: string; error?: string; queuePosition?: number }> {
  const ENQUEUE_TIMEOUT = 15000;
  
  try {
    const enqueueOperation = async (): Promise<{ success: boolean; jobId?: string; error?: string; queuePosition?: number }> => {
      const queue = getCompressionQueue();
      const timestamp = Date.now();
      const jobId = `job_${jobData.postId}_${timestamp}`;

      const fullJobData: VideoJobData = {
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

    return await withTimeout(
      enqueueOperation(), 
      ENQUEUE_TIMEOUT, 
      'Queue operation timed out. Redis may be unavailable.'
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to enqueue job', { error: errorMessage, postId: jobData.postId });
    return {
      success: false,
      error: errorMessage
    };
  }
}

export async function getJobStatus(jobId: string): Promise<{
  found: boolean;
  status?: JobStatus;
  progress?: number;
  data?: VideoJobData;
  result?: JobResult;
  error?: string;
}> {
  try {
    const queue = getCompressionQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return { found: false };
    }

    const state = await job.getState();
    const progress = job.progress as number | undefined;

    let status: JobStatus;
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
      result: job.returnvalue as JobResult | undefined,
      error: job.failedReason
    };

  } catch (error) {
    logger.error('Failed to get job status', { jobId, error: String(error) });
    return { found: false, error: String(error) };
  }
}

export async function updateJobProgress(jobId: string, progress: number, stage?: string): Promise<void> {
  try {
    const queue = getCompressionQueue();
    const job = await queue.getJob(jobId);
    
    if (job) {
      await job.updateProgress(progress);
      logger.debug('Job progress updated', { jobId, progress, stage });
    }
  } catch (error) {
    logger.warning('Failed to update job progress', { jobId, error: String(error) });
  }
}

export async function getQueueStats(): Promise<QueueStats> {
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

  } catch (error) {
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

export async function getQueueLength(): Promise<number> {
  const queue = getCompressionQueue();
  return queue.getWaitingCount();
}

export async function cleanupCompletedJobs(maxAge: number = 86400000): Promise<number> {
  try {
    const queue = getCompressionQueue();
    const grace = Math.floor(maxAge / 1000);
    const cleaned = await queue.clean(grace, 100, 'completed');
    logger.info('Cleaned completed jobs', { count: cleaned.length, maxAgeMs: maxAge });
    return cleaned.length;
  } catch (error) {
    logger.error('Failed to cleanup completed jobs', { error: String(error) });
    return 0;
  }
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  try {
    const queue = getCompressionQueue();
    const job = await queue.getJob(jobId);
    
    if (job) {
      await job.retry();
      logger.info('Job retried', { jobId });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Failed to retry job', { jobId, error: String(error) });
    return false;
  }
}

export async function removeJob(jobId: string): Promise<boolean> {
  try {
    const queue = getCompressionQueue();
    const job = await queue.getJob(jobId);
    
    if (job) {
      await job.remove();
      logger.info('Job removed', { jobId });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Failed to remove job', { jobId, error: String(error) });
    return false;
  }
}

export async function pauseQueue(): Promise<void> {
  const queue = getCompressionQueue();
  await queue.pause();
  logger.info('Queue paused');
}

export async function resumeQueue(): Promise<void> {
  const queue = getCompressionQueue();
  await queue.resume();
  logger.info('Queue resumed');
}

export async function closeQueue(): Promise<void> {
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

export async function getRecentJobs(limit: number = 20): Promise<Array<{
  jobId: string;
  postId: number;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt?: string;
}>> {
  try {
    const queue = getCompressionQueue();
    
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getJobs(['waiting'], 0, limit),
      queue.getJobs(['active'], 0, limit),
      queue.getJobs(['completed'], 0, limit),
      queue.getJobs(['failed'], 0, limit)
    ]);

    const allJobs = [...waiting, ...active, ...completed, ...failed];
    
    const jobInfos = await Promise.all(
      allJobs.slice(0, limit).map(async (job) => {
        const state = await job.getState();
        let status: JobStatus;
        switch (state) {
          case 'completed': status = 'completed'; break;
          case 'failed': status = 'failed'; break;
          case 'active': status = 'processing'; break;
          default: status = 'pending';
        }
        
        return {
          jobId: job.id || job.data.jobId,
          postId: job.data.postId,
          status,
          progress: (job.progress as number) || 0,
          createdAt: job.data.createdAt,
          updatedAt: job.data.updatedAt
        };
      })
    );

    return jobInfos.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  } catch (error) {
    logger.error('Failed to get recent jobs', { error: String(error) });
    return [];
  }
}

export default getCompressionQueue;
