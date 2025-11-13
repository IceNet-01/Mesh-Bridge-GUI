import { BridgeConfig, Radio } from '../types';

interface BridgeConfigurationProps {
  config: BridgeConfig;
  radios: Radio[];
  onUpdate: (config: Partial<BridgeConfig>) => void;
}

function BridgeConfiguration({ config, onUpdate }: BridgeConfigurationProps) {
  const handleToggleBridge = () => {
    onUpdate({ enabled: !config.enabled });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Bridge Configuration</h2>
        <p className="text-slate-400">Configure global bridge settings</p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-blue-500/10 border border-blue-500/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white font-medium">Automatic Message Forwarding</p>
            <p className="text-sm text-blue-200 mt-1">
              Messages are automatically forwarded between all connected radios using smart channel matching.
              The bridge searches for channels with matching names and encryption keys (PSKs), ensuring messages
              stay encrypted throughout the mesh. No manual route configuration needed!
            </p>
          </div>
        </div>
      </div>

      {/* Global Settings */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Global Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
            <div>
              <p className="text-white font-medium">Enable Bridge</p>
              <p className="text-sm text-slate-400">
                Master switch for all message forwarding
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={handleToggleBridge}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Deduplication Window (seconds)
              </label>
              <input
                type="number"
                value={config.deduplicationWindow}
                onChange={(e) => onUpdate({ deduplicationWindow: parseInt(e.target.value) })}
                className="input w-full"
                min={10}
                max={300}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Reconnect Delay (ms)
              </label>
              <input
                type="number"
                value={config.reconnectDelay}
                onChange={(e) => onUpdate({ reconnectDelay: parseInt(e.target.value) })}
                className="input w-full"
                min={1000}
                max={60000}
                step={1000}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Max Reconnect Attempts
              </label>
              <input
                type="number"
                value={config.maxReconnectAttempts}
                onChange={(e) => onUpdate({ maxReconnectAttempts: parseInt(e.target.value) })}
                className="input w-full"
                min={1}
                max={20}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
            <div>
              <p className="text-white font-medium">Auto-Reconnect</p>
              <p className="text-sm text-slate-400">
                Automatically reconnect radios when connection is lost
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoReconnect}
                onChange={(e) => onUpdate({ autoReconnect: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </div>

    </div>
  );
}

export default BridgeConfiguration;
