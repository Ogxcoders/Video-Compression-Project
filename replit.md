# Video Compression API - Next.js 14

A modern video compression and HLS streaming API built with Next.js 14, converted from a PHP-based system for WordPress plugin compatibility.

## Overview

This API provides:
- Multi-quality video compression (144p, 240p, 360p, 480p)
- HLS adaptive streaming conversion
- Redis-backed job queue with BullMQ
- WebP thumbnail compression (22% quality) using sharp
- Webhook-based progress updates to WordPress
- Full API compatibility with the existing WordPress plugin
- Admin dashboard for job monitoring and management

## Project Structure

```
nextjs-vps-api/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── compress/route.ts       # POST /api/compress
│   │   │   ├── queue-compress/route.ts # Legacy PHP compatibility endpoint
│   │   │   ├── status/route.ts         # GET /api/status
│   │   │   ├── health/route.ts         # GET /api/health
│   │   │   └── webhook/route.ts        # POST /api/webhook (WordPress callbacks)
│   │   ├── admin/
│   │   │   ├── page.tsx                # Admin dashboard UI
│   │   │   └── layout.tsx              # Admin layout
│   │   ├── content/[...path]/route.ts  # Static file serving
│   │   ├── globals.css                 # Tailwind CSS v4 styles
│   │   └── page.tsx                    # Landing page
│   ├── lib/
│   │   ├── config.ts                   # Environment configuration
│   │   ├── logger.ts                   # Logging utility
│   │   ├── redis.ts                    # Redis client
│   │   ├── queue.ts                    # BullMQ queue manager
│   │   ├── ffmpeg.ts                   # FFmpeg operations
│   │   ├── video-compressor.ts         # Video compression logic
│   │   ├── image-compressor.ts         # WebP thumbnail compression
│   │   ├── hls-converter.ts            # HLS conversion
│   │   ├── webhook.ts                  # WordPress webhooks
│   │   └── utils.ts                    # Helper functions
│   ├── types/
│   │   └── index.ts                    # TypeScript types
│   ├── workers/
│   │   └── compression-worker.ts       # Background job processor
│   └── middleware.ts                   # CORS, API auth, rate limiting
├── public/
│   └── media/                          # Video storage
├── postcss.config.mjs                  # PostCSS with @tailwindcss/postcss
├── tailwind.config.ts                  # Tailwind configuration
├── .env.example                        # Environment template
└── package.json
```

## API Endpoints

### POST /api/compress
Queue a video for compression.

Request headers:
- `X-API-Key`: Required API authentication key

Request body:
```json
{
  "postId": 123,
  "wpMediaPath": "/wp-content/uploads/2024/01/video.mp4",
  "wpVideoUrl": "https://wordpress-site.com/wp-content/uploads/2024/01/video.mp4",
  "year": 2024,
  "month": 1
}
```

Response (202):
```json
{
  "status": "accepted",
  "message": "Video compression job queued successfully",
  "data": {
    "jobId": "job_123_1234567890",
    "postId": 123,
    "status": "pending",
    "queuePosition": 1
  }
}
```

### GET /api/status?jobId=xxx
Check job status.

### GET /api/health
Health check endpoint.

## Running the Application

### Development
```bash
cd nextjs-vps-api
npm run dev      # Start Next.js dev server on port 5000
npm run worker   # Start background worker (separate terminal)
```

### Production
```bash
npm run build
npm run start
npm run worker
```

## Environment Variables

See `.env.example` for all configuration options. Key variables:

- `API_KEY`: Required for API authentication
- `REDIS_HOST`, `REDIS_PORT`: Redis connection
- `WORDPRESS_WEBHOOK_URL`: WordPress callback URL

## Redis Requirement

This API requires Redis for job queue management. Install Redis or use a hosted service:

```bash
# Local Redis (if available)
redis-server

# Or set REDIS_HOST to your Redis server
```

## Technology Stack

- **Frontend**: Next.js 14 with Tailwind CSS v4 (@tailwindcss/postcss)
- **Backend**: Next.js App Router API routes
- **Queue**: BullMQ with Redis
- **Video**: fluent-ffmpeg with FFmpeg
- **Images**: sharp for WebP compression
- **Styling**: Tailwind CSS v4 with PostCSS

## Tailwind CSS v4 Configuration

This project uses Tailwind CSS v4 with the new PostCSS package:

- **PostCSS plugin**: `@tailwindcss/postcss` (not `tailwindcss` directly)
- **CSS import**: `@import "tailwindcss";` (replaces @tailwind directives)
- **Config**: `tailwind.config.ts` for customization

## Recent Changes

### December 2025 - Worker Resilience & Reliability
- **Resilient Redis Connection**: Redis client now retries indefinitely with exponential backoff (1s-30s)
- **Worker Auto-Recovery**: Worker now automatically restarts on Redis failures instead of crashing
- **Supervised Startup**: Worker attempts 10 retries during initial startup before entering supervisory mode
- **Race Condition Prevention**: Added guards to prevent multiple concurrent workers after Redis outages
- **Docker Worker Service**: Enabled vps-worker service with healthchecks and restart policy
- **Combined Dev Script**: Added `npm run dev:all` to start both API and worker together

### December 2025 - Compression Optimization & Bug Fixes
- Improved MP4 compression settings for better file size reduction:
  - CRF increased to 30 (from 28) for more aggressive compression
  - Preset changed to "slower" for better quality/size ratio
  - Audio bitrate reduced to 64k (from 96k)
  - Video bitrates optimized: 480p=400k, 360p=280k, 240p=150k, 144p=80k
- HLS segment conversion now supports optional re-encoding (enabled by default)
- Enhanced CORS headers with Range and Accept-Ranges support for better video streaming
- Added webhook retry logic (3 attempts with exponential backoff)
- Improved admin login persistence with automatic data fetch after page refresh
- Old output cleanup before recompression now includes HLS folder and thumbnails

### Previous Changes
- Migrated from Bull to BullMQ with proper job ID handling
- Added WebP thumbnail compression using sharp (22% quality)
- Created admin dashboard with login authentication
- Updated FFmpeg scale filter to use -2:height for proper aspect ratio
- Configured Tailwind CSS v4 with @tailwindcss/postcss
- Added legacy /api/queue-compress endpoint for PHP compatibility
- Maintained WordPress plugin API contract
