import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { config } from '@/lib/config';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API-LOGS');

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

function getLastNLines(filePath: string, n: number): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    return lines.slice(-n);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const cfg = config();
  
  const headerApiKey = request.headers.get('X-API-Key');
  const queryApiKey = request.nextUrl.searchParams.get('apiKey');
  const apiKey = headerApiKey || queryApiKey;
  
  if (!apiKey || apiKey !== cfg.api_key) {
    logger.warning('Invalid API key for logs request');
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const download = searchParams.get('download') === '1' || searchParams.get('download') === 'true';
    const lines = parseInt(searchParams.get('lines') || '200', 10);
    const filter = searchParams.get('filter') || '';
    
    const logFile = cfg.log_file;
    
    if (!fs.existsSync(logFile)) {
      if (download) {
        return new NextResponse('Log file not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      return NextResponse.json({
        status: 'success',
        data: {
          logs: [],
          file: logFile,
          size: 0,
          sizeFormatted: '0 B',
          lineCount: 0
        }
      });
    }
    
    const stats = fs.statSync(logFile);
    
    if (download) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const filename = `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
      
      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(stats.size)
        }
      });
    }
    
    let logLines = getLastNLines(logFile, lines);
    
    if (filter) {
      const filterLower = filter.toLowerCase();
      logLines = logLines.filter(line => line.toLowerCase().includes(filterLower));
    }
    
    logLines.reverse();
    
    const content = fs.readFileSync(logFile, 'utf-8');
    const totalLines = content.split('\n').filter(line => line.trim()).length;
    
    return NextResponse.json({
      status: 'success',
      data: {
        logs: logLines,
        file: path.basename(logFile),
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        lineCount: totalLines,
        displayedLines: logLines.length,
        lastModified: stats.mtime.toISOString()
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to read logs', { error: errorMessage });
    
    return NextResponse.json(
      { status: 'error', message: 'Failed to read logs', error: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const cfg = config();
  
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== cfg.api_key) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    const logFile = cfg.log_file;
    
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '', 'utf-8');
      logger.info('Log file cleared');
    }
    
    return NextResponse.json({
      status: 'success',
      message: 'Log file cleared successfully'
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to clear logs', { error: errorMessage });
    
    return NextResponse.json(
      { status: 'error', message: 'Failed to clear logs', error: errorMessage },
      { status: 500 }
    );
  }
}
