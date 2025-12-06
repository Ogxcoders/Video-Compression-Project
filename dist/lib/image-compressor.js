"use strict";
/**
 * Image Compressor Module
 * Handles thumbnail compression to WebP format
 * Converted from PHP ImageCompressor.php
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateImageUrl = validateImageUrl;
exports.downloadImage = downloadImage;
exports.compressToWebP = compressToWebP;
exports.compressThumbnail = compressThumbnail;
exports.thumbnailExists = thumbnailExists;
exports.getExistingThumbnailUrl = getExistingThumbnailUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const sharp_1 = __importDefault(require("sharp"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('IMAGE-COMPRESSOR');
const MAX_IMAGE_SIZE_MB = 50;
function getDefaultWebpQuality() {
    const cfg = (0, config_1.config)();
    return cfg.thumbnail_quality || 20;
}
function getDefaultThumbnailMaxWidth() {
    const cfg = (0, config_1.config)();
    return cfg.thumbnail_max_width || 320;
}
function getDefaultThumbnailMaxHeight() {
    const cfg = (0, config_1.config)();
    return cfg.thumbnail_max_height || 320;
}
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
function validateImageUrl(url) {
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
async function downloadImage(imageUrl, wpMediaPath = '') {
    const cfg = (0, config_1.config)();
    logger.info('Starting image download', { url: imageUrl, wpMediaPath });
    const validationResult = validateImageUrl(imageUrl);
    if (!validationResult.valid) {
        logger.error('URL validation failed', { url: imageUrl, error: validationResult.error });
        return { success: false, error: validationResult.error };
    }
    const uploadsDir = cfg.media_uploads_dir;
    if (!fs_1.default.existsSync(uploadsDir)) {
        fs_1.default.mkdirSync(uploadsDir, { recursive: true });
    }
    let relativePath;
    if (wpMediaPath) {
        const wpMatch = wpMediaPath.match(/\/wp-content\/uploads\/(.+)$/) ||
            wpMediaPath.match(/^\/?(wp-content\/uploads\/)?(.+)$/);
        relativePath = wpMatch ? (wpMatch[1] || wpMatch[2]) : wpMediaPath;
    }
    else {
        const parsedUrl = new url_1.URL(imageUrl);
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
    if (!fs_1.default.existsSync(localDir)) {
        fs_1.default.mkdirSync(localDir, { recursive: true });
    }
    logger.info('Downloading image', { url: imageUrl, localPath });
    return new Promise((resolve) => {
        const parsedUrl = new url_1.URL(imageUrl);
        const httpModule = parsedUrl.protocol === 'https:' ? https_1.default : http_1.default;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ImageCompressor/1.0)',
                'Accept': 'image/*,*/*'
            }
        };
        const file = fs_1.default.createWriteStream(localPath);
        const request = httpModule.get(imageUrl, options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    if (fs_1.default.existsSync(localPath))
                        fs_1.default.unlinkSync(localPath);
                    downloadImage(redirectUrl, wpMediaPath).then(resolve);
                    return;
                }
            }
            if (response.statusCode !== 200) {
                file.close();
                if (fs_1.default.existsSync(localPath))
                    fs_1.default.unlinkSync(localPath);
                logger.error('Download failed', { statusCode: response.statusCode });
                resolve({ success: false, error: `HTTP ${response.statusCode}` });
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                const stats = fs_1.default.statSync(localPath);
                if (stats.size < 100) {
                    fs_1.default.unlinkSync(localPath);
                    logger.error('Downloaded file too small', { size: stats.size });
                    resolve({ success: false, error: 'Downloaded file too small' });
                    return;
                }
                const fileSizeMB = stats.size / (1024 * 1024);
                if (fileSizeMB > MAX_IMAGE_SIZE_MB) {
                    fs_1.default.unlinkSync(localPath);
                    logger.error('Downloaded file too large', { sizeMB: fileSizeMB });
                    resolve({ success: false, error: `File size ${fileSizeMB.toFixed(2)} MB exceeds maximum ${MAX_IMAGE_SIZE_MB} MB` });
                    return;
                }
                logger.info('Image downloaded successfully', {
                    localPath,
                    size: `${(stats.size / 1024).toFixed(2)} KB`
                });
                resolve({
                    success: true,
                    localPath,
                    relativePath,
                    fileSize: stats.size
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
        request.setTimeout(60000, () => {
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
async function compressToWebP(inputPath, outputPath, options = {}) {
    const quality = options.quality ?? getDefaultWebpQuality();
    const maxWidth = options.maxWidth ?? getDefaultThumbnailMaxWidth();
    const maxHeight = options.maxHeight ?? getDefaultThumbnailMaxHeight();
    logger.info('Starting WebP compression', {
        input: path_1.default.basename(inputPath),
        output: path_1.default.basename(outputPath),
        quality
    });
    try {
        if (!fs_1.default.existsSync(inputPath)) {
            return {
                success: false,
                error: `Input file not found: ${inputPath}`
            };
        }
        const ext = path_1.default.extname(inputPath).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return {
                success: false,
                error: `Unsupported image format: ${ext}`
            };
        }
        const originalStats = fs_1.default.statSync(inputPath);
        const originalSize = originalStats.size;
        const outputDir = path_1.default.dirname(outputPath);
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        let transformer = (0, sharp_1.default)(inputPath);
        const inputMetadata = await transformer.metadata();
        if (maxWidth || maxHeight) {
            logger.info('Resizing image', {
                originalDimensions: `${inputMetadata.width}x${inputMetadata.height}`,
                maxDimensions: `${maxWidth}x${maxHeight}`
            });
            transformer = transformer.resize({
                width: maxWidth,
                height: maxHeight,
                fit: 'inside',
                withoutEnlargement: true
            });
        }
        await transformer
            .webp({
            quality,
            effort: 6,
            smartSubsample: true,
            nearLossless: false,
            alphaQuality: Math.max(quality - 10, 10),
            lossless: false,
            force: true
        })
            .toFile(outputPath);
        const compressedStats = fs_1.default.statSync(outputPath);
        const compressedSize = compressedStats.size;
        const compressionRatio = Math.round(((originalSize - compressedSize) / originalSize) * 10000) / 100;
        const outputMetadata = await (0, sharp_1.default)(outputPath).metadata();
        logger.info('WebP compression completed', {
            originalSize: `${(originalSize / 1024).toFixed(2)} KB`,
            compressedSize: `${(compressedSize / 1024).toFixed(2)} KB`,
            compressionRatio: `${compressionRatio}%`,
            dimensions: `${outputMetadata.width}x${outputMetadata.height}`
        });
        return {
            success: true,
            inputPath,
            outputPath,
            originalSize,
            compressedSize,
            compressionRatio,
            format: 'webp',
            width: outputMetadata.width,
            height: outputMetadata.height
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('WebP compression failed', {
            input: path_1.default.basename(inputPath),
            error: errorMessage
        });
        return {
            success: false,
            error: errorMessage
        };
    }
}
async function compressThumbnail(postId, year, month, thumbnailUrl, wpThumbnailPath = '') {
    const cfg = (0, config_1.config)();
    logger.info('Starting thumbnail compression', {
        postId,
        thumbnailUrl,
        quality: cfg.thumbnail_quality,
        maxDimensions: `${cfg.thumbnail_max_width}x${cfg.thumbnail_max_height}`
    });
    try {
        let inputPath;
        if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
            const downloadResult = await downloadImage(thumbnailUrl, wpThumbnailPath);
            if (!downloadResult.success || !downloadResult.localPath) {
                return {
                    success: false,
                    error: `Failed to download thumbnail: ${downloadResult.error}`
                };
            }
            inputPath = downloadResult.localPath;
        }
        else {
            const relativePath = thumbnailUrl
                .replace(/^\/?(wp-content\/uploads\/)?/, '')
                .replace(/\.\.\//g, '')
                .replace(/\.\.\\/g, '');
            inputPath = path_1.default.join(cfg.media_uploads_dir, relativePath);
            if (!fs_1.default.existsSync(inputPath)) {
                return {
                    success: false,
                    error: `Thumbnail file not found: ${inputPath}`
                };
            }
        }
        const outputDir = path_1.default.join(cfg.media_content_dir, String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(postId));
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path_1.default.join(outputDir, 'thumbnail.webp');
        const result = await compressToWebP(inputPath, outputPath, {
            quality: cfg.thumbnail_quality,
            maxWidth: cfg.thumbnail_max_width,
            maxHeight: cfg.thumbnail_max_height
        });
        if (result.success) {
            const publicUrl = buildThumbnailUrl(postId, year, month);
            result.publicUrl = publicUrl;
            logger.info('Thumbnail compression completed', {
                postId,
                url: publicUrl,
                compressionRatio: `${result.compressionRatio}%`
            });
        }
        return result;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Thumbnail compression failed', { postId, error: errorMessage });
        return {
            success: false,
            error: errorMessage
        };
    }
}
function buildThumbnailUrl(postId, year, month) {
    const cfg = (0, config_1.config)();
    const baseUrl = cfg.base_url.replace(/\/$/, '');
    return `${baseUrl}/content/${String(year).padStart(4, '0')}/${String(month).padStart(2, '0')}/${postId}/thumbnail.webp`;
}
function thumbnailExists(postId, year, month) {
    const cfg = (0, config_1.config)();
    const thumbnailPath = path_1.default.join(cfg.media_content_dir, String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(postId), 'thumbnail.webp');
    return fs_1.default.existsSync(thumbnailPath);
}
function getExistingThumbnailUrl(postId, year, month) {
    if (thumbnailExists(postId, year, month)) {
        return buildThumbnailUrl(postId, year, month);
    }
    return null;
}
exports.default = {
    validateImageUrl,
    downloadImage,
    compressToWebP,
    compressThumbnail,
    thumbnailExists,
    getExistingThumbnailUrl
};
