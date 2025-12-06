# Video Compression API - Docker Image
# Multi-stage build with Node.js 20 + FFmpeg
# Optimized for production deployment on Docker/Coolify

# ============================================
# Stage 1: Build Stage
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Ensure public directory exists with content
RUN mkdir -p public && touch public/.gitkeep

# Build Next.js application AND worker (both must succeed)
RUN npm run build

# Verify builds were successful and show what was built
RUN echo "=== Verifying Build ===" && \
    echo "Standalone contents:" && ls -la .next/standalone/ && \
    echo "Static CSS files:" && ls -la .next/static/css/ && \
    echo "Worker files:" && ls -la dist/workers/ && \
    echo "BUILD_ID:" && cat .next/BUILD_ID && \
    test -f dist/workers/compression-worker.js || (echo "Worker build failed!" && exit 1) && \
    test -d .next/static/css || (echo "Static CSS missing!" && exit 1)

# ============================================
# Stage 2: Production Stage
# ============================================
FROM node:20-alpine AS production

# Install FFmpeg and runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    bash \
    curl \
    su-exec \
    && rm -rf /var/cache/apk/*

# Install PM2 globally for process management
RUN npm install -g pm2

WORKDIR /app

# Copy standalone Next.js build (includes node_modules)
COPY --from=builder /app/.next/standalone ./

# Copy static files - CRITICAL: These must match the BUILD_ID
COPY --from=builder /app/.next/static ./.next/static

# Verify static files were copied correctly
RUN echo "=== Production Stage: Verifying Static Files ===" && \
    ls -la .next/static/css/ && \
    echo "CSS files present: $(ls .next/static/css/*.css 2>/dev/null | wc -l)"

# Copy public directory (for static assets)
COPY --from=builder /app/public ./public

# Copy worker files
COPY --from=builder /app/dist ./dist

# Copy PM2 config
COPY --from=builder /app/ecosystem.config.js ./

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create necessary directories for media storage (both internal and volume mount points)
RUN mkdir -p /app/logs /app/public/media/uploads /app/public/media/content /media/uploads /media/content

# Set ownership and permissions for all directories
RUN chown -R node:node /app /media/uploads /media/content && \
    chmod -R 755 /app && \
    chmod -R 777 /media/uploads /media/content

# Environment variables (override in docker-compose or deployment)
ENV NODE_ENV=production
ENV PORT=5000
ENV HOSTNAME="0.0.0.0"
ENV DOCKER=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Expose port
EXPOSE 5000

# Use entrypoint to fix permissions and then run as node user
ENTRYPOINT ["/docker-entrypoint.sh"]

# Default command - starts both API and Worker via PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
