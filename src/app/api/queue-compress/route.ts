/**
 * POST /api/queue-compress - Legacy Video Compression Endpoint
 * Maintains backward compatibility with PHP API contract
 * Alias for /api/compress
 */

import { NextRequest } from 'next/server';
import { POST as compressPost, OPTIONS as compressOptions } from '@/app/api/compress/route';

export async function OPTIONS(request: NextRequest) {
  return compressOptions(request);
}

export async function POST(request: NextRequest) {
  return compressPost(request);
}
