/**
 * POST /api/compress - Video Compression Endpoint
 * Accepts video compression requests and queues them for processing
 * Converted from PHP compress.php
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { enqueueJob, getQueueLength } from '@/lib/queue';
import { ensureRedisConnected } from '@/lib/redis';
import { validateApiKey, getCorsHeaders, getClientIP } from '@/lib/utils';
import { APIResponse, CompressRequest } from '@/types';

const logger = createLogger('API-COMPRESS');

const compressRequestSchema = z.object({
  postId: z.number().int().positive(),
  wpMediaPath: z.string().min(1),
  wpVideoUrl: z.string().url().optional(),
  wpThumbnailPath: z.string().optional(),
  wpThumbnailUrl: z.string().optional(),
  wpPostUrl: z.string().optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12)
});

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || undefined;
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin)
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);
  const clientIP = getClientIP(request);

  logger.info('Compress request received', { clientIP });

  try {
    if (!validateApiKey(request)) {
      logger.warning('Invalid API key', { clientIP });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Unauthorized: Invalid or missing API key',
          code: 'UNAUTHORIZED'
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const redisCheck = await ensureRedisConnected();
    if (!redisCheck.connected) {
      logger.error('Redis not available for compress request', { error: redisCheck.error, clientIP });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Queue service temporarily unavailable. Please try again in a moment.',
          error: redisCheck.error,
          code: 'SERVICE_UNAVAILABLE'
        },
        { status: 503, headers: corsHeaders }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logger.warning('Invalid JSON in request body', { clientIP });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Invalid JSON in request body',
          code: 'INVALID_JSON'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const validation = compressRequestSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.issues.map((e) => `${String(e.path.join('.'))}: ${e.message}`);
      logger.warning('Validation failed', { errors, clientIP });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Validation failed',
          error: errors.join('; '),
          code: 'VALIDATION_ERROR'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const data = validation.data as CompressRequest;

    logger.info('Valid compress request', {
      postId: data.postId,
      wpMediaPath: data.wpMediaPath,
      year: data.year,
      month: data.month
    });

    const result = await enqueueJob({
      postId: data.postId,
      wpMediaPath: data.wpMediaPath,
      wpVideoUrl: data.wpVideoUrl || '',
      wpThumbnailPath: data.wpThumbnailPath,
      wpThumbnailUrl: data.wpThumbnailUrl,
      wpPostUrl: data.wpPostUrl,
      year: data.year,
      month: data.month
    });

    if (!result.success) {
      logger.error('Failed to enqueue job', { error: result.error, postId: data.postId });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Failed to enqueue job',
          error: result.error,
          code: 'QUEUE_ERROR'
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const queueLength = await getQueueLength();

    logger.info('Job enqueued successfully', {
      jobId: result.jobId,
      postId: data.postId,
      queuePosition: result.queuePosition
    });

    return NextResponse.json(
      {
        jobId: result.jobId,
        postId: data.postId,
        status: 'pending',
        message: 'Video compression job queued successfully',
        queuePosition: result.queuePosition,
        queueLength
      },
      { status: 202, headers: corsHeaders }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Compress endpoint error', { error: errorMessage, clientIP });

    return NextResponse.json<APIResponse>(
      {
        status: 'error',
        message: 'Internal server error',
        error: errorMessage,
        code: 'INTERNAL_ERROR'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
