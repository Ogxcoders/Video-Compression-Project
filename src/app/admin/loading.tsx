'use client';

export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div 
          style={{
            display: 'inline-block',
            width: '48px',
            height: '48px',
            border: '4px solid #2563eb',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
        <p style={{ marginTop: '16px', color: '#4b5563' }}>Loading Admin Dashboard...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
