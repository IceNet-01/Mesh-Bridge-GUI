import { useState } from 'react';
import { Card } from './ui/Card';
import { useStore } from '../store/useStore';

export function WiFiDeviceConnector() {
  const [hostAddress, setHostAddress] = useState('');
  const [useTLS, setUseTLS] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentConnections, setRecentConnections] = useState<string[]>(() => {
    // Load recent connections from localStorage
    try {
      const saved = localStorage.getItem('wifi-recent-connections');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const connectRadio = useStore(state => state.connectRadio);

  const saveRecentConnection = (address: string) => {
    const updated = [address, ...recentConnections.filter(a => a !== address)].slice(0, 5);
    setRecentConnections(updated);
    localStorage.setItem('wifi-recent-connections', JSON.stringify(updated));
  };

  const handleConnect = async () => {
    if (!hostAddress.trim()) {
      setError('Please enter an IP address or hostname');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const result = await connectRadio(hostAddress.trim(), 'wifi', { useTLS });

      if (result.success) {
        saveRecentConnection(hostAddress.trim());
        setHostAddress('');
      } else {
        setError(result.error || 'Failed to connect');
      }
    } catch (err) {
      console.error('WiFi connection error:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleQuickConnect = async (address: string) => {
    setHostAddress(address);
    setConnecting(true);
    setError(null);

    try {
      const result = await connectRadio(address, 'wifi', { useTLS });

      if (result.success) {
        saveRecentConnection(address);
      } else {
        setError(result.error || 'Failed to connect');
      }
    } catch (err) {
      console.error('WiFi connection error:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const removeRecentConnection = (address: string) => {
    const updated = recentConnections.filter(a => a !== address);
    setRecentConnections(updated);
    localStorage.setItem('wifi-recent-connections', JSON.stringify(updated));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">WiFi Device Connection</h2>
        <p className="text-slate-400">
          Connect to Meshtastic devices over WiFi/TCP
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Connect to Device</h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter the IP address or hostname of your Meshtastic device
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Device Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hostAddress}
                  onChange={(e) => setHostAddress(e.target.value)}
                  placeholder="192.168.1.100 or meshtastic.local"
                  className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !connecting) {
                      handleConnect();
                    }
                  }}
                  disabled={connecting}
                />
                <button
                  onClick={handleConnect}
                  disabled={connecting || !hostAddress.trim()}
                  className={`px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors ${
                    (connecting || !hostAddress.trim()) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {connecting ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Connecting...</span>
                    </div>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useTLS"
                checked={useTLS}
                onChange={(e) => setUseTLS(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="useTLS" className="text-sm text-slate-300">
                Use HTTPS/TLS (for devices with SSL certificates)
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {recentConnections.length > 0 && (
        <Card>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Recent Connections</h3>
            <div className="space-y-2">
              {recentConnections.map((address) => (
                <div
                  key={address}
                  className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-green-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                      </svg>
                    </div>
                    <span className="font-mono text-white">{address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQuickConnect(address)}
                      disabled={connecting}
                      className={`px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors ${
                        connecting ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => removeRecentConnection(address)}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      title="Remove from history"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-green-300">
              <strong className="font-semibold">WiFi Connection Requirements:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Your Meshtastic device must have WiFi enabled in its settings</li>
                <li>The device must be connected to the same network as this computer</li>
                <li>If using a single device, try <code className="bg-slate-800 px-1 rounded">meshtastic.local</code></li>
                <li>For multiple devices, use their specific IP addresses</li>
                <li><strong>Note:</strong> Enabling WiFi disables Bluetooth on the device</li>
                <li>ESP32-based devices support WiFi connections</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-amber-300">
              <strong className="font-semibold">HTTPS/TLS Note:</strong>
              <p className="mt-1">
                Meshtastic devices use self-signed certificates. If you enable HTTPS, you may need to
                first visit <code className="bg-slate-800 px-1 rounded">https://DEVICE_IP/</code> in your
                browser and accept the certificate before connecting.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
