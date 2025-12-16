"use strict";
/**
 * Redis Client Module
 * Provides Redis connection management with ioredis
 * Features resilient reconnection with exponential backoff
 * Converted from PHP RedisQueue.php
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
exports.isRedisReconnecting = isRedisReconnecting;
exports.isRedisConnected = isRedisConnected;
exports.ensureRedisConnected = ensureRedisConnected;
exports.closeRedisConnection = closeRedisConnection;
exports.getRedisInfo = getRedisInfo;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('REDIS');
const MAX_RETRY_DELAY = 30000;
const BASE_RETRY_DELAY = 1000;
let redisClient = null;
let isReconnecting = false;
function createResilientRetryStrategy(times) {
    const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, Math.min(times - 1, 5)), MAX_RETRY_DELAY);
    logger.info(`Redis reconnection attempt ${times}, next retry in ${delay}ms`);
    return delay;
}
function getRedisClient() {
    if (!redisClient) {
        const cfg = (0, config_1.config)();
        redisClient = new ioredis_1.default({
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
        redisClient.on('reconnecting', (delay) => {
            isReconnecting = true;
            logger.info('Redis reconnecting...', { delayMs: delay });
        });
        redisClient.on('end', () => {
            logger.warning('Redis connection ended');
        });
    }
    return redisClient;
}
function isRedisReconnecting() {
    return isReconnecting;
}
async function isRedisConnected() {
    try {
        const client = getRedisClient();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Redis ping timeout')), 5000);
        });
        const pingPromise = client.ping().then(pong => pong === 'PONG');
        return await Promise.race([pingPromise, timeoutPromise]);
    }
    catch {
        return false;
    }
}
async function ensureRedisConnected() {
    try {
        const client = getRedisClient();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Redis connection timeout (5s)')), 5000);
        });
        const connectPromise = new Promise(async (resolve, reject) => {
            try {
                if (client.status === 'ready') {
                    resolve('PONG');
                    return;
                }
                if (client.status === 'connecting') {
                    await new Promise((res) => {
                        client.once('ready', () => res());
                        client.once('error', (err) => reject(err));
                    });
                    resolve('PONG');
                    return;
                }
                await client.connect();
                resolve('PONG');
            }
            catch (err) {
                reject(err);
            }
        });
        await Promise.race([connectPromise, timeoutPromise]);
        return { connected: true };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Redis connection failed', { error: errorMessage });
        return { connected: false, error: errorMessage };
    }
}
async function closeRedisConnection() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis connection closed');
    }
}
async function getRedisInfo() {
    try {
        const client = getRedisClient();
        const info = await client.info();
        const lines = info.split('\n');
        const result = {};
        for (const line of lines) {
            const [key, value] = line.split(':');
            if (key && value) {
                result[key.trim()] = value.trim();
            }
        }
        return result;
    }
    catch (error) {
        logger.error('Failed to get Redis info', { error: String(error) });
        return {};
    }
}
exports.default = getRedisClient;
