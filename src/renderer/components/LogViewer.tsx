import React, { useState } from 'react';
import { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
}

function LogViewer({ logs, onClear }: LogViewerProps) {
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = logs.filter((log) => filter === 'all' || log.level === filter);

  const levelColors = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    debug: 'text-slate-400',
  };

  const levelBadges = {
    info: 'badge-info',
    warn: 'badge-warning',
    error: 'badge-error',
    debug: 'badge bg-slate-700 text-slate-300',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">System Logs</h2>
          <p className="text-slate-400">Monitor application events and errors</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-white">Auto-scroll</span>
          </label>
          <button onClick={onClear} className="btn-secondary">
            Clear Logs
          </button>
        </div>
      </div>

      {/* Log Level Filters */}
      <div className="flex gap-2">
        {(['all', 'info', 'warn', 'error', 'debug'] as const).map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`px-4 py-2 rounded-lg font-medium transition-all capitalize ${
              filter === level ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {level} ({level === 'all' ? logs.length : logs.filter((l) => l.level === level).length})
          </button>
        ))}
      </div>

      {/* Logs Container */}
      <div className="card p-4 h-[600px] overflow-y-auto font-mono text-sm">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            No logs to display
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log, index) => (
              <div key={index} className="flex gap-3 p-2 hover:bg-slate-800/50 rounded">
                <span className="text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 ${levelBadges[log.level]} uppercase`}>
                  {log.level}
                </span>
                {log.radioId && (
                  <span className="badge-info shrink-0">{log.radioId}</span>
                )}
                <span className={levelColors[log.level]}>{log.message}</span>
                {log.data && (
                  <details className="ml-4">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-400">
                      Details
                    </summary>
                    <pre className="mt-2 p-2 bg-slate-900 rounded text-xs overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LogViewer;
