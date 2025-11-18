import { useState } from 'react';
import { Card } from './ui/Card';

interface BridgeServerSettingsProps {
  onSave: (url: string) => void;
}

export function BridgeServerSettings({ onSave }: BridgeServerSettingsProps) {
  const [bridgeUrl, setBridgeUrl] = useState(() => {
    return localStorage.getItem('bridge-server-url') || getDefaultBridgeUrl();
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSave = () => {
    localStorage.setItem('bridge-server-url', bridgeUrl);
    onSave(bridgeUrl);
    alert(`Bridge server URL saved: ${bridgeUrl}\n\nReloading page to reconnect...`);
    window.location.reload();
  };

  const handleReset = () => {
    const defaultUrl = getDefaultBridgeUrl();
    setBridgeUrl(defaultUrl);
    localStorage.removeItem('bridge-server-url');
    onSave(defaultUrl);
    alert(`Reset to default: ${defaultUrl}\n\nReloading page to reconnect...`);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Bridge Server Settings</h2>
        <p className="text-slate-400">
          Configure connection to the Mesh Bridge backend server
        </p>
      </div>

      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Connection Settings</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Bridge Server WebSocket URL
            </label>
            <input
              type="text"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              className="input w-full font-mono"
              placeholder="ws://192.168.1.100:8080"
            />
            <p className="text-xs text-slate-500 mt-1">
              Format: ws://hostname:port or ws://ip-address:port
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-300">
                <strong className="font-semibold">Network Access:</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>For local access: <code className="text-blue-200 bg-blue-500/20 px-1 rounded">ws://localhost:8080</code></li>
                  <li>For LAN access from other devices: <code className="text-blue-200 bg-blue-500/20 px-1 rounded">ws://192.168.x.x:8080</code></li>
                  <li>Replace IP with your bridge server's LAN IP address</li>
                  <li>Find bridge server IP by running <code className="text-blue-200 bg-blue-500/20 px-1 rounded">hostname -I</code> on the server</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="btn-primary"
            >
              Save & Reconnect
            </button>
            <button
              onClick={handleReset}
              className="btn-secondary"
            >
              Reset to Default
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-lg font-semibold text-white">Advanced Network Information</h3>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div className="bg-slate-800/50 p-4 rounded-lg font-mono text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-slate-400">Current URL:</div>
                <div className="text-white">{bridgeUrl}</div>

                <div className="text-slate-400">Default Port:</div>
                <div className="text-white">8080</div>

                <div className="text-slate-400">Protocol:</div>
                <div className="text-white">WebSocket (ws://)</div>

                <div className="text-slate-400">Current Window Location:</div>
                <div className="text-white break-all">{window.location.href}</div>

                <div className="text-slate-400">Suggested Bridge URL:</div>
                <div className="text-white break-all">{getDefaultBridgeUrl()}</div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-300">
                  <strong className="font-semibold">Troubleshooting:</strong>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>Ensure bridge server is running: <code className="text-yellow-200 bg-yellow-500/20 px-1 rounded">npm run bridge</code></li>
                    <li>Check firewall allows port 8080</li>
                    <li>Verify both devices are on same network</li>
                    <li>Use IP address instead of hostname if DNS resolution fails</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Get the default bridge URL based on current window location
 * If accessing via LAN IP, use that IP. Otherwise use localhost.
 */
function getDefaultBridgeUrl(): string {
  const hostname = window.location.hostname;

  // If accessed via IP address (not localhost/127.0.0.1), use that IP for bridge
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
    return `ws://${hostname}:8080`;
  }

  // Default to localhost
  return 'ws://localhost:8080';
}
