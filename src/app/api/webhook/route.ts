/**
 * POST /api/webhook - Webhook Receiver Endpoint
 * Receives callbacks from WordPress for job status updates
 * This endpoint is for WordPress to acknowledge receipt of compression results
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getJobStatus } from '@/lib/queue';
import { validateApiKey, getCorsHeaders, getClientIP } from '@/lib/utils';
import { APIResponse } from '@/types';

const logger = createLogger('API-WEBHOOK');

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

  try {
    if (!validateApiKey(request)) {
      logger.warning('Invalid API key on webhook', { clientIP });
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Unauthorized: Invalid or missing API key',
          code: 'UNAUTHORIZED'
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { jobId, postId, action, status } = body;

    logger.info('Webhook received', {
      jobId,
      postId,
      action,
      status,
      clientIP
    });

    if (!jobId && !postId) {
      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'jobId or postId is required',
          code: 'MISSING_PARAMETER'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (action === 'acknowledge') {
      logger.info('WordPress acknowledged job completion', { jobId, postId });
      
      return NextResponse.json<APIResponse>(
        {
          status: 'success',
          message: 'Acknowledgment received',
          data: {
            jobId,
            postId,
            acknowledged: true,
            timestamp: new Date().toISOString()
          }
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (action === 'status') {
      const targetJobId = jobId || (postId ? `job_${postId}_` : null);
      
      if (targetJobId) {
        const jobStatus = await getJobStatus(targetJobId);
        
        if (jobStatus.found) {
          return NextResponse.json<APIResponse>(
            {
              status: 'success',
              message: 'Job status retrieved',
              data: {
                jobId: targetJobId,
                postId: jobStatus.data?.postId,
                job_status: jobStatus.status,
                progress: jobStatus.progress || 0,
                result: jobStatus.result,
                error: jobStatus.error
              }
            },
            { status: 200, headers: corsHeaders }
          );
        }
      }

      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Job not found',
          code: 'JOB_NOT_FOUND'
        },
        { status: 404, headers: corsHeaders }
      );
    }

    if (action === 'retry') {
      const { retryFailedJob } = await import('@/lib/queue');
      const targetJobId = jobId || (postId ? `job_${postId}_` : null);

      if (targetJobId) {
        const retried = await retryFailedJob(targetJobId);
        
        if (retried) {
          logger.info('Job retry initiated from WordPress', { jobId: targetJobId });
          
          return NextResponse.json<APIResponse>(
            {
              status: 'success',
              message: 'Job retry initiated',
              data: {
                jobId: targetJobId,
                retried: true
              }
            },
            { status: 200, headers: corsHeaders }
          );
        }
      }

      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Failed to retry job',
          code: 'RETRY_FAILED'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (action === 'cancel') {
      const { removeJob } = await import('@/lib/queue');
      const targetJobId = jobId || (postId ? `job_${postId}_` : null);

      if (targetJobId) {
        const removed = await removeJob(targetJobId);
        
        if (removed) {
          logger.info('Job cancelled from WordPress', { jobId: targetJobId });
          
          return NextResponse.json<APIResponse>(
            {
              status: 'success',
              message: 'Job cancelled',
              data: {
                jobId: targetJobId,
                cancelled: true
              }
            },
            { status: 200, headers: corsHeaders }
          );
        }
      }

      return NextResponse.json<APIResponse>(
        {
          status: 'error',
          message: 'Failed to cancel job',
          code: 'CANCEL_FAILED'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json<APIResponse>(
      {
        status: 'success',
        message: 'Webhook processed',
        data: {
          received: true,
          timestamp: new Date().toISOString()
        }
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Webhook endpoint error', { error: errorMessage, clientIP });

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
