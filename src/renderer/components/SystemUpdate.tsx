import { useState, useEffect } from 'react';
import { Card } from './ui/Card';

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  publishedAt: string;
  releaseNotes: string;
}

interface UpdateStatus {
  updating: boolean;
  progress: string;
  error: string | null;
  success: boolean;
}

export function SystemUpdate() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    updating: false,
    progress: '',
    error: null,
    success: false,
  });
  const [sudoPassword, setSudoPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setLoading(true);
    try {
      // Get bridge server URL from localStorage
      const bridgeUrl = localStorage.getItem('bridge-server-url') || 'ws://localhost:8888';
      const httpUrl = bridgeUrl.replace('ws://', 'http://');

      const response = await fetch(`${httpUrl}/api/version-check`);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setVersionInfo(data);
    } catch (error) {
      console.error('Failed to check for updates:', error);

      // Check if it's a connection error with port 8080 (old default)
      const bridgeUrl = localStorage.getItem('bridge-server-url') || '';
      const isUsingOldPort = bridgeUrl.includes(':8080');

      let errorMessage = `Failed to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`;

      if (isUsingOldPort) {
        errorMessage += '⚠️ You may be using an old bridge server URL (port 8080).\n\n';
        errorMessage += 'The bridge server now uses port 8888 by default.\n\n';
        errorMessage += 'Fix: Go to Settings → Bridge Server and update the URL to ws://localhost:8888\n';
        errorMessage += 'Or clear your browser cache and reload the page.';
      } else {
        errorMessage += 'Make sure the bridge server is running on the correct port.';
      }

      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!sudoPassword && showPasswordPrompt) {
      alert('Please enter your sudo password');
      return;
    }

    setUpdateStatus({
      updating: true,
      progress: 'Starting update...',
      error: null,
      success: false,
    });

    try {
      // Get bridge server URL from localStorage
      const bridgeUrl = localStorage.getItem('bridge-server-url') || 'ws://localhost:8888';
      const httpUrl = bridgeUrl.replace('ws://', 'http://');

      const response = await fetch(`${httpUrl}/api/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: sudoPassword || null,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data = JSON.parse(line);

              if (data.type === 'progress') {
                setUpdateStatus(prev => ({
                  ...prev,
                  progress: data.message,
                }));
              } else if (data.type === 'error') {
                setUpdateStatus(prev => ({
                  ...prev,
                  updating: false,
                  error: data.message,
                }));
              } else if (data.type === 'success') {
                setUpdateStatus(prev => ({
                  ...prev,
                  updating: false,
                  success: true,
                  progress: data.message,
                }));

                // Reload the page after successful update
                setTimeout(() => {
                  window.location.reload();
                }, 3000);
              } else if (data.type === 'needs_password') {
                setShowPasswordPrompt(true);
                setUpdateStatus(prev => ({
                  ...prev,
                  updating: false,
                  progress: 'Sudo password required',
                }));
              }
            } catch (e) {
              console.error('Failed to parse update progress:', e);
            }
          }
        }
      }
    } catch (error) {
      setUpdateStatus({
        updating: false,
        progress: '',
        error: error instanceof Error ? error.message : 'Update failed',
        success: false,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">System Update</h2>
        <p className="text-slate-400">
          Check for and install updates to Mesh Bridge GUI
        </p>
      </div>

      {/* Current Version */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Version Information</h3>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span>Checking for updates...</span>
          </div>
        ) : versionInfo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-400 mb-1">Current Version</div>
                <div className="text-2xl font-bold text-white">{versionInfo.current}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400 mb-1">Latest Version</div>
                <div className="text-2xl font-bold text-white">{versionInfo.latest}</div>
              </div>
            </div>

            {versionInfo.updateAvailable ? (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-blue-300 mb-2">Update Available!</h4>
                    <p className="text-sm text-blue-200 mb-3">
                      Version {versionInfo.latest} is now available (released {new Date(versionInfo.publishedAt).toLocaleDateString()})
                    </p>
                    {versionInfo.releaseNotes && (
                      <div className="bg-slate-900/50 rounded p-3 mb-3">
                        <div className="text-xs text-slate-400 mb-1">Release Notes:</div>
                        <div className="text-sm text-slate-300 whitespace-pre-wrap">
                          {versionInfo.releaseNotes.substring(0, 300)}
                          {versionInfo.releaseNotes.length > 300 && '...'}
                        </div>
                      </div>
                    )}
                    <a
                      href={versionInfo.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:text-blue-300 underline"
                    >
                      View full release notes on GitHub →
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h4 className="text-lg font-semibold text-green-300">You're up to date!</h4>
                    <p className="text-sm text-green-200">
                      You have the latest version installed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={checkForUpdates}
              className="btn-secondary"
              disabled={loading}
            >
              Check Again
            </button>
          </div>
        ) : (
          <div className="text-slate-400">Failed to check for updates</div>
        )}
      </Card>

      {/* Update Section */}
      {versionInfo?.updateAvailable && (
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">One-Click Update</h3>

          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-300">
                  <strong className="font-semibold">Before updating:</strong>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>The update will pull the latest code from GitHub</li>
                    <li>Install any new dependencies with npm install</li>
                    <li>Rebuild the application</li>
                    <li>The application will restart automatically</li>
                    <li>This process may take 2-3 minutes</li>
                  </ul>
                </div>
              </div>
            </div>

            {showPasswordPrompt && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sudo Password (if required)
                </label>
                <input
                  type="password"
                  value={sudoPassword}
                  onChange={(e) => setSudoPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Enter sudo password if npm requires it"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty if your system doesn't require sudo for npm install
                </p>
              </div>
            )}

            {updateStatus.updating && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full flex-shrink-0 mt-0.5"></div>
                  <div className="flex-1">
                    <div className="text-blue-300 font-medium mb-1">Updating...</div>
                    <div className="text-sm text-blue-200">{updateStatus.progress}</div>
                  </div>
                </div>
              </div>
            )}

            {updateStatus.error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <div>
                    <div className="text-red-300 font-medium mb-1">Update Failed</div>
                    <div className="text-sm text-red-200">{updateStatus.error}</div>
                  </div>
                </div>
              </div>
            )}

            {updateStatus.success && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="text-green-300 font-medium mb-1">Update Successful!</div>
                    <div className="text-sm text-green-200">{updateStatus.progress}</div>
                    <div className="text-sm text-green-200 mt-1">Reloading in 3 seconds...</div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleUpdate}
              disabled={updateStatus.updating}
              className="btn-primary text-lg py-3"
            >
              {updateStatus.updating ? 'Updating...' : '🚀 Update Now'}
            </button>
          </div>
        </Card>
      )}

      {/* Manual Update Instructions */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Manual Update</h3>

        <div className="space-y-3">
          <p className="text-slate-300 text-sm">
            If the automatic update fails, you can update manually:
          </p>

          <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-sm space-y-2">
            <div className="text-slate-400"># 1. Pull latest changes</div>
            <div className="text-white">git pull origin main</div>

            <div className="text-slate-400 mt-3"># 2. Install dependencies</div>
            <div className="text-white">npm install</div>

            <div className="text-slate-400 mt-3"># 3. Rebuild the application</div>
            <div className="text-white">npm run build</div>

            <div className="text-slate-400 mt-3"># 4. Restart the service</div>
            <div className="text-white">npm run service:restart</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
