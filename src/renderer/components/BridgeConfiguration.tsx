import { useState } from 'react';
import { BridgeConfig, BridgeRoute, Radio } from '../types';

interface BridgeConfigurationProps {
  config: BridgeConfig;
  radios: Radio[];
  onUpdate: (config: Partial<BridgeConfig>) => void;
}

function BridgeConfiguration({ config, radios, onUpdate }: BridgeConfigurationProps) {
  const [editingRoute, setEditingRoute] = useState<BridgeRoute | null>(null);

  const handleToggleBridge = () => {
    onUpdate({ enabled: !config.enabled });
  };

  const handleAddRoute = () => {
    const newRoute: BridgeRoute = {
      id: `route-${Date.now()}`,
      sourceRadios: [],
      targetRadios: [],
      enabled: true,
    };
    setEditingRoute(newRoute);
  };

  const handleSaveRoute = () => {
    if (!editingRoute) return;

    const existingIndex = config.bridges.findIndex((r) => r.id === editingRoute.id);
    let newBridges: BridgeRoute[];

    if (existingIndex >= 0) {
      newBridges = [...config.bridges];
      newBridges[existingIndex] = editingRoute;
    } else {
      newBridges = [...config.bridges, editingRoute];
    }

    onUpdate({ bridges: newBridges });
    setEditingRoute(null);
  };

  const handleDeleteRoute = (routeId: string) => {
    onUpdate({ bridges: config.bridges.filter((r) => r.id !== routeId) });
  };

  const handleToggleRoute = (routeId: string) => {
    const newBridges = config.bridges.map((r) =>
      r.id === routeId ? { ...r, enabled: !r.enabled } : r
    );
    onUpdate({ bridges: newBridges });
  };

  const connectedRadios = radios.filter((r) => r.status === 'connected');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Bridge Configuration</h2>
        <p className="text-slate-400">Configure message forwarding between radios</p>
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

      {/* Bridge Routes */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Bridge Routes</h3>
          <button onClick={handleAddRoute} className="btn-primary">
            <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Route
          </button>
        </div>

        {config.bridges.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p>No bridge routes configured</p>
            <p className="text-sm mt-2">Add a route to start forwarding messages between radios</p>
          </div>
        ) : (
          <div className="space-y-3">
            {config.bridges.map((route) => (
              <div
                key={route.id}
                className={`p-4 rounded-lg border ${
                  route.enabled ? 'bg-green-500/5 border-green-500/30' : 'bg-slate-800/50 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`status-dot ${route.enabled ? 'status-connected' : 'status-disconnected'}`} />
                    <span className="text-white font-medium">
                      Route {config.bridges.indexOf(route) + 1}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingRoute(route)}
                      className="p-2 hover:bg-slate-700 rounded transition-colors"
                      title="Edit"
                    >
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleRoute(route.id)}
                      className="p-2 hover:bg-slate-700 rounded transition-colors"
                      title={route.enabled ? 'Disable' : 'Enable'}
                    >
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {route.enabled ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        )}
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(route.id)}
                      className="p-2 hover:bg-red-500/20 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1">
                    <p className="text-slate-400 mb-1">Source Radios</p>
                    <div className="flex flex-wrap gap-1">
                      {route.sourceRadios.map((id) => (
                        <span key={id} className="badge-info">
                          {radios.find((r) => r.id === id)?.name || id}
                        </span>
                      ))}
                      {route.sourceRadios.length === 0 && (
                        <span className="text-slate-500">None</span>
                      )}
                    </div>
                  </div>
                  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-slate-400 mb-1">Target Radios</p>
                    <div className="flex flex-wrap gap-1">
                      {route.targetRadios.map((id) => (
                        <span key={id} className="badge-success">
                          {radios.find((r) => r.id === id)?.name || id}
                        </span>
                      ))}
                      {route.targetRadios.length === 0 && (
                        <span className="text-slate-500">None</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Route Modal */}
      {editingRoute && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-2xl font-bold text-white mb-4">
              {config.bridges.find((r) => r.id === editingRoute.id) ? 'Edit' : 'Add'} Bridge Route
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Source Radios (messages from)
                </label>
                <div className="space-y-2">
                  {connectedRadios.map((radio) => (
                    <label key={radio.id} className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700">
                      <input
                        type="checkbox"
                        checked={editingRoute.sourceRadios.includes(radio.id)}
                        onChange={(e) => {
                          const newSources = e.target.checked
                            ? [...editingRoute.sourceRadios, radio.id]
                            : editingRoute.sourceRadios.filter((id) => id !== radio.id);
                          setEditingRoute({ ...editingRoute, sourceRadios: newSources });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-white">{radio.name}</span>
                      <span className="text-xs text-slate-400">({radio.port})</span>
                    </label>
                  ))}
                  {connectedRadios.length === 0 && (
                    <p className="text-slate-400 text-center py-4">No radios connected</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Target Radios (forward to)
                </label>
                <div className="space-y-2">
                  {connectedRadios.map((radio) => (
                    <label key={radio.id} className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700">
                      <input
                        type="checkbox"
                        checked={editingRoute.targetRadios.includes(radio.id)}
                        onChange={(e) => {
                          const newTargets = e.target.checked
                            ? [...editingRoute.targetRadios, radio.id]
                            : editingRoute.targetRadios.filter((id) => id !== radio.id);
                          setEditingRoute({ ...editingRoute, targetRadios: newTargets });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-white">{radio.name}</span>
                      <span className="text-xs text-slate-400">({radio.port})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEditingRoute(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveRoute}
                className="btn-primary"
                disabled={editingRoute.sourceRadios.length === 0 || editingRoute.targetRadios.length === 0}
              >
                Save Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BridgeConfiguration;
