#!/bin/bash
# Deployment Verification Script
# Run this AFTER deploying to verify the build is correct

set -e

echo "=========================================="
echo "  VPS Deployment Verification Script"
echo "=========================================="
echo ""

# Configuration
BASE_URL="${1:-https://v.ogtemplate.com}"
echo "Checking: $BASE_URL"
echo ""

# Step 1: Check build info
echo "[1/4] Checking build info..."
BUILD_INFO=$(curl -s "$BASE_URL/api/build-info" 2>/dev/null || echo '{"error":"failed"}')
echo "Build Info Response:"
echo "$BUILD_INFO" | python3 -m json.tool 2>/dev/null || echo "$BUILD_INFO"
echo ""

# Extract build ID
BUILD_ID=$(echo "$BUILD_INFO" | grep -o '"buildId":"[^"]*"' | cut -d'"' -f4)
echo "Build ID: $BUILD_ID"

# Step 2: Check if static CSS exists
echo ""
echo "[2/4] Checking static CSS files..."
CSS_FILE=$(echo "$BUILD_INFO" | grep -o '"css":\[[^]]*\]' | grep -o '[a-f0-9]\{16\}\.css' | head -1)
if [ -n "$CSS_FILE" ]; then
    echo "Expected CSS: $CSS_FILE"
    CSS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/_next/static/css/$CSS_FILE")
    echo "CSS File Status: $CSS_STATUS"
    if [ "$CSS_STATUS" = "200" ]; then
        echo "✓ CSS file is accessible"
    else
        echo "✗ CSS file NOT accessible - this is the problem!"
    fi
else
    echo "Could not extract CSS filename from build info"
fi

# Step 3: Check admin page HTML
echo ""
echo "[3/4] Checking admin page..."
ADMIN_HTML=$(curl -s "$BASE_URL/admin" 2>/dev/null | head -100)
echo "First 200 chars of admin page:"
echo "${ADMIN_HTML:0:200}"
echo ""

# Extract CSS reference from HTML
CSS_IN_HTML=$(echo "$ADMIN_HTML" | grep -o 'static/css/[a-f0-9]*\.css' | head -1)
echo "CSS referenced in HTML: $CSS_IN_HTML"

# Step 4: Compare
echo ""
echo "[4/4] Diagnosis..."
if [ -n "$CSS_FILE" ] && [ -n "$CSS_IN_HTML" ]; then
    if echo "$CSS_IN_HTML" | grep -q "$CSS_FILE"; then
        echo "✓ CSS hash matches between build and HTML"
    else
        echo "✗ MISMATCH: HTML references different CSS than build"
        echo "   HTML wants: $CSS_IN_HTML"
        echo "   Build has: static/css/$CSS_FILE"
        echo ""
        echo "SOLUTION: The HTML is cached. Try:"
        echo "  1. Clear Cloudflare cache (if using Cloudflare)"
        echo "  2. docker-compose down -v (removes volumes)"
        echo "  3. docker system prune -a (removes all cached images)"
        echo "  4. docker-compose up -d --build"
    fi
fi

# Health check
echo ""
echo "[Extra] Health check..."
HEALTH=$(curl -s "$BASE_URL/api/health" 2>/dev/null)
echo "Health: $HEALTH"

echo ""
echo "=========================================="
echo "  Verification Complete"
echo "=========================================="
