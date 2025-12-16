/**
 * GET /api/admin/jobs - Admin Jobs List Endpoint
 * Returns list of recent jobs for admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getRecentJobs, getQueueStats } from '@/lib/queue';
import { validateApiKey, getCorsHeaders, getClientIP } from '@/lib/utils';
import { APIResponse } from '@/types';

const logger = createLogger('API-ADMIN-JOBS');

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
      logger.warning('Invalid API key on admin jobs', { clientIP });
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
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const [jobs, stats] = await Promise.all([
      getRecentJobs(Math.min(limit, 100)),
      getQueueStats()
    ]);

    logger.debug('Admin jobs retrieved', { count: jobs.length, clientIP });

    return NextResponse.json<APIResponse>(
      {
        status: 'success',
        message: 'Jobs retrieved',
        data: {
          jobs,
          stats,
          timestamp: new Date().toISOString()
        }
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Admin jobs endpoint error', { error: errorMessage, clientIP });

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
