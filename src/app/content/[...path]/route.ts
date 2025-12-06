/**
 * Static File Serving Route for Video Content
 * Serves HLS segments, playlists, and compressed video files
 * Route: /content/[year]/[month]/[postId]/[file]
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
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

    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
      'Accept-Ranges': 'bytes',
      'Last-Modified': stats.mtime.toUTCString(),
      'ETag': `"${stats.size}-${stats.mtime.getTime()}"`,
    };

    if (ext === '.m3u8') {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }

    const range = request.headers.get('range');
    if (range && (ext === '.mp4' || ext === '.ts')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = end - start + 1;

      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Content-Length'] = String(chunkSize);

      const stream = fs.createReadStream(fullPath, { start, end });
      const chunks: Buffer[] = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }

      const buffer = Buffer.concat(chunks);
      
      return new NextResponse(buffer, {
        status: 206,
        headers
      });
    }

    const fileContent = fs.readFileSync(fullPath);
    
    logger.debug('Serving file', { 
      path: relativePath, 
      size: stats.size, 
      type: contentType 
    });

    return new NextResponse(fileContent, {
      status: 200,
      headers
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
