import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  let buildId = 'unknown';
  let buildTime = 'unknown';
  
  try {
    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
    if (fs.existsSync(buildIdPath)) {
      buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
    }
    
    const stats = fs.statSync(buildIdPath);
    buildTime = stats.mtime.toISOString();
  } catch (e) {
    console.error('Failed to read build info:', e);
  }
  
  const cssFiles: string[] = [];
  const jsFiles: string[] = [];
  
  try {
    const staticCssPath = path.join(process.cwd(), '.next', 'static', 'css');
    if (fs.existsSync(staticCssPath)) {
      const files = fs.readdirSync(staticCssPath);
      cssFiles.push(...files.filter(f => f.endsWith('.css')));
    }
    
    const staticChunksPath = path.join(process.cwd(), '.next', 'static', 'chunks');
    if (fs.existsSync(staticChunksPath)) {
      const files = fs.readdirSync(staticChunksPath);
      jsFiles.push(...files.filter(f => f.endsWith('.js')).slice(0, 10));
    }
  } catch (e) {
    console.error('Failed to read static files:', e);
  }

  return NextResponse.json({
    status: 'ok',
    buildId,
    buildTime,
    nodeEnv: process.env.NODE_ENV,
    staticFiles: {
      css: cssFiles,
      jsChunks: jsFiles
    },
    timestamp: new Date().toISOString()
  });
}
