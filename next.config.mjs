/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase server timeout for video streaming (120 seconds)
  serverRuntimeConfig: {
    // This affects API routes
  },

  async headers() {
    return [
      {
        source: '/admin',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          },
          {
            key: 'Expires',
            value: '0'
          }
        ]
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        source: '/content/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS'
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, X-API-Key'
          }
        ]
      }
    ];
  },

  allowedDevOrigins: [
    'localhost',
    '*.replit.dev',
    '*.replit.app',
    '*.repl.co',
    '*.pike.replit.dev',
    '*.ogtemplate.com',
    'v.ogtemplate.com'
  ],

  typescript: {
    ignoreBuildErrors: false
  },

  eslint: {
    ignoreDuringBuilds: false
  },

  output: 'standalone',

  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'bullmq', 'ioredis', 'sharp']
  },

  poweredByHeader: false,

  generateBuildId: async () => {
    return `build-${Date.now()}`;
  }
};

export default nextConfig;
