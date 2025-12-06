"use strict";
/**
 * Video Compressor Module
 * Handles multi-quality video compression
 * Converted from PHP VideoCompressor.php
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadVideo = downloadVideo;
exports.validateInputVideo = validateInputVideo;
exports.cleanupOldOutputs = cleanupOldOutputs;
exports.compressVideoJob = compressVideoJob;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const config_1 = require("./config");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const ffmpeg_1 = require("./ffmpeg");
const types_1 = require("../types");
const logger = (0, logger_1.createLogger)('VIDEO-COMPRESSOR');
async function downloadVideo(videoUrl, wpMediaPath = '') {
    const cfg = (0, config_1.config)();
    logger.info('Starting video download', { url: videoUrl, wpMediaPath });
    const validationResult = validateDownloadUrl(videoUrl);
    if (!validationResult.valid) {
        logger.error('URL validation failed', { url: videoUrl, error: validationResult.error });
        return { success: false, error: validationResult.error };
    }
    const uploadsDir = cfg.media_uploads_dir;
    const uploadsDirResult = (0, utils_1.ensureDirectoryExists)(uploadsDir);
    if (!uploadsDirResult.success) {
        logger.error('Failed to create uploads directory', { error: uploadsDirResult.error });
        return { success: false, error: uploadsDirResult.error };
    }
    let relativePath;
    if (wpMediaPath) {
        const wpMatch = wpMediaPath.match(/\/wp-content\/uploads\/(.+)$/) ||
            wpMediaPath.match(/^\/?(wp-content\/uploads\/)?(.+)$/);
        relativePath = wpMatch ? (wpMatch[1] || wpMatch[2]) : wpMediaPath;
    }
    else {
        const parsedUrl = new url_1.URL(videoUrl);
        const pathMatch = parsedUrl.pathname.match(/\/wp-content\/uploads\/(.+)$/);
        if (pathMatch) {
            relativePath = pathMatch[1];
        }
        else {
            const filename = path_1.default.basename(parsedUrl.pathname);
            const now = new Date();
            relativePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`;
        }
    }
    relativePath = relativePath.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
    const localPath = path_1.default.join(uploadsDir, relativePath);
    const localDir = path_1.default.dirname(localPath);
    const localDirResult = (0, utils_1.ensureDirectoryExists)(localDir);
    if (!localDirResult.success) {
        logger.error('Failed to create local directory', { error: localDirResult.error });
        return { success: false, error: localDirResult.error };
    }
    logger.info('Downloading video', { url: videoUrl, localPath });
    return new Promise((resolve) => {
        const parsedUrl = new url_1.URL(videoUrl);
        const httpModule = parsedUrl.protocol === 'https:' ? https_1.default : http_1.default;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; VideoCompressor/1.0)',
                'Accept': 'video/*,*/*'
            }
        };
        const file = fs_1.default.createWriteStream(localPath);
        const request = httpModule.get(videoUrl, options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    fs_1.default.unlinkSync(localPath);
                    downloadVideo(redirectUrl, wpMediaPath).then(resolve);
                    return;
                }
            }
            if (response.statusCode !== 200) {
                file.close();
                fs_1.default.unlinkSync(localPath);
                logger.error('Download failed', { statusCode: response.statusCode });
                resolve({ success: false, error: `HTTP ${response.statusCode}` });
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                const stats = fs_1.default.statSync(localPath);
                if (stats.size < 1024) {
                    fs_1.default.unlinkSync(localPath);
                    logger.error('Downloaded file too small', { size: stats.size });
                    resolve({ success: false, error: 'Downloaded file too small' });
                    return;
                }
                logger.info('Video downloaded successfully', {
                    localPath,
                    size: (0, ffmpeg_1.formatBytes)(stats.size)
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
            if (fs_1.default.existsSync(localPath)) {
                fs_1.default.unlinkSync(localPath);
            }
            logger.error('Download error', { error: err.message });
            resolve({ success: false, error: err.message });
        });
        request.setTimeout(300000, () => {
            request.destroy();
            file.close();
            if (fs_1.default.existsSync(localPath)) {
                fs_1.default.unlinkSync(localPath);
            }
            logger.error('Download timeout');
            resolve({ success: false, error: 'Download timeout' });
        });
    });
}
function validateDownloadUrl(url) {
    if (!url) {
        return { valid: false, error: 'URL is empty' };
    }
    try {
        const parsedUrl = new url_1.URL(url);
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
        const cfg = (0, config_1.config)();
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
    }
    catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}
async function validateInputVideo(filePath) {
    const result = {
        valid: true,
        errors: [],
        error_code: null,
        video_info: null
    };
    logger.info('Starting video validation', { path: path_1.default.basename(filePath) });
    if (!fs_1.default.existsSync(filePath)) {
        result.valid = false;
        result.errors.push(`Video file not found: ${filePath}`);
        result.error_code = types_1.ERROR_CODES.FILE_NOT_FOUND;
        return result;
    }
    const stats = fs_1.default.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > types_1.VIDEO_VALIDATION.MAX_SIZE_MB) {
        result.valid = false;
        result.errors.push(`File size ${fileSizeMB.toFixed(2)} MB exceeds maximum ${types_1.VIDEO_VALIDATION.MAX_SIZE_MB} MB`);
        result.error_code = types_1.ERROR_CODES.FILE_TOO_LARGE;
        return result;
    }
    const videoInfo = await (0, ffmpeg_1.getVideoInfo)(filePath);
    result.video_info = videoInfo;
    if (videoInfo.corrupted || !videoInfo.valid) {
        result.valid = false;
        result.errors.push(`Video file is corrupted: ${videoInfo.error}`);
        result.error_code = types_1.ERROR_CODES.VIDEO_CORRUPTED;
        return result;
    }
    if (videoInfo.duration > types_1.VIDEO_VALIDATION.MAX_DURATION) {
        result.valid = false;
        result.errors.push(`Duration ${videoInfo.duration}s exceeds maximum ${types_1.VIDEO_VALIDATION.MAX_DURATION}s`);
        result.error_code = types_1.ERROR_CODES.DURATION_TOO_LONG;
        return result;
    }
    if (videoInfo.video_codec && !types_1.VIDEO_VALIDATION.ALLOWED_CODECS.includes(videoInfo.video_codec)) {
        result.valid = false;
        result.errors.push(`Codec '${videoInfo.video_codec}' not supported`);
        result.error_code = types_1.ERROR_CODES.INVALID_CODEC;
        return result;
    }
    logger.info('Video validation passed', {
        duration: `${videoInfo.duration}s`,
        size: `${fileSizeMB.toFixed(2)} MB`,
        codec: videoInfo.video_codec
    });
    return result;
}
async function cleanupOldOutputs(paths) {
    logger.info('Cleaning up old output files before re-compression', { outputDir: paths.output_dir });
    const filesToDelete = [
        paths.original,
        paths.compressed_480p,
        paths.compressed_360p,
        paths.compressed_240p,
        paths.compressed_144p
    ];
    for (const filePath of filesToDelete) {
        if (filePath && fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
                logger.debug('Deleted old file', { path: filePath });
            }
            catch (error) {
                logger.warning('Failed to delete old file', {
                    path: filePath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    const hlsDir = path_1.default.join(paths.output_dir, 'hls');
    if (fs_1.default.existsSync(hlsDir)) {
        try {
            fs_1.default.rmSync(hlsDir, { recursive: true, force: true });
            logger.debug('Deleted old HLS directory', { path: hlsDir });
        }
        catch (error) {
            logger.warning('Failed to delete old HLS directory', {
                path: hlsDir,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const thumbnailPatterns = ['thumbnail.webp', 'thumbnail.jpg', 'thumbnail.png'];
    for (const pattern of thumbnailPatterns) {
        const thumbPath = path_1.default.join(paths.output_dir, pattern);
        if (fs_1.default.existsSync(thumbPath)) {
            try {
                fs_1.default.unlinkSync(thumbPath);
                logger.debug('Deleted old thumbnail', { path: thumbPath });
            }
            catch (error) {
                logger.warning('Failed to delete old thumbnail', {
                    path: thumbPath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    logger.info('Old output cleanup completed');
}
async function compressVideoJob(jobData, onProgress) {
    const { jobId, postId, wpMediaPath, wpVideoUrl, year, month } = jobData;
    logger.info('Starting compression job', { jobId, postId });
    try {
        const paths = buildPaths(postId, year, month, wpMediaPath);
        const outputDirResult = (0, utils_1.ensureDirectoryExists)(paths.output_dir);
        if (!outputDirResult.success) {
            throw new Error(`Failed to create output directory: ${outputDirResult.error}`);
        }
        await cleanupOldOutputs(paths);
        let sourcePath = paths.source;
        if (!fs_1.default.existsSync(sourcePath) && wpVideoUrl) {
            logger.info('Source not found locally, downloading', { url: wpVideoUrl });
            onProgress?.(0, 'downloading');
            const downloadResult = await downloadVideo(wpVideoUrl, wpMediaPath);
            if (!downloadResult.success || !downloadResult.local_path) {
                throw new Error(`Download failed: ${downloadResult.error}`);
            }
            sourcePath = downloadResult.local_path;
        }
        if (!fs_1.default.existsSync(sourcePath)) {
            throw new Error(`Source video not found: ${sourcePath}`);
        }
        onProgress?.(25, 'validating');
        const validation = await validateInputVideo(sourcePath);
        if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
        }
        const sourceSize = fs_1.default.statSync(sourcePath).size;
        const startTime = Date.now();
        fs_1.default.copyFileSync(sourcePath, paths.original);
        onProgress?.(25, 'compressing');
        const compressionResults = {};
        const qualities = ['480p', '360p', '240p', '144p'];
        const progressPerQuality = 12;
        for (let qualityIndex = 0; qualityIndex < qualities.length; qualityIndex++) {
            const quality = qualities[qualityIndex];
            const preset = types_1.QUALITY_PRESETS[quality];
            const outputPath = paths[`compressed_${quality}`];
            const options = {
                ...preset,
                quality
            };
            const progressBase = 25 + (qualityIndex * progressPerQuality);
            const result = await (0, ffmpeg_1.compressVideo)(sourcePath, outputPath, options, (percent) => {
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
        const urls = {};
        const qualityStats = {};
        for (const quality of successfulQualities) {
            const outputPath = paths[`compressed_${quality}`];
            if (fs_1.default.existsSync(outputPath)) {
                const size = fs_1.default.statSync(outputPath).size;
                urls[`compressed_${quality}`] = buildPublicUrl(outputPath);
                qualityStats[quality] = {
                    size,
                    compression_ratio: Math.round(((sourceSize - size) / sourceSize) * 10000) / 100,
                    time: compressionResults[quality].time
                };
            }
        }
        const processingTime = (Date.now() - startTime) / 1000;
        const primaryPath = paths.compressed_480p || '';
        const compressedSize = primaryPath && fs_1.default.existsSync(primaryPath) ? fs_1.default.statSync(primaryPath).size : 0;
        const stats = {
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
    }
    catch (error) {
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
function buildPaths(postId, year, month, wpMediaPath) {
    const cfg = (0, config_1.config)();
    if (postId <= 0 || year < 2000 || year > 2100 || month < 1 || month > 12) {
        throw new Error('Invalid postId, year, or month');
    }
    const sanitizedPath = wpMediaPath
        .replace(/\.\.\//g, '')
        .replace(/\.\.\\/g, '')
        .replace(/\x00/g, '');
    let relativePath;
    const wpMatch = sanitizedPath.match(/\/wp-content\/uploads\/(.+)$/);
    if (wpMatch) {
        relativePath = wpMatch[1];
    }
    else {
        relativePath = sanitizedPath.replace(/^\/?(wp-content\/uploads\/)?/, '');
    }
    const sourcePath = path_1.default.join(cfg.media_uploads_dir, relativePath);
    const outputDir = path_1.default.join(cfg.media_content_dir, String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(postId));
    return {
        source: sourcePath,
        original: path_1.default.join(outputDir, 'original.mp4'),
        output_dir: outputDir,
        compressed_480p: path_1.default.join(outputDir, 'compressed_480p.mp4'),
        compressed_360p: path_1.default.join(outputDir, 'compressed_360p.mp4'),
        compressed_240p: path_1.default.join(outputDir, 'compressed_240p.mp4'),
        compressed_144p: path_1.default.join(outputDir, 'compressed_144p.mp4')
    };
}
function buildPublicUrl(filePath) {
    const cfg = (0, config_1.config)();
    const contentDir = cfg.media_content_dir;
    const normalizedFilePath = path_1.default.resolve(filePath);
    const normalizedContentDir = path_1.default.resolve(contentDir);
    if (!normalizedFilePath.startsWith(normalizedContentDir)) {
        logger.warning('File outside content directory', { filePath, contentDir });
        return '';
    }
    const relativePath = normalizedFilePath.substring(normalizedContentDir.length);
    return `${cfg.base_url}/content${relativePath.replace(/\\/g, '/')}`;
}
exports.default = {
    downloadVideo,
    validateInputVideo,
    compressVideoJob,
    cleanupOldOutputs
};
