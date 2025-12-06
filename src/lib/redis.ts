/**
 * Redis Client Module
 * Provides Redis connection management with ioredis
 * Features resilient reconnection with exponential backoff
 * Converted from PHP RedisQueue.php
 */

import Redis from 'ioredis';
import { config } from './config';
import { createLogger } from './logger';

const logger = createLogger('REDIS');

const MAX_RETRY_DELAY = 30000;
const BASE_RETRY_DELAY = 1000;

let redisClient: Redis | null = null;
let isReconnecting = false;

function createResilientRetryStrategy(times: number): number {
  const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, Math.min(times - 1, 5)), MAX_RETRY_DELAY);
  logger.info(`Redis reconnection attempt ${times}, next retry in ${delay}ms`);
  return delay;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    const cfg = config();
    
    redisClient = new Redis({
      host: cfg.redis.host,
      port: cfg.redis.port,
      password: cfg.redis.password,
      db: cfg.redis.database,
      connectTimeout: 10000,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: createResilientRetryStrategy,
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
        return targetErrors.some(e => err.message.includes(e));
      },
      lazyConnect: true
    });

    redisClient.on('connect', () => {
      isReconnecting = false;
      logger.info('Redis connected successfully', {
        host: cfg.redis.host,
        port: cfg.redis.port
      });
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('close', () => {
      logger.warning('Redis connection closed');
    });

    redisClient.on('reconnecting', (delay: number) => {
      isReconnecting = true;
      logger.info('Redis reconnecting...', { delayMs: delay });
    });

    redisClient.on('end', () => {
      logger.warning('Redis connection ended');
    });
  }

  return redisClient;
}

export function isRedisReconnecting(): boolean {
  return isReconnecting;
}

export async function isRedisConnected(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error('Redis ping timeout')), 5000);
    });
    const pingPromise = client.ping().then(pong => pong === 'PONG');
    return await Promise.race([pingPromise, timeoutPromise]);
  } catch {
    return false;
  }
}

export async function ensureRedisConnected(): Promise<{ connected: boolean; error?: string }> {
  try {
    const client = getRedisClient();
    
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout (5s)')), 5000);
    });
    
    const connectPromise = new Promise<string>(async (resolve, reject) => {
      try {
        if (client.status === 'ready') {
          resolve('PONG');
          return;
        }
        if (client.status === 'connecting') {
          await new Promise<void>((res) => {
            client.once('ready', () => res());
            client.once('error', (err) => reject(err));
          });
          resolve('PONG');
          return;
        }
        await client.connect();
        resolve('PONG');
      } catch (err) {
        reject(err);
      }
    });
    
    await Promise.race([connectPromise, timeoutPromise]);
    return { connected: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Redis connection failed', { error: errorMessage });
    return { connected: false, error: errorMessage };
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

export async function getRedisInfo(): Promise<Record<string, string>> {
  try {
    const client = getRedisClient();
    const info = await client.info();
    const lines = info.split('\n');
    const result: Record<string, string> = {};
    
    for (const line of lines) {
      const [key, value] = line.split(':');
      if (key && value) {
        result[key.trim()] = value.trim();
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to get Redis info', { error: String(error) });
    return {};
  }
}

export default getRedisClient;
