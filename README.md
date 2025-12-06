# Video Compression API - Next.js 14

A high-performance video compression API built with Next.js 14, BullMQ, and FFmpeg. Processes videos to multiple quality levels (144p, 240p, 360p, 480p), converts to HLS adaptive streaming format, and compresses thumbnails to WebP.

## Features

- **Multi-Quality Video Compression**: 144p, 240p, 360p, 480p with H.264 encoding
- **HLS Adaptive Streaming**: Master playlist with quality variants, 6-second segments
- **WebP Thumbnail Compression**: Configurable quality (default 60%)
- **BullMQ Job Queue**: Redis-backed queue with retry logic and stall detection
- **WordPress Integration**: Webhook callbacks for progress updates
- **Admin Dashboard**: Real-time job monitoring at `/admin`
- **SSRF Protection**: Domain allowlist for remote video downloads
- **Graceful Shutdown**: Proper signal handling for production deployments

## Architecture

```
WordPress Plugin                 VPS API (Next.js)
      │                                │
      ├─── POST /api/compress ────────►│
      │                                ├─── Redis Queue (BullMQ)
      │                                │         │
      │                                │         ▼
      │                                │    Worker Process
      │                                │    (FFmpeg + Sharp)
      │                                │         │
      │◄─── POST /webhook ─────────────┤         │
      │    (progress + completion)     │◄────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Redis 7+
- FFmpeg 5+

### Development

```bash
# Install dependencies
npm install

# Start Redis (required)
redis-server

# Start development server
npm run dev

# Start worker (in separate terminal)
npm run worker:dev
```

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```env
# Required
API_KEY=your_64_character_hex_key
ADMIN_PASSWORD=secure_password
BASE_URL=https://your-domain.com
WORDPRESS_WEBHOOK_URL=https://wordpress-site.com/wp-json/cvp/v1/webhook

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Thumbnail quality (0-100, recommended: 60)
THUMBNAIL_QUALITY=60
```

## Docker Deployment

### Quick Deploy

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Configuration

Create `.env` file in the project root:

```env
API_KEY=your_production_api_key
ADMIN_PASSWORD=your_admin_password
BASE_URL=https://v.ogtemplate.com
WORDPRESS_WEBHOOK_URL=https://ogtemplate.com/wp-json/cvp/v1/webhook
THUMBNAIL_QUALITY=60
```

### Coolify Deployment

1. Create a new Docker Compose service in Coolify
2. Point to this repository
3. Set environment variables in Coolify dashboard
4. Deploy

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/compress` | POST | Queue video for compression |
| `GET /api/status?jobId=xxx` | GET | Check job status |
| `GET /api/health` | GET | Health check (Redis/FFmpeg) |
| `GET /admin` | GET | Admin dashboard |

### Compress Request

```bash
curl -X POST https://your-api.com/api/compress \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "postId": 12345,
    "wpMediaPath": "/wp-content/uploads/2024/12/video.mp4",
    "wpVideoUrl": "https://wordpress-site.com/wp-content/uploads/2024/12/video.mp4",
    "wpThumbnailUrl": "https://wordpress-site.com/wp-content/uploads/2024/12/thumb.jpg",
    "year": 2024,
    "month": 12
  }'
```

### Response

```json
{
  "jobId": "job_12345_1733321234",
  "postId": 12345,
  "status": "pending",
  "message": "Video compression job queued successfully",
  "queuePosition": 1,
  "queueLength": 1
}
```

## Video Processing Specs

### Quality Presets

| Quality | Resolution | Video Bitrate | Max Bitrate |
|---------|------------|---------------|-------------|
| 480p | 854×480 | 800kbps | 1000kbps |
| 360p | 640×360 | 600kbps | 750kbps |
| 240p | 426×240 | 400kbps | 500kbps |
| 144p | 256×144 | 200kbps | 250kbps |

### Validation Rules

- **Max Duration**: 300 seconds (5 minutes)
- **Max File Size**: 100 MB
- **Allowed Codecs**: h264, hevc, vp8, vp9, prores, mpeg4, av1
- **Allowed Containers**: mp4, mov, webm, mkv

## Project Structure

```
nextjs-vps-api/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── compress/route.ts    # Main compression endpoint
│   │   │   ├── status/route.ts      # Job status check
│   │   │   ├── health/route.ts      # Health check
│   │   │   └── webhook/route.ts     # WordPress callback
│   │   └── admin/page.tsx           # Admin dashboard
│   ├── lib/
│   │   ├── config.ts                # Configuration
│   │   ├── ffmpeg.ts                # FFmpeg wrapper
│   │   ├── video-compressor.ts      # Video processing
│   │   ├── hls-converter.ts         # HLS conversion
│   │   ├── image-compressor.ts      # WebP thumbnails
│   │   ├── queue.ts                 # BullMQ queue
│   │   └── webhook.ts               # WordPress webhooks
│   ├── workers/
│   │   └── compression-worker.ts    # Background processor
│   └── types/index.ts               # TypeScript types
├── Dockerfile                       # Production Docker image
├── docker-compose.yml               # Full stack deployment
├── ecosystem.config.js              # PM2 configuration
└── .env.example                     # Environment template
```

## VPS Deployment (Non-Docker)

For deploying directly on a VPS without Docker, the worker will automatically run alongside the API using PM2.

### Option 1: Quick Deploy Script

```bash
# 1. First, run the setup script on a fresh VPS (as root)
sudo ./deploy/setup-vps.sh

# 2. Copy your project files to /var/www/vps-api

# 3. Run the deploy script
./deploy/deploy.sh
```

### Option 2: Manual Setup

```bash
# 1. Install dependencies
sudo apt update && sudo apt install -y nodejs npm redis-server ffmpeg

# 2. Install PM2 globally
sudo npm install -g pm2

# 3. Clone/copy your project
cd /var/www/vps-api

# 4. Install npm dependencies
npm ci --production=false

# 5. Build for production (builds both Next.js and worker)
npm run build

# 6. Copy static files for standalone server
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# 7. Create .env file with your configuration
cp .env.example .env
nano .env

# 8. Start both API and Worker with PM2
pm2 start ecosystem.config.js --env production

# 9. Save PM2 process list (for restart persistence)
pm2 save

# 10. Enable auto-start on system boot
pm2 startup
# (Copy and run the command it outputs)
```

### PM2 Commands Reference

```bash
# View status of all processes
pm2 status

# View real-time logs
pm2 logs

# View logs for specific process
pm2 logs vps-worker

# Monitor processes (CPU, memory, etc.)
pm2 monit

# Restart all processes
pm2 restart all

# Restart only the worker
pm2 restart vps-worker

# Stop all processes
pm2 stop all

# Delete all processes
pm2 delete all
```

### Verify Worker is Running

```bash
# Check PM2 status - should show both vps-api and vps-worker
pm2 status

# Check worker logs
pm2 logs vps-worker --lines 50

# Test API health endpoint
curl http://localhost:5000/api/health
```

### Troubleshooting

If worker is not starting:

1. **Check Redis is running**: `redis-cli ping` should return `PONG`
2. **Check environment variables**: Ensure `.env` file has `REDIS_HOST=127.0.0.1`
3. **Check build output**: Verify `dist/workers/compression-worker.js` exists
4. **Check PM2 logs**: `pm2 logs vps-worker --err` for error messages

## Monitoring

### Health Check

```bash
curl https://your-api.com/api/health
```

### Admin Dashboard

Access at `https://your-api.com/admin` with your `ADMIN_PASSWORD`.

## License

Private - CapCut Video Processor v2.0 Enhanced Edition
