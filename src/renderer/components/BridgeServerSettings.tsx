import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { useStore } from '../store/useStore';

interface BridgeServerSettingsProps {
  onSave: (url: string) => void;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  error?: string;
}

export function BridgeServerSettings({ onSave }: BridgeServerSettingsProps) {
  const shutdownServer = useStore(state => state.shutdownServer);
  const checkForUpdates = useStore(state => state.checkForUpdates);
  const triggerUpdate = useStore(state => state.triggerUpdate);
  const manager = useStore(state => state.manager);

  const [bridgeUrl, setBridgeUrl] = useState(() => {
    return localStorage.getItem('bridge-server-url') || getDefaultBridgeUrl();
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Listen for update info from server
  useEffect(() => {
    const handleUpdateInfo = (info: UpdateInfo) => {
      setUpdateInfo(info);
      setCheckingUpdates(false);
    };

    const handleUpdateTriggered = (result: { success: boolean; message?: string; error?: string }) => {
      setUpdating(false);
      if (result.success) {
        alert(result.message || 'Update initiated. The server will restart automatically.');
      } else {
        alert(`Update failed: ${result.error}`);
      }
    };

    manager.on('update-info', handleUpdateInfo);
    manager.on('update-triggered', handleUpdateTriggered);

    return () => {
      manager.off('update-info', handleUpdateInfo);
      manager.off('update-triggered', handleUpdateTriggered);
    };
  }, [manager]);

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

  const handleShutdown = async () => {
    if (!confirm('Are you sure you want to shut down the bridge server?\n\nThis will disconnect all radios and close all connections.')) {
      return;
    }

    try {
      await shutdownServer();
      alert('Bridge server shutdown initiated.\n\nThe server will close in a few seconds.');
    } catch (error) {
      console.error('Failed to shutdown server:', error);
      alert('Failed to initiate server shutdown. The server may have already stopped.');
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      await checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setCheckingUpdates(false);
      alert('Failed to check for updates. Please try again later.');
    }
  };

  const handleUpdate = async () => {
    if (!confirm('Are you sure you want to update?\n\nThe bridge server will download the latest version, install dependencies, and restart automatically.')) {
      return;
    }

    setUpdating(true);
    try {
      await triggerUpdate();
    } catch (error) {
      console.error('Failed to trigger update:', error);
      setUpdating(false);
      alert('Failed to trigger update. Please try again later.');
    }
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

      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Software Updates</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">Current Version</div>
              <div className="text-lg font-semibold text-white">{updateInfo?.currentVersion || 'Loading...'}</div>
            </div>
            <button
              onClick={handleCheckUpdates}
              disabled={checkingUpdates}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className={`w-5 h-5 ${checkingUpdates ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {checkingUpdates ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>

          {updateInfo && !checkingUpdates && (
            <>
              {updateInfo.updateAvailable ? (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-sm text-blue-300">
                        <strong className="font-semibold">Update Available!</strong>
                        <div className="mt-2">
                          <div>Latest version: <span className="font-mono text-blue-200">{updateInfo.latestVersion}</span></div>
                          {updateInfo.publishedAt && (
                            <div className="text-xs mt-1">Published: {new Date(updateInfo.publishedAt).toLocaleDateString()}</div>
                          )}
                        </div>
                        {updateInfo.releaseNotes && (
                          <details className="mt-2">
                            <summary className="cursor-pointer hover:text-blue-200">Release Notes</summary>
                            <div className="mt-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {updateInfo.releaseNotes}
                            </div>
                          </details>
                        )}
                      </div>
                      <button
                        onClick={handleUpdate}
                        disabled={updating}
                        className="btn-primary mt-3 flex items-center gap-2"
                      >
                        <svg className={`w-5 h-5 ${updating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {updating ? 'Updating...' : 'Update Now'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-green-300">
                      <strong className="font-semibold">You're up to date!</strong>
                      <div className="mt-1">Version {updateInfo.currentVersion} is the latest version.</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {updateInfo?.error && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-300">
                  <strong className="font-semibold">Unable to check for updates</strong>
                  <div className="mt-1">{updateInfo.error}</div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-300">
              <strong>How updates work:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside text-slate-400">
                <li>Updates are pulled from the GitHub repository</li>
                <li>Dependencies are automatically installed</li>
                <li>The application is rebuilt if needed</li>
                <li>The server restarts automatically after update</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Server Control</h3>

        <div className="space-y-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm text-red-300">
                <strong className="font-semibold">Warning:</strong> Shutting down the bridge server will:
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>Disconnect all connected radios</li>
                  <li>Close all WebSocket connections</li>
                  <li>Stop the bridge server process</li>
                  <li>Require manually restarting the server to reconnect</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            onClick={handleShutdown}
            className="btn-danger flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            Shutdown Bridge Server
          </button>
        </div>
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
