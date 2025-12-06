"use strict";
/**
 * HLS Converter Module
 * Converts MP4 videos to HLS format with adaptive bitrate streaming
 * Converted from PHP HLSConverter.php
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToHLSStreaming = convertToHLSStreaming;
exports.hlsExists = hlsExists;
exports.getExistingHLSUrls = getExistingHLSUrls;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const ffmpeg_1 = require("./ffmpeg");
const types_1 = require("../types");
const logger = (0, logger_1.createLogger)('HLS-CONVERTER');
function getHlsSegmentDuration() {
    const cfg = (0, config_1.config)();
    return cfg.hls_time || 2;
}
const HLS_REENCODE_SEGMENTS = true;
async function convertToHLSStreaming(paths, postId, year, month) {
    const HLS_SEGMENT_DURATION = getHlsSegmentDuration();
    logger.info('Starting HLS conversion', { postId, reencode: HLS_REENCODE_SEGMENTS, segmentDuration: HLS_SEGMENT_DURATION });
    try {
        const hlsDir = path_1.default.join(paths.output_dir, 'hls');
        if (!fs_1.default.existsSync(hlsDir)) {
            fs_1.default.mkdirSync(hlsDir, { recursive: true });
        }
        const qualities = ['480p', '360p', '240p', '144p'];
        const convertedQualities = {};
        const availableQualities = [];
        for (const quality of qualities) {
            const mp4Path = paths[`compressed_${quality}`];
            if (!mp4Path) {
                logger.warning(`Skipping ${quality} - path not provided`, { quality });
                continue;
            }
            if (!fs_1.default.existsSync(mp4Path)) {
                logger.warning(`Skipping ${quality} - file not found`, { path: mp4Path });
                continue;
            }
            logger.info(`Converting ${quality} to HLS`, { source: path_1.default.basename(mp4Path), reencode: HLS_REENCODE_SEGMENTS });
            const result = await (0, ffmpeg_1.convertToHLS)(mp4Path, hlsDir, quality, HLS_SEGMENT_DURATION, HLS_REENCODE_SEGMENTS);
            if (result.success && result.playlist && result.segmentCount) {
                convertedQualities[quality] = {
                    playlist: result.playlist,
                    segmentCount: result.segmentCount
                };
                availableQualities.push(quality);
                logger.info(`${quality} HLS conversion completed`, {
                    segments: result.segmentCount
                });
            }
            else {
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
        const hlsUrls = {
            master: hlsMasterUrl
        };
        for (const quality of availableQualities) {
            hlsUrls[quality] = buildHLSUrl(postId, year, month, `${quality}.m3u8`);
        }
        const totalSegments = Object.values(convertedQualities).reduce((sum, q) => sum + q.segmentCount, 0);
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('HLS conversion failed', { error: errorMessage });
        return {
            success: false,
            error: errorMessage
        };
    }
}
async function generateMasterPlaylist(hlsDir, convertedQualities) {
    try {
        const masterPath = path_1.default.join(hlsDir, 'master.m3u8');
        let content = '#EXTM3U\n';
        content += '#EXT-X-VERSION:3\n';
        content += '\n';
        const qualityOrder = ['144p', '240p', '360p', '480p'];
        for (const quality of qualityOrder) {
            if (!convertedQualities[quality]) {
                continue;
            }
            const hlsConfig = types_1.HLS_QUALITIES[quality];
            content += `#EXT-X-STREAM-INF:BANDWIDTH=${hlsConfig.bandwidth},`;
            content += `AVERAGE-BANDWIDTH=${hlsConfig.avg_bandwidth},`;
            content += `RESOLUTION=${hlsConfig.resolution},`;
            content += `CODECS="${hlsConfig.codecs}",`;
            content += `NAME="${quality}"\n`;
            content += `${quality}.m3u8\n`;
        }
        fs_1.default.writeFileSync(masterPath, content, { mode: 0o644 });
        logger.info('Master playlist generated', {
            path: masterPath,
            qualities: Object.keys(convertedQualities)
        });
        return {
            success: true,
            path: masterPath
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: errorMessage
        };
    }
}
function buildHLSUrl(postId, year, month, filename) {
    const cfg = (0, config_1.config)();
    const baseUrl = cfg.base_url.replace(/\/$/, '');
    return `${baseUrl}/content/${String(year).padStart(4, '0')}/${String(month).padStart(2, '0')}/${postId}/hls/${filename}`;
}
function hlsExists(outputDir) {
    const masterPath = path_1.default.join(outputDir, 'hls', 'master.m3u8');
    return fs_1.default.existsSync(masterPath);
}
function getExistingHLSUrls(outputDir, postId, year, month) {
    const hlsDir = path_1.default.join(outputDir, 'hls');
    const masterPath = path_1.default.join(hlsDir, 'master.m3u8');
    if (!fs_1.default.existsSync(masterPath)) {
        return null;
    }
    const hlsUrls = {
        master: buildHLSUrl(postId, year, month, 'master.m3u8')
    };
    const qualities = ['480p', '360p', '240p', '144p'];
    for (const quality of qualities) {
        const playlistPath = path_1.default.join(hlsDir, `${quality}.m3u8`);
        if (fs_1.default.existsSync(playlistPath)) {
            hlsUrls[quality] = buildHLSUrl(postId, year, month, `${quality}.m3u8`);
        }
    }
    return hlsUrls;
}
exports.default = {
    convertToHLSStreaming,
    hlsExists,
    getExistingHLSUrls
};
