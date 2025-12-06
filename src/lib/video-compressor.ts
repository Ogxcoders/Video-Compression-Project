/**
 * Video Compressor Module
 * Handles multi-quality video compression
 * Converted from PHP VideoCompressor.php
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { config } from './config';
import { createLogger } from './logger';
import { ensureDirectoryExists } from './utils';
import {
  getVideoInfo,
  compressVideo,
  formatBytes,
  CompressOptions
} from './ffmpeg';
import {
  VideoJobData,
  ValidationResult,
  DownloadResult,
  CompressionResult,
  VideoUrls,
  VideoPaths,
  VideoStats,
  JobResult,
  QUALITY_PRESETS,
  VIDEO_VALIDATION,
  ERROR_CODES
} from '../types';

const logger = createLogger('VIDEO-COMPRESSOR');

export async function downloadVideo(
  videoUrl: string,
  wpMediaPath: string = ''
): Promise<DownloadResult> {
  const cfg = config();

  logger.info('Starting video download', { url: videoUrl, wpMediaPath });

  const validationResult = validateDownloadUrl(videoUrl);
  if (!validationResult.valid) {
    logger.error('URL validation failed', { url: videoUrl, error: validationResult.error });
    return { success: false, error: validationResult.error };
  }

  const uploadsDir = cfg.media_uploads_dir;
  const uploadsDirResult = ensureDirectoryExists(uploadsDir);
  if (!uploadsDirResult.success) {
    logger.error('Failed to create uploads directory', { error: uploadsDirResult.error });
    return { success: false, error: uploadsDirResult.error };
  }

  let relativePath: string;
  if (wpMediaPath) {
    const wpMatch = wpMediaPath.match(/\/wp-content\/uploads\/(.+)$/) ||
                    wpMediaPath.match(/^\/?(wp-content\/uploads\/)?(.+)$/);
    relativePath = wpMatch ? (wpMatch[1] || wpMatch[2]) : wpMediaPath;
  } else {
    const parsedUrl = new URL(videoUrl);
    const pathMatch = parsedUrl.pathname.match(/\/wp-content\/uploads\/(.+)$/);
    if (pathMatch) {
      relativePath = pathMatch[1];
    } else {
      const filename = path.basename(parsedUrl.pathname);
      const now = new Date();
      relativePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`;
    }
  }

  relativePath = relativePath.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');

  const localPath = path.join(uploadsDir, relativePath);
  const localDir = path.dirname(localPath);

  const localDirResult = ensureDirectoryExists(localDir);
  if (!localDirResult.success) {
    logger.error('Failed to create local directory', { error: localDirResult.error });
    return { success: false, error: localDirResult.error };
  }

  logger.info('Downloading video', { url: videoUrl, localPath });

  return new Promise((resolve) => {
    const parsedUrl = new URL(videoUrl);
    const httpModule = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoCompressor/1.0)',
        'Accept': 'video/*,*/*'
      }
    };

    const file = fs.createWriteStream(localPath);

    const request = httpModule.get(videoUrl, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(localPath);
          downloadVideo(redirectUrl, wpMediaPath).then(resolve);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(localPath);
        logger.error('Download failed', { statusCode: response.statusCode });
        resolve({ success: false, error: `HTTP ${response.statusCode}` });
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();

        const stats = fs.statSync(localPath);
        if (stats.size < 1024) {
          fs.unlinkSync(localPath);
          logger.error('Downloaded file too small', { size: stats.size });
          resolve({ success: false, error: 'Downloaded file too small' });
          return;
        }

        logger.info('Video downloaded successfully', {
          localPath,
          size: formatBytes(stats.size)
        });

        resolve({
          success: true,
          local_path: localPath,
          relative_path: relativePath,
          file_size: stats.size
        });
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
      logger.error('Download error', { error: err.message });
      resolve({ success: false, error: err.message });
    });

    request.setTimeout(300000, () => {
      request.destroy();
      file.close();
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
      logger.error('Download timeout');
      resolve({ success: false, error: 'Download timeout' });
    });
  });
}

function validateDownloadUrl(url: string): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: 'URL is empty' };
  }

  try {
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'Only HTTP/HTTPS URLs are allowed' };
    }

    const host = parsedUrl.hostname.toLowerCase();

    const privatePatterns = [
      /^localhost$/i,
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
      /^192\.168\.\d{1,3}\.\d{1,3}$/,
      /^169\.254\.\d{1,3}\.\d{1,3}$/,
      /^0\.0\.0\.0$/,
      /\.internal$/i,
      /\.local$/i
    ];

    for (const pattern of privatePatterns) {
      if (pattern.test(host)) {
        return { valid: false, error: 'Private/internal hosts not allowed' };
      }
    }

    const cfg = config();
    const allowedDomains = cfg.allowed_download_domains;

    if (allowedDomains.includes('*')) {
      return { valid: true };
    }

    const domainAllowed = allowedDomains.some(allowed => {
      allowed = allowed.toLowerCase();
      if (allowed.startsWith('*.')) {
        const suffix = allowed.substring(2);
        return host === suffix || host.endsWith(`.${suffix}`);
      }
      return host === allowed || host.endsWith(`.${allowed}`);
    });

    if (!domainAllowed) {
      return { valid: false, error: `Domain '${host}' not in allowed list` };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export async function validateInputVideo(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    error_code: null,
    video_info: null
  };

  logger.info('Starting video validation', { path: path.basename(filePath) });

  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push(`Video file not found: ${filePath}`);
    result.error_code = ERROR_CODES.FILE_NOT_FOUND;
    return result;
  }

  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / (1024 * 1024);

  if (fileSizeMB > VIDEO_VALIDATION.MAX_SIZE_MB) {
    result.valid = false;
    result.errors.push(`File size ${fileSizeMB.toFixed(2)} MB exceeds maximum ${VIDEO_VALIDATION.MAX_SIZE_MB} MB`);
    result.error_code = ERROR_CODES.FILE_TOO_LARGE;
    return result;
  }

  const videoInfo = await getVideoInfo(filePath);
  result.video_info = videoInfo;

  if (videoInfo.corrupted || !videoInfo.valid) {
    result.valid = false;
    result.errors.push(`Video file is corrupted: ${videoInfo.error}`);
    result.error_code = ERROR_CODES.VIDEO_CORRUPTED;
    return result;
  }

  if (videoInfo.duration > VIDEO_VALIDATION.MAX_DURATION) {
    result.valid = false;
    result.errors.push(`Duration ${videoInfo.duration}s exceeds maximum ${VIDEO_VALIDATION.MAX_DURATION}s`);
    result.error_code = ERROR_CODES.DURATION_TOO_LONG;
    return result;
  }

  if (videoInfo.video_codec && !VIDEO_VALIDATION.ALLOWED_CODECS.includes(videoInfo.video_codec)) {
    result.valid = false;
    result.errors.push(`Codec '${videoInfo.video_codec}' not supported`);
    result.error_code = ERROR_CODES.INVALID_CODEC;
    return result;
  }

  logger.info('Video validation passed', {
    duration: `${videoInfo.duration}s`,
    size: `${fileSizeMB.toFixed(2)} MB`,
    codec: videoInfo.video_codec
  });

  return result;
}

export async function cleanupOldOutputs(paths: VideoPaths): Promise<void> {
  logger.info('Cleaning up old output files before re-compression', { outputDir: paths.output_dir });
  
  const filesToDelete = [
    paths.original,
    paths.compressed_480p,
    paths.compressed_360p,
    paths.compressed_240p,
    paths.compressed_144p
  ];
  
  for (const filePath of filesToDelete) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug('Deleted old file', { path: filePath });
      } catch (error) {
        logger.warning('Failed to delete old file', { 
          path: filePath, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }
  
  const hlsDir = path.join(paths.output_dir, 'hls');
  if (fs.existsSync(hlsDir)) {
    try {
      fs.rmSync(hlsDir, { recursive: true, force: true });
      logger.debug('Deleted old HLS directory', { path: hlsDir });
    } catch (error) {
      logger.warning('Failed to delete old HLS directory', { 
        path: hlsDir, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  const thumbnailPatterns = ['thumbnail.webp', 'thumbnail.jpg', 'thumbnail.png'];
  for (const pattern of thumbnailPatterns) {
    const thumbPath = path.join(paths.output_dir, pattern);
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath);
        logger.debug('Deleted old thumbnail', { path: thumbPath });
      } catch (error) {
        logger.warning('Failed to delete old thumbnail', { 
          path: thumbPath, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }
  
  logger.info('Old output cleanup completed');
}

export async function compressVideoJob(
  jobData: VideoJobData,
  onProgress?: (percent: number, stage: string) => void
): Promise<JobResult> {
  const { jobId, postId, wpMediaPath, wpVideoUrl, year, month } = jobData;

  logger.info('Starting compression job', { jobId, postId });

  try {
    const paths = buildPaths(postId, year, month, wpMediaPath);

    const outputDirResult = ensureDirectoryExists(paths.output_dir);
    if (!outputDirResult.success) {
      throw new Error(`Failed to create output directory: ${outputDirResult.error}`);
    }

    await cleanupOldOutputs(paths);

    let sourcePath = paths.source;

    if (!fs.existsSync(sourcePath) && wpVideoUrl) {
      logger.info('Source not found locally, downloading', { url: wpVideoUrl });
      onProgress?.(0, 'downloading');

      const downloadResult = await downloadVideo(wpVideoUrl, wpMediaPath);
      if (!downloadResult.success || !downloadResult.local_path) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }
      sourcePath = downloadResult.local_path;
    }

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source video not found: ${sourcePath}`);
    }

    onProgress?.(25, 'validating');
    const validation = await validateInputVideo(sourcePath);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    const sourceSize = fs.statSync(sourcePath).size;
    const startTime = Date.now();

    fs.copyFileSync(sourcePath, paths.original);

    onProgress?.(25, 'compressing');

    const compressionResults: Record<string, CompressionResult> = {};
    const qualities = ['480p', '360p', '240p', '144p'];
    const progressPerQuality = 12;

    for (let qualityIndex = 0; qualityIndex < qualities.length; qualityIndex++) {
      const quality = qualities[qualityIndex];
      const preset = QUALITY_PRESETS[quality];
      const outputPath = paths[`compressed_${quality}` as keyof VideoPaths] as string;

      const options: CompressOptions = {
        ...preset,
        quality
      };

      const progressBase = 25 + (qualityIndex * progressPerQuality);
      const result = await compressVideo(sourcePath, outputPath, options, (percent) => {
        const overallProgress = progressBase + Math.round((percent / 100) * progressPerQuality);
        const milestone = overallProgress >= 75 ? 75 : overallProgress >= 50 ? 50 : overallProgress >= 25 ? 25 : 0;
        onProgress?.(milestone, `compressing_${quality}`);
      });

      compressionResults[quality] = {
        success: result.success,
        quality,
        time: result.time,
        error: result.error
      };
    }

    const successfulQualities = Object.entries(compressionResults)
      .filter(([, r]) => r.success)
      .map(([q]) => q);

    if (successfulQualities.length === 0) {
      throw new Error('All quality compressions failed');
    }

    const urls: VideoUrls = {};
    const qualityStats: Record<string, { size: number; compression_ratio: number; time: number }> = {};

    for (const quality of successfulQualities) {
      const outputPath = paths[`compressed_${quality}` as keyof VideoPaths] as string;
      if (fs.existsSync(outputPath)) {
        const size = fs.statSync(outputPath).size;
        urls[`compressed_${quality}` as keyof VideoUrls] = buildPublicUrl(outputPath);
        qualityStats[quality] = {
          size,
          compression_ratio: Math.round(((sourceSize - size) / sourceSize) * 10000) / 100,
          time: compressionResults[quality].time
        };
      }
    }

    const processingTime = (Date.now() - startTime) / 1000;
    const primaryPath = paths.compressed_480p || '';
    const compressedSize = primaryPath && fs.existsSync(primaryPath) ? fs.statSync(primaryPath).size : 0;

    const stats: VideoStats = {
      original_size: sourceSize,
      compressed_size: compressedSize,
      compression_ratio: Math.round(((sourceSize - compressedSize) / sourceSize) * 10000) / 100,
      duration: validation.video_info?.duration || 0,
      processing_time: processingTime,
      quality_stats: qualityStats
    };

    logger.info('Compression job completed', {
      jobId,
      postId,
      qualities: successfulQualities,
      processingTime: `${processingTime.toFixed(2)}s`
    });

    onProgress?.(75, 'finalizing');

    return {
      success: true,
      message: 'Video compression completed successfully',
      urls,
      paths,
      stats,
      jobId,
      postId
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Compression job failed', { jobId, postId, error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      jobId,
      postId
    };
  }
}

function buildPaths(postId: number, year: number, month: number, wpMediaPath: string): VideoPaths {
  const cfg = config();

  if (postId <= 0 || year < 2000 || year > 2100 || month < 1 || month > 12) {
    throw new Error('Invalid postId, year, or month');
  }

  const sanitizedPath = wpMediaPath
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/\x00/g, '');

  let relativePath: string;
  const wpMatch = sanitizedPath.match(/\/wp-content\/uploads\/(.+)$/);
  if (wpMatch) {
    relativePath = wpMatch[1];
  } else {
    relativePath = sanitizedPath.replace(/^\/?(wp-content\/uploads\/)?/, '');
  }

  const sourcePath = path.join(cfg.media_uploads_dir, relativePath);
  const outputDir = path.join(
    cfg.media_content_dir,
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(postId)
  );

  return {
    source: sourcePath,
    original: path.join(outputDir, 'original.mp4'),
    output_dir: outputDir,
    compressed_480p: path.join(outputDir, 'compressed_480p.mp4'),
    compressed_360p: path.join(outputDir, 'compressed_360p.mp4'),
    compressed_240p: path.join(outputDir, 'compressed_240p.mp4'),
    compressed_144p: path.join(outputDir, 'compressed_144p.mp4')
  };
}

function buildPublicUrl(filePath: string): string {
  const cfg = config();
  const contentDir = cfg.media_content_dir;

  const normalizedFilePath = path.resolve(filePath);
  const normalizedContentDir = path.resolve(contentDir);

  if (!normalizedFilePath.startsWith(normalizedContentDir)) {
    logger.warning('File outside content directory', { filePath, contentDir });
    return '';
  }

  const relativePath = normalizedFilePath.substring(normalizedContentDir.length);
  return `${cfg.base_url}/content${relativePath.replace(/\\/g, '/')}`;
}

export default {
  downloadVideo,
  validateInputVideo,
  compressVideoJob,
  cleanupOldOutputs
};
