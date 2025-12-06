"use strict";
/**
 * FFmpeg Wrapper Module
 * Provides FFmpeg operations using fluent-ffmpeg
 * Converted from PHP VideoCompressor.php
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFfmpegPath = getFfmpegPath;
exports.getFfprobePath = getFfprobePath;
exports.initializeFfmpeg = initializeFfmpeg;
exports.getVideoInfo = getVideoInfo;
exports.getVideoDuration = getVideoDuration;
exports.compressVideo = compressVideo;
exports.convertToHLS = convertToHLS;
exports.formatBytes = formatBytes;
exports.checkFfmpegAvailable = checkFfmpegAvailable;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const logger = (0, logger_1.createLogger)('FFMPEG');
async function getFfmpegPath() {
    const cfg = (0, config_1.config)();
    if (cfg.ffmpeg_binary && cfg.ffmpeg_binary !== 'ffmpeg') {
        return cfg.ffmpeg_binary;
    }
    try {
        const { stdout } = await execAsync('which ffmpeg');
        return stdout.trim() || 'ffmpeg';
    }
    catch {
        return 'ffmpeg';
    }
}
async function getFfprobePath() {
    try {
        const { stdout } = await execAsync('which ffprobe');
        return stdout.trim() || 'ffprobe';
    }
    catch {
        return 'ffprobe';
    }
}
async function initializeFfmpeg() {
    const ffmpegPath = await getFfmpegPath();
    const ffprobePath = await getFfprobePath();
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpegPath);
    fluent_ffmpeg_1.default.setFfprobePath(ffprobePath);
    logger.info('FFmpeg initialized', { ffmpegPath, ffprobePath });
}
function getVideoInfo(filePath) {
    return new Promise((resolve) => {
        const info = {
            valid: false,
            corrupted: false,
            error: null,
            duration: 0,
            video_codec: null,
            audio_codec: null,
            container: null,
            width: 0,
            height: 0,
            resolution: null,
            bitrate: 0,
            frame_rate: null,
            frame_rate_numeric: 0,
            file_size: 0,
            file_size_mb: 0
        };
        if (!fs_1.default.existsSync(filePath)) {
            info.error = 'File not found';
            info.corrupted = true;
            logger.error('getVideoInfo: File not found', { path: filePath });
            resolve(info);
            return;
        }
        try {
            const stats = fs_1.default.statSync(filePath);
            info.file_size = stats.size;
            info.file_size_mb = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
            info.container = path_1.default.extname(filePath).substring(1).toLowerCase();
        }
        catch {
            info.error = 'Failed to read file stats';
            info.corrupted = true;
            resolve(info);
            return;
        }
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err) {
                info.corrupted = true;
                info.error = `ffprobe failed: ${err.message}`;
                logger.error('getVideoInfo: ffprobe failed', { path: filePath, error: err.message });
                resolve(info);
                return;
            }
            if (!metadata || !metadata.streams) {
                info.corrupted = true;
                info.error = 'No streams found in video';
                resolve(info);
                return;
            }
            if (metadata.format) {
                info.duration = Math.round((metadata.format.duration || 0) * 100) / 100;
                info.bitrate = metadata.format.bit_rate || 0;
                if (metadata.format.format_name) {
                    const formats = metadata.format.format_name.split(',');
                    info.container = formats[0].toLowerCase();
                }
            }
            let hasVideoStream = false;
            for (const stream of metadata.streams) {
                if (stream.codec_type === 'video' && !info.video_codec) {
                    hasVideoStream = true;
                    info.video_codec = stream.codec_name?.toLowerCase() || null;
                    info.width = stream.width || 0;
                    info.height = stream.height || 0;
                    info.resolution = `${info.width}x${info.height}`;
                    if (stream.r_frame_rate) {
                        const [num, den] = stream.r_frame_rate.split('/').map(Number);
                        if (den > 0) {
                            info.frame_rate_numeric = Math.round((num / den) * 100) / 100;
                            info.frame_rate = `${info.frame_rate_numeric} fps`;
                        }
                    }
                }
                if (stream.codec_type === 'audio' && !info.audio_codec) {
                    info.audio_codec = stream.codec_name?.toLowerCase() || null;
                }
            }
            if (!hasVideoStream) {
                info.corrupted = true;
                info.error = 'No video stream found in file';
                logger.error('getVideoInfo: No video stream found', { path: filePath });
                resolve(info);
                return;
            }
            if (info.duration <= 0 || info.width <= 0 || info.height <= 0) {
                info.corrupted = true;
                info.error = 'Invalid video metadata (zero duration or dimensions)';
                logger.error('getVideoInfo: Invalid metadata', {
                    path: filePath,
                    duration: info.duration,
                    width: info.width,
                    height: info.height
                });
                resolve(info);
                return;
            }
            info.valid = true;
            logger.debug('Video info retrieved', {
                path: path_1.default.basename(filePath),
                duration: `${info.duration}s`,
                resolution: info.resolution,
                codec: info.video_codec
            });
            resolve(info);
        });
    });
}
function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err || !metadata?.format?.duration) {
                resolve(0);
                return;
            }
            resolve(metadata.format.duration);
        });
    });
}
const QUALITY_CRF_MAP = {
    '480p': 23,
    '360p': 23,
    '240p': 22,
    '144p': 21
};
function compressVideo(inputPath, outputPath, options, onProgress) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const outputDir = path_1.default.dirname(outputPath);
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        if (!fs_1.default.existsSync(inputPath)) {
            logger.error(`Input file not found for ${options.quality}`, { inputPath });
            resolve({ success: false, time: 0, error: `Input file not found: ${inputPath}` });
            return;
        }
        logger.info(`Starting ${options.quality} compression`, {
            input: path_1.default.basename(inputPath),
            output: path_1.default.basename(outputPath),
            resolution: `${options.width}x${options.height}`,
            bitrate: options.bitrate
        });
        const scaleFilter = `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2`;
        const qualityCrf = options.crf ?? QUALITY_CRF_MAP[options.quality] ?? 22;
        (0, fluent_ffmpeg_1.default)(inputPath)
            .outputOptions([
            '-y',
            `-vf ${scaleFilter}`,
            '-c:v libx264',
            '-preset slow',
            `-crf ${qualityCrf}`,
            '-profile:v main',
            '-level 3.1',
            '-pix_fmt yuv420p',
            '-c:a aac',
            '-b:a 64k',
            '-ar 44100',
            '-ac 2',
            '-map 0:v:0',
            '-map 0:a:0?',
            '-movflags +faststart'
        ])
            .output(outputPath)
            .on('start', (commandLine) => {
            logger.debug(`FFmpeg command for ${options.quality}`, { command: commandLine });
        })
            .on('progress', (progress) => {
            if (onProgress && progress.percent) {
                onProgress(Math.round(progress.percent));
            }
        })
            .on('end', () => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (fs_1.default.existsSync(outputPath)) {
                const outputStats = fs_1.default.statSync(outputPath);
                if (outputStats.size < 1024) {
                    logger.error(`${options.quality} output file too small`, { size: outputStats.size });
                    resolve({ success: false, time: elapsed, error: 'Output file too small' });
                    return;
                }
                logger.info(`${options.quality} compression completed`, {
                    time: `${elapsed.toFixed(2)}s`,
                    size: formatBytes(outputStats.size)
                });
                resolve({ success: true, time: elapsed });
            }
            else {
                logger.error(`${options.quality} output file not created`);
                resolve({ success: false, time: elapsed, error: 'Output file not created' });
            }
        })
            .on('error', (err, stdout, stderr) => {
            const elapsed = (Date.now() - startTime) / 1000;
            logger.error(`${options.quality} compression failed`, {
                error: err.message,
                stderr: stderr?.substring(0, 500),
                time: `${elapsed.toFixed(2)}s`
            });
            if (fs_1.default.existsSync(outputPath)) {
                try {
                    fs_1.default.unlinkSync(outputPath);
                }
                catch {
                    // Ignore cleanup errors
                }
            }
            resolve({ success: false, time: elapsed, error: err.message });
        })
            .run();
    });
}
function convertToHLS(inputPath, outputDir, quality, segmentDuration = 6, reencode = true) {
    return new Promise((resolve) => {
        const playlistPath = path_1.default.join(outputDir, `${quality}.m3u8`);
        const segmentPattern = path_1.default.join(outputDir, `${quality}_%03d.ts`);
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        logger.info(`Starting HLS conversion for ${quality}`, {
            input: path_1.default.basename(inputPath),
            output: outputDir,
            reencode
        });
        const outputOptions = [];
        if (reencode) {
            outputOptions.push('-c:v libx264', '-preset slow', '-crf 23', '-profile:v main', '-level 3.1', '-pix_fmt yuv420p', `-force_key_frames expr:gte(t,n_forced*${segmentDuration})`, '-sc_threshold 0', '-c:a aac', '-b:a 64k', '-ar 44100', '-ac 2');
        }
        else {
            outputOptions.push('-c copy');
        }
        outputOptions.push('-f hls', `-hls_time ${segmentDuration}`, '-hls_list_size 0', `-hls_segment_filename ${segmentPattern}`, '-hls_playlist_type vod', '-hls_flags independent_segments+append_list', '-hls_segment_type mpegts', '-start_number 0');
        (0, fluent_ffmpeg_1.default)(inputPath)
            .outputOptions(outputOptions)
            .output(playlistPath)
            .on('end', () => {
            if (fs_1.default.existsSync(playlistPath)) {
                const allFiles = fs_1.default.readdirSync(outputDir);
                const segments = allFiles.filter(f => f.startsWith(`${quality}_`) && f.endsWith('.ts'));
                logger.info(`${quality} HLS conversion completed`, {
                    playlist: playlistPath,
                    segments: segments.length,
                    segmentFiles: segments.slice(0, 5),
                    allFilesInDir: allFiles.slice(0, 10),
                    reencoded: reencode
                });
                if (segments.length === 0) {
                    logger.warning(`${quality} HLS created playlist but no .ts segments found`, {
                        outputDir,
                        allFilesInDir: allFiles
                    });
                }
                resolve({
                    success: true,
                    playlist: playlistPath,
                    segmentCount: segments.length
                });
            }
            else {
                const allFiles = fs_1.default.existsSync(outputDir) ? fs_1.default.readdirSync(outputDir) : [];
                logger.error(`${quality} HLS playlist not created`, {
                    expectedPath: playlistPath,
                    outputDirExists: fs_1.default.existsSync(outputDir),
                    filesInOutputDir: allFiles
                });
                resolve({ success: false, error: 'Playlist not created' });
            }
        })
            .on('start', (commandLine) => {
            logger.debug(`FFmpeg HLS command for ${quality}`, { command: commandLine });
        })
            .on('error', (err, stdout, stderr) => {
            logger.error(`${quality} HLS conversion failed`, {
                error: err.message,
                stderr: stderr?.substring(0, 1000)
            });
            resolve({ success: false, error: err.message });
        })
            .run();
    });
}
function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}
async function checkFfmpegAvailable() {
    try {
        const { stdout } = await execAsync('ffmpeg -version');
        return stdout.includes('ffmpeg version');
    }
    catch {
        return false;
    }
}
initializeFfmpeg().catch(console.error);
exports.default = {
    getVideoInfo,
    getVideoDuration,
    compressVideo,
    convertToHLS,
    formatBytes,
    checkFfmpegAvailable,
    initializeFfmpeg
};
