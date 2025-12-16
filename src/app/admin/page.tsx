'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cvp_admin_api_key';

interface Job {
  jobId: string;
  postId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  updatedAt?: string;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead_letter: number;
}

interface HealthData {
  status: string;
  uptime: number;
  dependencies: {
    redis: { connected: boolean; host: string; port: number };
    ffmpeg: { available: boolean };
  };
  queue: QueueStats | null;
}

interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
  url?: string;
  children?: FileEntry[];
}

interface FilesData {
  path: string;
  baseUrl: string;
  entries: FileEntry[];
  stats: {
    totalSize: number;
    totalSizeFormatted: string;
    fileCount: number;
    folderCount: number;
  };
}

interface LogsData {
  logs: string[];
  file: string;
  size: number;
  sizeFormatted: string;
  lineCount: number;
  displayedLines: number;
  lastModified: string;
}

type TabType = 'overview' | 'jobs' | 'files' | 'logs';

export default function AdminDashboard() {
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [files, setFiles] = useState<FilesData | null>(null);
  const [logs, setLogs] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [logFilter, setLogFilter] = useState('');
  const [logLines, setLogLines] = useState(200);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    const savedKey = localStorage.getItem(STORAGE_KEY);
    if (savedKey) {
      setApiKey(savedKey);
      validateSavedKey(savedKey);
    }
  }, []);

  const validateSavedKey = async (savedKey: string) => {
    try {
      const res = await fetch('/api/status', {
        headers: { 'X-API-Key': savedKey }
      });
      if (res.ok) {
        setAuthenticated(true);
        fetchHealth();
        fetchJobs();
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setApiKey('');
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setApiKey('');
    }
  };

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'success') {
        setHealth(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    if (!apiKey) return;
    
    try {
      const res = await fetch('/api/admin/jobs', {
        headers: { 'X-API-Key': apiKey }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setJobs(data.data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, [apiKey]);

  const fetchFiles = useCallback(async () => {
    if (!apiKey) return;
    
    try {
      const res = await fetch('/api/admin/files?depth=6', {
        headers: { 'X-API-Key': apiKey }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFiles(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  }, [apiKey]);

  const fetchLogs = useCallback(async () => {
    if (!apiKey) return;
    
    try {
      const params = new URLSearchParams({
        lines: String(logLines),
        ...(logFilter && { filter: logFilter })
      });
      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: { 'X-API-Key': apiKey }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setLogs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, [apiKey, logLines, logFilter]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/status', {
        headers: { 'X-API-Key': apiKey }
      });
      
      if (res.ok) {
        setAuthenticated(true);
        if (rememberKey) {
          localStorage.setItem(STORAGE_KEY, apiKey);
        }
        await fetchHealth();
        await fetchJobs();
      } else {
        setError('Invalid API key');
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      setError('Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setApiKey('');
    localStorage.removeItem(STORAGE_KEY);
    setHealth(null);
    setJobs([]);
    setFiles(null);
    setLogs(null);
  };

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      await fetchHealth();
      await fetchJobs();
      if (activeTab === 'files') await fetchFiles();
      if (activeTab === 'logs') await fetchLogs();
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchHealth, fetchJobs, fetchFiles, fetchLogs]);

  const handleRetry = async (jobId: string) => {
    try {
      await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ jobId, action: 'retry' })
      });
      await fetchJobs();
    } catch (err) {
      console.error('Failed to retry job:', err);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this job?')) return;
    
    try {
      await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ jobId, action: 'cancel' })
      });
      await fetchJobs();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const handleDownloadLogs = async () => {
    if (!apiKey) return;
    try {
      const response = await fetch('/api/admin/logs?download=1', {
        headers: { 'X-API-Key': apiKey }
      });
      if (!response.ok) {
        console.error('Failed to download logs');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download logs:', err);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs?')) return;
    
    try {
      await fetch('/api/admin/logs', {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey }
      });
      await fetchLogs();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  useEffect(() => {
    if (authenticated && autoRefresh) {
      const interval = setInterval(() => {
        fetchHealth();
        fetchJobs();
        if (activeTab === 'logs') fetchLogs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [authenticated, autoRefresh, fetchHealth, fetchJobs, fetchLogs, activeTab]);

  useEffect(() => {
    if (authenticated && activeTab === 'files' && !files) {
      fetchFiles();
    }
    if (authenticated && activeTab === 'logs' && !logs) {
      fetchLogs();
    }
  }, [authenticated, activeTab, files, logs, fetchFiles, fetchLogs]);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLogLevelColor = (line: string) => {
    if (line.includes('[ERROR]') || line.includes('[FATAL]')) return 'text-red-400';
    if (line.includes('[WARNING]')) return 'text-yellow-400';
    if (line.includes('[INFO]')) return 'text-blue-400';
    if (line.includes('[DEBUG]')) return 'text-gray-400';
    return 'text-gray-300';
  };

  const getFileIcon = (entry: FileEntry) => {
    if (entry.isDirectory) return '📁';
    const ext = entry.name.split('.').pop()?.toLowerCase();
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) return '🎬';
    if (['m3u8', 'ts'].includes(ext || '')) return '📺';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
    if (ext === 'json') return '📋';
    if (ext === 'log') return '📝';
    return '📄';
  };

  const renderFileTree = (entries: FileEntry[], level: number = 0) => {
    return (
      <ul className={`${level === 0 ? '' : 'ml-4 border-l border-gray-200 pl-2'}`}>
        {entries.map((entry) => (
          <li key={entry.path} className="my-1">
            <div 
              className={`flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 ${entry.isDirectory ? 'cursor-pointer' : ''}`}
              onClick={() => entry.isDirectory && toggleFolder(entry.path)}
            >
              {entry.isDirectory && (
                <span className="text-gray-400 text-xs w-3">
                  {expandedFolders.has(entry.path) ? '▼' : '▶'}
                </span>
              )}
              {!entry.isDirectory && <span className="w-3"></span>}
              <span>{getFileIcon(entry)}</span>
              {entry.url && !entry.isDirectory ? (
                <a 
                  href={entry.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex-1 truncate text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  {entry.name}
                </a>
              ) : (
                <span className="flex-1 truncate text-sm font-medium">{entry.name}</span>
              )}
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatBytes(entry.size)}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
                {formatDate(entry.mtime)}
              </span>
              {entry.url && !entry.isDirectory && (
                <a
                  href={entry.url}
                  download
                  className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download
                </a>
              )}
            </div>
            {entry.isDirectory && entry.children && expandedFolders.has(entry.path) && (
              renderFileTree(entry.children, level + 1)
            )}
          </li>
        ))}
      </ul>
    );
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6">Video Compression Admin</h1>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter API key"
                required
              />
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberKey"
                checked={rememberKey}
                onChange={(e) => setRememberKey(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="rememberKey" className="ml-2 block text-sm text-gray-700">
                Remember API key
              </label>
            </div>
            
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Video Compression Admin</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['overview', 'jobs', 'files', 'logs'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto pb-6 px-4 sm:px-6 lg:px-8">
        {activeTab === 'overview' && health && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">System Status</h3>
              <p className={`text-2xl font-bold ${health.status === 'healthy' ? 'text-green-600' : 'text-yellow-600'}`}>
                {health.status === 'healthy' ? 'Healthy' : 'Degraded'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Uptime: {formatUptime(health.uptime)}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Redis</h3>
              <p className={`text-2xl font-bold ${health.dependencies.redis.connected ? 'text-green-600' : 'text-red-600'}`}>
                {health.dependencies.redis.connected ? 'Connected' : 'Disconnected'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {health.dependencies.redis.host}:{health.dependencies.redis.port}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">FFmpeg</h3>
              <p className={`text-2xl font-bold ${health.dependencies.ffmpeg.available ? 'text-green-600' : 'text-red-600'}`}>
                {health.dependencies.ffmpeg.available ? 'Available' : 'Not Found'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Queue</h3>
              {health.queue ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-xs text-gray-500">Pending</span>
                    <p className="text-lg font-bold text-yellow-600">{health.queue.pending}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Processing</span>
                    <p className="text-lg font-bold text-blue-600">{health.queue.processing}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Completed</span>
                    <p className="text-lg font-bold text-green-600">{health.queue.completed}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Failed</span>
                    <p className="text-lg font-bold text-red-600">{health.queue.failed}</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No queue stats</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
              <h2 className="text-lg font-medium text-gray-900">Recent Jobs</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Post ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        No jobs found
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => (
                      <tr key={job.jobId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {job.jobId.substring(0, 20)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {job.postId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-blue-600 h-2.5 rounded-full"
                              style={{ width: `${job.progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500">{job.progress}%</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(job.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {job.status === 'failed' && (
                            <button
                              onClick={() => handleRetry(job.jobId)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              Retry
                            </button>
                          )}
                          {(job.status === 'pending' || job.status === 'processing') && (
                            <button
                              onClick={() => handleCancel(job.jobId)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-5 border-b border-gray-200 sm:px-6 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium text-gray-900">File Manager</h2>
                {files && (
                  <p className="text-sm text-gray-500 mt-1">
                    {files.stats.fileCount} files, {files.stats.folderCount} folders ({files.stats.totalSizeFormatted})
                  </p>
                )}
              </div>
              <button
                onClick={fetchFiles}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
              >
                Refresh Files
              </button>
            </div>
            
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {!files ? (
                <div className="text-center text-gray-500 py-8">Loading files...</div>
              ) : files.entries.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No files found in media/content directory</div>
              ) : (
                renderFileTree(files.entries)
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">System Logs</h2>
                  {logs && (
                    <p className="text-sm text-gray-500 mt-1">
                      {logs.file} - {logs.sizeFormatted} ({logs.lineCount} total lines)
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Filter logs..."
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="px-3 py-1 border rounded text-sm"
                  />
                  <select
                    value={logLines}
                    onChange={(e) => setLogLines(Number(e.target.value))}
                    className="px-3 py-1 border rounded text-sm"
                  >
                    <option value={50}>Last 50</option>
                    <option value={100}>Last 100</option>
                    <option value={200}>Last 200</option>
                    <option value={500}>Last 500</option>
                  </select>
                  <button
                    onClick={fetchLogs}
                    className="bg-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-300"
                  >
                    Apply
                  </button>
                  <button
                    onClick={handleDownloadLogs}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    Download
                  </button>
                  <button
                    onClick={handleClearLogs}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <div className="bg-gray-900 rounded-lg p-4 max-h-[500px] overflow-y-auto font-mono text-xs">
                {!logs ? (
                  <div className="text-center text-gray-400 py-8">Loading logs...</div>
                ) : logs.logs.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">No logs found</div>
                ) : (
                  logs.logs.map((line, index) => (
                    <div key={index} className={`${getLogLevelColor(line)} py-0.5 hover:bg-gray-800`}>
                      {line}
                    </div>
                  ))
                )}
              </div>
              {logs && logs.displayedLines > 0 && (
                <p className="text-xs text-gray-500 mt-2 text-right">
                  Showing {logs.displayedLines} of {logs.lineCount} lines
                  {logs.lastModified && ` | Last modified: ${formatDate(logs.lastModified)}`}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
