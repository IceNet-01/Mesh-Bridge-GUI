import { useState } from 'react';
import { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
}

function LogViewer({ logs, onClear }: LogViewerProps) {
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');

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

      {/* View Mode Toggle */}
      <div className="flex gap-4 items-center">
        <div className="flex gap-2 bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('structured')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              viewMode === 'structured' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Structured
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              viewMode === 'raw' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Raw Console
          </button>
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
      </div>

      {/* Logs Container */}
      <div className="card p-4 h-[600px] overflow-y-auto font-mono text-sm">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            No logs to display
          </div>
        ) : viewMode === 'raw' ? (
          /* Raw Console View */
          <div className="space-y-0 bg-black/50 p-4 rounded-lg">
            {filteredLogs.map((log, index) => {
              const levelPrefix = log.level.toUpperCase().padEnd(5);
              const timestamp = new Date(log.timestamp).toLocaleTimeString();
              const context = log.context ? `[${log.context}]` : '';
              const radioId = log.radioId ? `[${log.radioId}]` : '';

              return (
                <div key={index} className={`${levelColors[log.level]} leading-relaxed`}>
                  <span className="text-slate-500">{timestamp}</span>
                  {' '}
                  <span className="font-bold">{levelPrefix}</span>
                  {radioId && <span className="text-blue-400"> {radioId}</span>}
                  {context && <span className="text-cyan-400"> {context}</span>}
                  {' '}
                  {log.message}
                  {log.error && (
                    <div className="ml-20 text-red-400">
                      Error: {log.error}
                    </div>
                  )}
                  {log.data && (
                    <div className="ml-20 text-slate-400 text-xs">
                      {JSON.stringify(log.data)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Structured View */
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
