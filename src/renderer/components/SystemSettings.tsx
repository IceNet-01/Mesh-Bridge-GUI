import { useState } from 'react';
import { Card } from './ui/Card';
import { BridgeServerSettings } from './BridgeServerSettings';
import { SystemUpdate } from './SystemUpdate';
import LogViewer from './LogViewer';

type SystemTab = 'server' | 'updates' | 'logs';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState<SystemTab>('server');

  const tabs: { id: SystemTab; label: string; icon: string }[] = [
    { id: 'server', label: 'Server Settings', icon: '🖥️' },
    { id: 'updates', label: 'System Updates', icon: '🔄' },
    { id: 'logs', label: 'Logs', icon: '📋' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">System & Logs</h2>
        <p className="text-slate-400">
          Manage server settings, updates, and view system logs
        </p>
      </div>

      {/* Tab Navigation */}
      <Card>
        <div className="flex gap-2 border-b border-slate-700 pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Tab Content */}
      <div>
        {activeTab === 'server' && (
          <BridgeServerSettings
            onSave={(url) => {
              localStorage.setItem('bridge-server-url', url);
            }}
          />
        )}
        {activeTab === 'updates' && <SystemUpdate />}
        {activeTab === 'logs' && <LogViewer />}
      </div>
    </div>
  );
}
