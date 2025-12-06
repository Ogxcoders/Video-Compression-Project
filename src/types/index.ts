/**
 * TypeScript Types for Video Compression API
 * Converted from PHP VPS-API project
 */

export interface VideoJobData {
  jobId: string;
  postId: number;
  wpMediaPath: string;
  wpVideoUrl: string;
  wpThumbnailPath?: string;
  wpThumbnailUrl?: string;
  wpPostUrl?: string;
  year: number;
  month: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  attempts?: number;
  error?: string;
  result?: JobResult;
}

export type JobStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'dead_letter';

export interface JobResult {
  success: boolean;
  message?: string;
  error?: string;
  skipped?: boolean;
  urls?: VideoUrls;
  paths?: VideoPaths;
  stats?: VideoStats;
  hlsUrls?: HLSUrls;
  thumbnailUrl?: string;
  thumbnailStats?: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
  jobId: string;
  postId: number;
}

export interface VideoUrls {
  compressed_480p?: string;
  compressed_360p?: string;
  compressed_240p?: string;
  compressed_144p?: string;
  thumbnail_webp?: string;
}

export interface VideoPaths {
  source: string;
  original: string;
  output_dir: string;
  compressed_480p?: string;
  compressed_360p?: string;
  compressed_240p?: string;
  compressed_144p?: string;
}

export interface VideoStats {
  original_size: number;
  compressed_size: number;
  compression_ratio: number;
  duration: number;
  processing_time: number;
  quality_stats?: QualityStats;
}

export interface QualityStats {
  [quality: string]: {
    size: number;
    compression_ratio: number;
    time: number;
  };
}

export interface HLSUrls {
  master: string;
  '480p'?: string;
  '360p'?: string;
  '240p'?: string;
  '144p'?: string;
}

export interface QualityPreset {
  width: number;
  height: number;
  bitrate: string;
  maxrate: string;
  bufsize: string;
}

export interface HLSQuality {
  resolution: string;
  bandwidth: number;
  avg_bandwidth: number;
  codecs: string;
}

export interface VideoInfo {
  valid: boolean;
  corrupted: boolean;
  error: string | null;
  duration: number;
  video_codec: string | null;
  audio_codec: string | null;
  container: string | null;
  width: number;
  height: number;
  resolution: string | null;
  bitrate: number;
  frame_rate: string | null;
  frame_rate_numeric: number;
  file_size: number;
  file_size_mb: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  error_code: string | null;
  video_info: VideoInfo | null;
}

export interface CompressionResult {
  success: boolean;
  quality: string;
  time: number;
  error?: string;
  output?: string;
}

export interface HLSConversionResult {
  success: boolean;
  hls_master_url?: string;
  hls_urls?: HLSUrls;
  hls_dir?: string;
  qualities?: string[];
  segment_duration?: number;
  error?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead_letter: number;
}

export interface APIResponse<T = unknown> {
  status: 'success' | 'error' | 'accepted';
  message: string;
  data?: T;
  error?: string;
  code?: string;
}

export interface CompressRequest {
  postId: number;
  wpMediaPath: string;
  wpVideoUrl?: string;
  wpThumbnailPath?: string;
  wpThumbnailUrl?: string;
  wpPostUrl?: string;
  year: number;
  month: number;
}

export interface WebhookPayload {
  jobId: string;
  postId: number;
  status: JobStatus;
  progress?: number;
  stage?: string;
  result?: JobResult;
  error?: string;
  timestamp: string;
  compressed480pUrl?: string;
  compressed360pUrl?: string;
  compressed240pUrl?: string;
  compressed144pUrl?: string;
  compressedThumbnailWebp?: string;
  hlsMasterUrl?: string;
  hls_480p?: string;
  hls_360p?: string;
  hls_240p?: string;
  hls_144p?: string;
  original_size?: number;
  compressed_size?: number;
  compression_ratio?: number;
  duration?: number;
  processing_time?: number;
  thumbnail_stats?: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}

export interface DownloadResult {
  success: boolean;
  local_path?: string;
  relative_path?: string;
  file_size?: number;
  error?: string;
}

export interface Config {
  api_key: string;
  allowed_origins: string[];
  base_url: string;
  ffmpeg_binary: string;
  ffmpeg_timeout: number;
  media_uploads_dir: string;
  media_content_dir: string;
  log_file: string;
  debug: boolean;
  hls_time: number;
  cleanup_original: boolean;
  max_video_age_days: number;
  parallel_compression: boolean;
  parallel_limit: number;
  thumbnail_quality: number;
  thumbnail_max_width: number;
  thumbnail_max_height: number;
  wordpress_webhook_url: string;
  allowed_download_domains: string[];
  verify_ssl_downloads: boolean;
  redis: {
    host: string;
    port: number;
    password?: string;
    database: number;
  };
  admin_password: string;
  resolutions: {
    [key: string]: {
      scale: string;
      bitrate: string;
      maxrate: string;
      bufsize: string;
    };
  };
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
  '480p': {
    width: 854,
    height: 480,
    bitrate: '800k',
    maxrate: '1200k',
    bufsize: '2400k'
  },
  '360p': {
    width: 640,
    height: 360,
    bitrate: '500k',
    maxrate: '750k',
    bufsize: '1500k'
  },
  '240p': {
    width: 426,
    height: 240,
    bitrate: '300k',
    maxrate: '450k',
    bufsize: '900k'
  },
  '144p': {
    width: 256,
    height: 144,
    bitrate: '150k',
    maxrate: '225k',
    bufsize: '450k'
  }
};

export const HLS_QUALITIES: Record<string, HLSQuality> = {
  '480p': {
    resolution: '854x480',
    bandwidth: 1300000,
    avg_bandwidth: 900000,
    codecs: 'avc1.4d001f,mp4a.40.2'
  },
  '360p': {
    resolution: '640x360',
    bandwidth: 850000,
    avg_bandwidth: 600000,
    codecs: 'avc1.4d001f,mp4a.40.2'
  },
  '240p': {
    resolution: '426x240',
    bandwidth: 550000,
    avg_bandwidth: 400000,
    codecs: 'avc1.4d0015,mp4a.40.2'
  },
  '144p': {
    resolution: '256x144',
    bandwidth: 325000,
    avg_bandwidth: 250000,
    codecs: 'avc1.4d000d,mp4a.40.2'
  }
};

export const VIDEO_VALIDATION = {
  MAX_DURATION: 300,
  MAX_SIZE_MB: 100,
  ALLOWED_CODECS: ['h264', 'hevc', 'h265', 'vp8', 'vp9', 'prores', 'mpeg4', 'av1'],
  ALLOWED_CONTAINERS: ['mp4', 'mov', 'webm', 'mkv']
};

export const ERROR_CODES = {
  DURATION_TOO_LONG: 'DURATION_TOO_LONG',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_CODEC: 'INVALID_CODEC',
  VIDEO_CORRUPTED: 'VIDEO_CORRUPTED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INVALID_CONTAINER: 'INVALID_CONTAINER',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED'
};
