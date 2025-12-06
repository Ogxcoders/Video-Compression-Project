/**
 * GET /api/status - Job Status Endpoint
 * Returns the status of a video compression job
 * Converted from PHP status.php
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getJobStatus, getQueueStats } from '@/lib/queue';
import { validateApiKey, getCorsHeaders, getClientIP } from '@/lib/utils';
import { APIResponse } from '@/types';

const logger = createLogger('API-STATUS');

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
  const clientIP = getClientIP(request);

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

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const postId = searchParams.get('postId');

    if (!jobId && !postId) {
      const stats = await getQueueStats();
      logger.info('Queue stats requested', { clientIP });

      return NextResponse.json<APIResponse>(
        {
          status: 'success',
          message: 'Queue statistics retrieved',
          data: {
            stats,
            timestamp: new Date().toISOString()
          }
        },
        { status: 200, headers: corsHeaders }
      );
    }

    const targetJobId = jobId || (postId ? `job_${postId}_` : null);

    if (!targetJobId) {
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'jobId or postId is required',
          code: 'MISSING_PARAMETER'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    logger.info('Status check', { jobId: targetJobId, clientIP });

    const jobStatus = await getJobStatus(targetJobId);

    if (!jobStatus.found) {
      logger.warning('Job not found', { jobId: targetJobId });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: `Job not found: ${targetJobId}`,
          code: 'JOB_NOT_FOUND'
        },
        { status: 404, headers: corsHeaders }
      );
    }

    const response: Record<string, unknown> = {
      jobId: targetJobId,
      postId: jobStatus.data?.postId,
      job_status: jobStatus.status,
      progress: jobStatus.progress || 0,
      createdAt: jobStatus.data?.createdAt,
      updatedAt: jobStatus.data?.updatedAt,
      attempts: jobStatus.data?.attempts || 0
    };

    if (jobStatus.status === 'completed' && jobStatus.result) {
      response.urls = jobStatus.result.urls;
      response.hlsUrls = jobStatus.result.hlsUrls;
      response.stats = jobStatus.result.stats;
    }

    if (jobStatus.status === 'failed' && jobStatus.error) {
      response.error = jobStatus.error;
    }

    return NextResponse.json(response, { status: 200, headers: corsHeaders });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Status endpoint error', { error: errorMessage, clientIP });

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
