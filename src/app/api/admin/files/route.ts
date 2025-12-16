import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { config } from '@/lib/config';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API-FILES');

interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
  url?: string;
  children?: FileEntry[];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

function getDirectoryTree(
  dir: string, 
  baseDir: string, 
  baseUrl: string,
  maxDepth: number = 4, 
  currentDepth: number = 0
): FileEntry[] {
  const entries: FileEntry[] = [];
  
  if (!fs.existsSync(dir) || currentDepth >= maxDepth) {
    return entries;
  }
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stats = fs.statSync(fullPath);
        const relativePath = path.relative(baseDir, fullPath);
        
        const entry: FileEntry = {
          name: item,
          path: fullPath,
          relativePath: relativePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        };
        
        if (stats.isDirectory()) {
          entry.children = getDirectoryTree(fullPath, baseDir, baseUrl, maxDepth, currentDepth + 1);
          entry.size = entry.children.reduce((sum, child) => sum + child.size, 0);
        } else {
          entry.url = `${baseUrl}/content/${relativePath.replace(/\\/g, '/')}`;
        }
        
        entries.push(entry);
      } catch {
        continue;
      }
    }
    
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return b.isDirectory ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
    
  } catch (error) {
    logger.error('Error reading directory', { dir, error: String(error) });
  }
  
  return entries;
}

function getDirectoryStats(dir: string): { totalSize: number; fileCount: number; folderCount: number } {
  let totalSize = 0;
  let fileCount = 0;
  let folderCount = 0;
  
  if (!fs.existsSync(dir)) {
    return { totalSize, fileCount, folderCount };
  }
  
  function walkDir(currentDir: string) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            folderCount++;
            walkDir(fullPath);
          } else {
            fileCount++;
            totalSize += stats.size;
          }
        } catch {
          continue;
        }
      }
    } catch {
      return;
    }
  }
  
  walkDir(dir);
  return { totalSize, fileCount, folderCount };
}

export async function GET(request: NextRequest) {
  const cfg = config();
  
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== cfg.api_key) {
    logger.warning('Invalid API key for files request');
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const subPath = searchParams.get('path') || '';
    const maxDepth = parseInt(searchParams.get('depth') || '6', 10);
    
    const contentDir = cfg.media_content_dir;
    const targetDir = subPath ? path.join(contentDir, subPath) : contentDir;
    
    const normalizedContentDir = path.resolve(contentDir);
    const normalizedTargetDir = path.resolve(targetDir);
    
    if (!normalizedTargetDir.startsWith(normalizedContentDir)) {
      return NextResponse.json(
        { status: 'error', message: 'Access denied - path traversal detected' },
        { status: 403 }
      );
    }
    
    if (!fs.existsSync(targetDir)) {
      return NextResponse.json({
        status: 'success',
        data: {
          path: subPath || '/',
          entries: [],
          stats: { totalSize: 0, totalSizeFormatted: '0 B', fileCount: 0, folderCount: 0 }
        }
      });
    }
    
    const entries = getDirectoryTree(targetDir, contentDir, cfg.base_url, maxDepth);
    const stats = getDirectoryStats(targetDir);
    
    logger.info('Files list retrieved', { path: subPath || '/', entries: entries.length });
    
    return NextResponse.json({
      status: 'success',
      data: {
        path: subPath || '/',
        baseUrl: cfg.base_url,
        contentDir: contentDir,
        entries,
        stats: {
          ...stats,
          totalSizeFormatted: formatBytes(stats.totalSize)
        }
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list files', { error: errorMessage });
    
    return NextResponse.json(
      { status: 'error', message: 'Failed to list files', error: errorMessage },
      { status: 500 }
    );
  }
}
