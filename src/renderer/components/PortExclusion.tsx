import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { useStore } from '../store/useStore';

export function PortExclusion() {
  const [excludedPorts, setExcludedPorts] = useState<string[]>([]);
  const [availablePorts, setAvailablePorts] = useState<Array<{ path: string; manufacturer?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPort, setSelectedPort] = useState('');
  const [customPort, setCustomPort] = useState('');
  const manager = useStore(state => state.manager);

  useEffect(() => {
    if (!manager.isConnected()) return;

    // Request current excluded ports
    manager.send({ type: 'port-get-excluded' });

    // Request available ports
    manager.send({ type: 'list-ports' });

    const handleMessage = ((event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'excluded-ports':
            setExcludedPorts(data.excludedPorts || []);
            setLoading(false);
            break;

          case 'excluded-ports-updated':
            setExcludedPorts(data.excludedPorts || []);
            break;

          case 'ports-list':
            setAvailablePorts(data.ports || []);
            if (data.excludedPorts) {
              setExcludedPorts(data.excludedPorts);
            }
            setLoading(false);
            break;

          case 'port-exclude-result':
            if (data.success) {
              setExcludedPorts(data.excludedPorts || []);
              setSelectedPort('');
              setCustomPort('');
              // Refresh port list
              if (manager.isConnected()) {
                manager.send({ type: 'list-ports' });
              }
            } else {
              alert(`Failed to exclude port: ${data.error}`);
            }
            break;

          case 'port-include-result':
            if (data.success) {
              setExcludedPorts(data.excludedPorts || []);
              // Refresh port list
              if (manager.isConnected()) {
                manager.send({ type: 'list-ports' });
              }
            } else {
              alert(`Failed to include port: ${data.error}`);
            }
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }) as EventListener;

    manager.addEventListener('message', handleMessage);

    return () => {
      manager.removeEventListener('message', handleMessage);
    };
  }, [manager]);

  const handleExcludePort = () => {
    if (!manager.isConnected()) return;

    const portToExclude = customPort || selectedPort;
    if (!portToExclude) {
      alert('Please select or enter a port to exclude');
      return;
    }

    manager.send({
      type: 'port-exclude',
      portPath: portToExclude
    });
  };

  const handleIncludePort = (portPath: string) => {
    if (!manager.isConnected()) return;

    if (confirm(`Remove "${portPath}" from exclusion list?`)) {
      manager.send({
        type: 'port-include',
        portPath
      });
    }
  };

  const handleRefresh = () => {
    if (!manager.isConnected()) return;
    setLoading(true);
    manager.send({ type: 'list-ports' });
    manager.send({ type: 'port-get-excluded' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Port Exclusion</h2>
        <p className="text-slate-400">
          Manage ports that should be excluded from bridge usage. Excluded ports persist across reboots.
        </p>
      </div>

      {/* Excluded Ports List */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Excluded Ports</h3>
          <button
            onClick={handleRefresh}
            className="btn-secondary text-sm"
            disabled={loading}
          >
            {loading ? '⟳ Loading...' : '⟳ Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span>Loading...</span>
          </div>
        ) : excludedPorts.length === 0 ? (
          <div className="bg-slate-800/50 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <p className="text-slate-400">No excluded ports</p>
            <p className="text-sm text-slate-500 mt-1">Add ports below to prevent the bridge from using them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {excludedPorts.map(port => (
              <div
                key={port}
                className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 15.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="font-mono text-white">{port}</span>
                </div>
                <button
                  onClick={() => handleIncludePort(port)}
                  className="btn-secondary text-sm"
                >
                  Remove Exclusion
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Exclusion */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Add Port Exclusion</h3>

        <div className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-300">
                <strong className="font-semibold">Why exclude ports?</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>Reserve ports for other applications</li>
                  <li>Prevent accidental connections to critical devices</li>
                  <li>Maintain specific port assignments</li>
                  <li>Exclusions persist across system reboots</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Select from available ports */}
          {availablePorts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select from Available Ports
              </label>
              <select
                value={selectedPort}
                onChange={(e) => {
                  setSelectedPort(e.target.value);
                  setCustomPort('');
                }}
                className="input w-full"
              >
                <option value="">-- Select a port --</option>
                {availablePorts.map(port => (
                  <option key={port.path} value={port.path}>
                    {port.path} {port.manufacturer ? `(${port.manufacturer})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Or enter custom port */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Or Enter Port Path Manually
            </label>
            <input
              type="text"
              value={customPort}
              onChange={(e) => {
                setCustomPort(e.target.value);
                setSelectedPort('');
              }}
              className="input w-full font-mono"
              placeholder="/dev/ttyUSB0"
            />
            <p className="text-xs text-slate-500 mt-1">
              Common formats: /dev/ttyUSB0, /dev/ttyACM0, COM3 (Windows)
            </p>
          </div>

          <button
            onClick={handleExcludePort}
            disabled={!selectedPort && !customPort}
            className="btn-primary"
          >
            🚫 Exclude Port
          </button>
        </div>
      </Card>

      {/* Warning Card */}
      <Card>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-yellow-300">
              <strong className="font-semibold">Important Notes:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Cannot exclude ports with active radio connections</li>
                <li>Disconnect radio first before excluding its port</li>
                <li>Exclusions are saved to bridge-config.json</li>
                <li>Excluded ports will not appear in available ports list</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
