/**
 * HLS Converter Module
 * Converts MP4 videos to HLS format with adaptive bitrate streaming
 * Converted from PHP HLSConverter.php
 */

import fs from 'fs';
import path from 'path';
import { config } from './config';
import { createLogger } from './logger';
import { convertToHLS, getVideoInfo } from './ffmpeg';
import { HLSUrls, HLSConversionResult, VideoPaths, HLS_QUALITIES } from '../types';

const logger = createLogger('HLS-CONVERTER');

function getHlsSegmentDuration(): number {
  const cfg = config();
  // Ensure segment duration is 2-3 seconds for faster quality switching
  const duration = cfg.hls_time || 2;
  return Math.min(Math.max(duration, 2), 3);
}

// Disable re-encoding - MP4s are already properly encoded with keyframes
// This ensures consistent resolution and faster processing
const HLS_REENCODE_SEGMENTS = false;

export async function convertToHLSStreaming(
  paths: VideoPaths,
  postId: number,
  year: number,
  month: number
): Promise<HLSConversionResult> {
  const HLS_SEGMENT_DURATION = getHlsSegmentDuration();
  logger.info('Starting HLS conversion', { postId, reencode: HLS_REENCODE_SEGMENTS, segmentDuration: HLS_SEGMENT_DURATION });

  try {
    const hlsDir = path.join(paths.output_dir, 'hls');

    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }

    const qualities = ['480p', '360p', '240p', '144p'];
    const convertedQualities: Record<string, { playlist: string; segmentCount: number; mp4Path: string }> = {};
    const availableQualities: string[] = [];

    for (const quality of qualities) {
      const mp4Path = paths[`compressed_${quality}` as keyof VideoPaths] as string | undefined;

      if (!mp4Path) {
        logger.warning(`Skipping ${quality} - path not provided`, { quality });
        continue;
      }

      if (!fs.existsSync(mp4Path)) {
        logger.warning(`Skipping ${quality} - file not found`, { path: mp4Path });
        continue;
      }

      logger.info(`Converting ${quality} to HLS`, { source: path.basename(mp4Path), reencode: HLS_REENCODE_SEGMENTS });

      const result = await convertToHLS(mp4Path, hlsDir, quality, HLS_SEGMENT_DURATION, HLS_REENCODE_SEGMENTS);

      if (result.success && result.playlist && result.segmentCount) {
        convertedQualities[quality] = {
          playlist: result.playlist,
          segmentCount: result.segmentCount,
          mp4Path: mp4Path
        };
        availableQualities.push(quality);
        logger.info(`${quality} HLS conversion completed`, {
          segments: result.segmentCount
        });
      } else {
        logger.error(`${quality} HLS conversion failed`, { error: result.error });
      }
    }

    if (availableQualities.length === 0) {
      throw new Error('No quality levels were successfully converted to HLS');
    }

    logger.info('Generating master.m3u8 playlist', { qualities: availableQualities });

    const masterResult = await generateMasterPlaylist(hlsDir, convertedQualities);

    if (!masterResult.success) {
      throw new Error(`Failed to generate master playlist: ${masterResult.error}`);
    }

    const hlsMasterUrl = buildHLSUrl(postId, year, month, 'master.m3u8');

    const hlsUrls: HLSUrls = {
      master: hlsMasterUrl
    };

    for (const quality of availableQualities) {
      hlsUrls[quality as keyof Omit<HLSUrls, 'master'>] = buildHLSUrl(postId, year, month, `${quality}.m3u8`);
    }

    const totalSegments = Object.values(convertedQualities).reduce(
      (sum, q) => sum + q.segmentCount,
      0
    );

    logger.info('HLS conversion completed', {
      masterUrl: hlsMasterUrl,
      qualities: availableQualities,
      totalSegments
    });

    return {
      success: true,
      hls_master_url: hlsMasterUrl,
      hls_urls: hlsUrls,
      hls_dir: hlsDir,
      qualities: availableQualities,
      segment_duration: HLS_SEGMENT_DURATION
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('HLS conversion failed', { error: errorMessage });

    return {
      success: false,
      error: errorMessage
    };
  }
}

async function generateMasterPlaylist(
  hlsDir: string,
  convertedQualities: Record<string, { playlist: string; segmentCount: number; mp4Path: string }>
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const masterPath = path.join(hlsDir, 'master.m3u8');

    let content = '#EXTM3U\n';
    content += '#EXT-X-VERSION:3\n';
    content += '\n';

    const qualityOrder = ['144p', '240p', '360p', '480p'];

    for (const quality of qualityOrder) {
      if (!convertedQualities[quality]) {
        continue;
      }

      const hlsConfig = HLS_QUALITIES[quality];
      const qualityData = convertedQualities[quality];
      
      // Get actual resolution from the compressed MP4 file
      // This ensures resolution matches the actual video, not hardcoded values
      let actualResolution = hlsConfig.resolution;
      try {
        const videoInfo = await getVideoInfo(qualityData.mp4Path);
        if (videoInfo.valid && videoInfo.width > 0 && videoInfo.height > 0) {
          actualResolution = `${videoInfo.width}x${videoInfo.height}`;
          logger.info(`Using actual resolution for ${quality}`, { 
            expected: hlsConfig.resolution, 
            actual: actualResolution 
          });
        }
      } catch (err) {
        logger.warning(`Could not get actual resolution for ${quality}, using default`, { 
          error: err instanceof Error ? err.message : String(err) 
        });
      }

      content += `#EXT-X-STREAM-INF:BANDWIDTH=${hlsConfig.bandwidth},`;
      content += `AVERAGE-BANDWIDTH=${hlsConfig.avg_bandwidth},`;
      content += `RESOLUTION=${actualResolution},`;
      content += `CODECS="${hlsConfig.codecs}",`;
      content += `NAME="${quality}"\n`;
      content += `${quality}.m3u8\n`;
    }

    fs.writeFileSync(masterPath, content, { mode: 0o644 });

    logger.info('Master playlist generated', {
      path: masterPath,
      qualities: Object.keys(convertedQualities)
    });

    return {
      success: true,
      path: masterPath
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage
    };
  }
}

function buildHLSUrl(postId: number, year: number, month: number, filename: string): string {
  const cfg = config();
  const baseUrl = cfg.base_url.replace(/\/$/, '');
  
  return `${baseUrl}/content/${String(year).padStart(4, '0')}/${String(month).padStart(2, '0')}/${postId}/hls/${filename}`;
}

export function hlsExists(outputDir: string): boolean {
  const masterPath = path.join(outputDir, 'hls', 'master.m3u8');
  return fs.existsSync(masterPath);
}

export function getExistingHLSUrls(
  outputDir: string,
  postId: number,
  year: number,
  month: number
): HLSUrls | null {
  const hlsDir = path.join(outputDir, 'hls');
  const masterPath = path.join(hlsDir, 'master.m3u8');

  if (!fs.existsSync(masterPath)) {
    return null;
  }

  const hlsUrls: HLSUrls = {
    master: buildHLSUrl(postId, year, month, 'master.m3u8')
  };

  const qualities = ['480p', '360p', '240p', '144p'];
  for (const quality of qualities) {
    const playlistPath = path.join(hlsDir, `${quality}.m3u8`);
    if (fs.existsSync(playlistPath)) {
      hlsUrls[quality as keyof Omit<HLSUrls, 'master'>] = buildHLSUrl(postId, year, month, `${quality}.m3u8`);
    }
  }

  return hlsUrls;
}

export default {
  convertToHLSStreaming,
  hlsExists,
  getExistingHLSUrls
};
