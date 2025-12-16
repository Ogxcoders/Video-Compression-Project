/**
 * Next.js Middleware for Video Compression API
 * Handles CORS, rate limiting, and security headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 100;
const ipRequestCounts = new Map<string, { count: number; windowStart: number }>();

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  const origin = request.headers.get('origin') || '*';
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Range, Accept-Encoding');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  response.headers.set('Accept-Ranges', 'bytes');
  response.headers.set('Access-Control-Max-Age', '86400');

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Range, Accept-Encoding',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
        'Accept-Ranges': 'bytes',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (request.nextUrl.pathname.startsWith('/content/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    
    if (request.nextUrl.pathname.endsWith('.m3u8')) {
      response.headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      response.headers.set('Cache-Control', 'no-cache');
    } else if (request.nextUrl.pathname.endsWith('.ts')) {
      response.headers.set('Content-Type', 'video/mp2t');
    } else if (request.nextUrl.pathname.endsWith('.mp4')) {
      response.headers.set('Content-Type', 'video/mp4');
    }
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
    
    const clientIP = getClientIP(request);
    const now = Date.now();
    const rateLimitData = ipRequestCounts.get(clientIP);

    if (rateLimitData) {
      if (now - rateLimitData.windowStart > RATE_LIMIT_WINDOW) {
        ipRequestCounts.set(clientIP, { count: 1, windowStart: now });
      } else if (rateLimitData.count >= RATE_LIMIT_MAX) {
        return new NextResponse(
          JSON.stringify({
            status: 'error',
            message: 'Rate limit exceeded. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED'
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil((RATE_LIMIT_WINDOW - (now - rateLimitData.windowStart)) / 1000)),
              'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil((rateLimitData.windowStart + RATE_LIMIT_WINDOW) / 1000))
            }
          }
        );
      } else {
        rateLimitData.count++;
      }
    } else {
      ipRequestCounts.set(clientIP, { count: 1, windowStart: now });
    }

    const remaining = RATE_LIMIT_MAX - (ipRequestCounts.get(clientIP)?.count || 0);
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    response.headers.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  }

  return response;
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  return 'unknown';
}

export const config = {
  matcher: [
    '/api/:path*',
    '/content/:path*'
  ]
};
