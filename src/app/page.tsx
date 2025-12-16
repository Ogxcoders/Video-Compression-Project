import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Video Compression API
          </h1>
          <p className="text-lg text-gray-600">
            High-performance video processing system for WordPress
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">API Endpoints</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start">
                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono mr-2">POST</span>
                <span className="text-gray-700">/api/compress - Queue video compression</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono mr-2">GET</span>
                <span className="text-gray-700">/api/status - Check job status</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono mr-2">GET</span>
                <span className="text-gray-700">/api/health - System health check</span>
              </li>
              <li className="flex items-start">
                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono mr-2">POST</span>
                <span className="text-gray-700">/api/webhook - WordPress callbacks</span>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Features</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>Multi-quality video compression (480p, 360p, 240p, 144p)</li>
              <li>HLS streaming format conversion</li>
              <li>WebP thumbnail compression</li>
              <li>BullMQ job queue with Redis</li>
              <li>WordPress webhook integration</li>
              <li>Progress tracking and notifications</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Quick Links</h2>
            <div className="space-y-2">
              <Link 
                href="/admin" 
                className="block text-blue-600 hover:text-blue-800 hover:underline"
              >
                Admin Dashboard
              </Link>
              <Link 
                href="/api/health" 
                className="block text-blue-600 hover:text-blue-800 hover:underline"
              >
                Health Check
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Authentication</h2>
            <p className="text-sm text-gray-700 mb-2">
              All API endpoints require authentication via the <code className="bg-gray-100 px-1 rounded">X-API-Key</code> header.
            </p>
            <div className="bg-gray-50 p-3 rounded text-xs font-mono">
              X-API-Key: your_api_key_here
            </div>
          </div>
        </div>

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>Video Compression API v1.0.0 - Node.js + Next.js</p>
        </footer>
      </div>
    </div>
  );
}
