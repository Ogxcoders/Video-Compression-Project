/**
 * Static File Serving Route for Video Content
 * Optimized for fast video delivery with true streaming
 * 
 * Key optimizations:
 * 1. True streaming - never loads entire files into memory
 * 2. Proper Range Request handling for video seeking
 * 3. Efficient chunked transfer for large files
 * 4. Optimized cache headers for Cloudflare
 * 
 * Route: /content/[year]/[month]/[postId]/[file]
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { config } from '@/lib/config';
import { createLogger } from '@/lib/logger';
import { getCorsHeaders, sanitizePath } from '@/lib/utils';

const logger = createLogger('CONTENT');

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

const STREAMABLE_EXTENSIONS = new Set(['.mp4', '.webm', '.ts']);
const CHUNK_SIZE = 64 * 1024;

function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    }
  });
}

function getCacheHeaders(ext: string): string {
  switch (ext) {
    case '.m3u8':
      return 'public, max-age=10';
    case '.ts':
      return 'public, max-age=31536000, immutable';
    case '.webp':
    case '.jpg':
    case '.jpeg':
    case '.png':
      return 'public, max-age=2592000';
    case '.mp4':
    case '.webm':
      return 'public, max-age=31536000, immutable';
    default:
      return 'public, max-age=31536000, immutable';
  }
}

/**
 * Parse HTTP Range header with full RFC 7233 compliance
 * Supports:
 * - bytes=0-499     (first 500 bytes)
 * - bytes=500-999   (bytes 500-999)
 * - bytes=500-      (bytes from 500 to end)
 * - bytes=-500      (last 500 bytes - suffix range)
 */
function parseRangeHeader(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;

  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';

  let start: number;
  let end: number;

  if (!hasStart && hasEnd) {
    // Suffix range: bytes=-500 (last 500 bytes)
    const suffixLength = parseInt(match[2], 10);
    if (suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (hasStart && !hasEnd) {
    // Open-ended range: bytes=500- (from 500 to end)
    start = parseInt(match[1], 10);
    end = fileSize - 1;
  } else if (hasStart && hasEnd) {
    // Explicit range: bytes=500-999
    start = parseInt(match[1], 10);
    end = parseInt(match[2], 10);
  } else {
    // Invalid: bytes=- (no start or end)
    return null;
  }

  // Validate range bounds
  if (start < 0 || end < 0 || start > end || start >= fileSize) {
    return null;
  }

  // Clamp end to file size (RFC 7233 allows end > fileSize)
  end = Math.min(end, fileSize - 1);

  return { start, end };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const corsHeaders = getCorsHeaders(request.headers.get('origin') || undefined);

  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams.path;
    
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'File path required' },
        { status: 400, headers: corsHeaders }
      );
    }

    let relativePath: string;
    try {
      relativePath = sanitizePath(pathSegments.join('/'));
    } catch {
      logger.warning('Invalid path detected', { path: pathSegments.join('/') });
      return NextResponse.json(
        { status: 'error', message: 'Invalid path' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cfg = config();
    const fullPath = path.join(cfg.media_content_dir, relativePath);

    const normalizedContentDir = path.resolve(cfg.media_content_dir);
    const normalizedFullPath = path.resolve(fullPath);

    if (!normalizedFullPath.startsWith(normalizedContentDir)) {
      logger.warning('Path traversal attempt detected', { 
        requested: relativePath,
        resolved: normalizedFullPath 
      });
      return NextResponse.json(
        { status: 'error', message: 'Access denied' },
        { status: 403, headers: corsHeaders }
      );
    }

    if (!fs.existsSync(fullPath)) {
      logger.debug('File not found', { path: relativePath });
      return NextResponse.json(
        { status: 'error', message: 'File not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return NextResponse.json(
        { status: 'error', message: 'Not a file' },
        { status: 400, headers: corsHeaders }
      );
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isStreamable = STREAMABLE_EXTENSIONS.has(ext);

    const baseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Last-Modified': stats.mtime.toUTCString(),
      'ETag': `"${stats.size}-${stats.mtime.getTime()}"`,
      'Cache-Control': getCacheHeaders(ext),
    };

    const rangeHeader = request.headers.get('range');

    if (rangeHeader && isStreamable) {
      const range = parseRangeHeader(rangeHeader, stats.size);
      
      if (!range) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: {
            ...corsHeaders,
            'Content-Range': `bytes */${stats.size}`
          }
        });
      }

      const { start, end } = range;
      const chunkSize = end - start + 1;

      logger.debug('Streaming range request', { 
        path: relativePath, 
        range: `${start}-${end}`,
        chunkSize
      });

      const nodeStream = fs.createReadStream(fullPath, { 
        start, 
        end,
        highWaterMark: CHUNK_SIZE
      });
      const webStream = nodeStreamToWebStream(nodeStream);

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        }
      });
    }

    if (isStreamable && stats.size > CHUNK_SIZE) {
      logger.debug('Streaming full file', { 
        path: relativePath, 
        size: stats.size 
      });

      const nodeStream = fs.createReadStream(fullPath, {
        highWaterMark: CHUNK_SIZE
      });
      const webStream = nodeStreamToWebStream(nodeStream);

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Length': String(stats.size),
        }
      });
    }

    logger.debug('Serving small file directly', { 
      path: relativePath, 
      size: stats.size, 
      type: contentType 
    });

    const fileContent = fs.readFileSync(fullPath);
    
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(stats.size),
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error serving file', { error: errorMessage });

    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('origin') || undefined);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export const runtime = 'nodejs';

export const maxDuration = 120;
