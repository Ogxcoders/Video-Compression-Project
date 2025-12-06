"use strict";
/**
 * TypeScript Types for Video Compression API
 * Converted from PHP VPS-API project
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_CODES = exports.VIDEO_VALIDATION = exports.HLS_QUALITIES = exports.QUALITY_PRESETS = void 0;
exports.QUALITY_PRESETS = {
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
exports.HLS_QUALITIES = {
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
exports.VIDEO_VALIDATION = {
    MAX_DURATION: 300,
    MAX_SIZE_MB: 100,
    ALLOWED_CODECS: ['h264', 'hevc', 'h265', 'vp8', 'vp9', 'prores', 'mpeg4', 'av1'],
    ALLOWED_CONTAINERS: ['mp4', 'mov', 'webm', 'mkv']
};
exports.ERROR_CODES = {
    DURATION_TOO_LONG: 'DURATION_TOO_LONG',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_CODEC: 'INVALID_CODEC',
    VIDEO_CORRUPTED: 'VIDEO_CORRUPTED',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    INVALID_CONTAINER: 'INVALID_CONTAINER',
    DOWNLOAD_FAILED: 'DOWNLOAD_FAILED'
};
