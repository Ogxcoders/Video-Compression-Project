#!/bin/sh
set -e

echo "[ENTRYPOINT] Initializing container..."

mkdir -p /media/uploads /media/content /app/logs

chown -R node:node /media/uploads /media/content /app/logs 2>/dev/null || true
chmod -R 755 /media/uploads /media/content /app/logs 2>/dev/null || true

echo "[ENTRYPOINT] Directories initialized"

# Log build info for debugging
echo "[ENTRYPOINT] Build Info:"
if [ -f /app/.next/BUILD_ID ]; then
    echo "[ENTRYPOINT]   BUILD_ID: $(cat /app/.next/BUILD_ID)"
fi
echo "[ENTRYPOINT]   CSS files: $(ls /app/.next/static/css/*.css 2>/dev/null | wc -l)"
echo "[ENTRYPOINT]   Static chunks: $(ls /app/.next/static/chunks/*.js 2>/dev/null | wc -l)"

echo "[ENTRYPOINT] Starting application as node user..."

exec su-exec node "$@"
