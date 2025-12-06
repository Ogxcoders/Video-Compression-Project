'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin page error:', error);
  }, [error]);

  const isChunkError = error.message?.includes('ChunkLoadError') || 
                       error.message?.includes('Loading chunk') ||
                       error.name === 'ChunkLoadError';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-lg text-center">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {isChunkError ? 'Application Update Required' : 'Something went wrong'}
        </h1>
        
        {isChunkError ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              The application has been updated. Please refresh the page to load the latest version.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
              <p className="text-sm text-yellow-800">
                <strong>If this keeps happening:</strong>
              </p>
              <ul className="text-sm text-yellow-700 mt-2 list-disc list-inside space-y-1">
                <li>Clear your browser cache</li>
                <li>Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)</li>
                <li>The server may need to be rebuilt</li>
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-gray-600 mb-4">
            An error occurred while loading the admin dashboard.
          </p>
        )}

        <div className="mt-6 space-x-4">
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
          >
            Refresh Page
          </button>
          <button
            onClick={reset}
            className="bg-gray-200 text-gray-700 py-2 px-6 rounded-md hover:bg-gray-300"
          >
            Try Again
          </button>
        </div>

        {!isChunkError && (
          <details className="mt-6 text-left">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-600 overflow-auto">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
