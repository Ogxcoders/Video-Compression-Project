/**
 * GET /api/health - Health Check Endpoint
 * Returns the health status of the API and its dependencies
 * Converted from PHP index.php health check
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRedisConnected } from '@/lib/redis';
import { getQueueStats } from '@/lib/queue';
import { checkFfmpegAvailable } from '@/lib/ffmpeg';
import { config } from '@/lib/config';
import { createLogger } from '@/lib/logger';
import { getCorsHeaders } from '@/lib/utils';
import { APIResponse } from '@/types';

const logger = createLogger('API-HEALTH');

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || undefined;
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin)
  });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  try {
    const [redisConnected, ffmpegAvailable, queueStats] = await Promise.all([
      isRedisConnected(),
      checkFfmpegAvailable(),
      getQueueStats().catch(() => null)
    ]);

    const cfg = config();
    const isHealthy = redisConnected && ffmpegAvailable;

    const healthData = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      dependencies: {
        redis: {
          connected: redisConnected,
          host: cfg.redis.host,
          port: cfg.redis.port
        },
        ffmpeg: {
          available: ffmpegAvailable
        }
      },
      queue: queueStats ? {
        pending: queueStats.pending,
        processing: queueStats.processing,
        completed: queueStats.completed,
        failed: queueStats.failed
      } : null,
      config: {
        hls_time: cfg.hls_time,
        max_video_age_days: cfg.max_video_age_days,
        parallel_compression: cfg.parallel_compression,
        debug: cfg.debug
      }
    };

    logger.debug('Health check', { isHealthy, redisConnected, ffmpegAvailable });

    return NextResponse.json<APIResponse>(
      {
        status: 'success',
        message: isHealthy ? 'All systems operational' : 'System degraded',
        data: healthData
      },
      { 
        status: isHealthy ? 200 : 503, 
        headers: corsHeaders 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Health check error', { error: errorMessage });

    return NextResponse.json<APIResponse>(
      {
        status: 'error',
        message: 'Health check failed',
        error: errorMessage,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString()
        }
      },
      { status: 503, headers: corsHeaders }
    );
  }
}
