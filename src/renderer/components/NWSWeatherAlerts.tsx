import { useState, useEffect } from 'react';
import { Radio } from '../types';
import {
  fetchAlertsByPoint,
  fetchAlertsByState,
  WeatherAlert,
  shouldAutoBroadcast,
  formatAlertForBroadcast,
  getAlertEmoji,
  getAlertColor,
  US_STATES,
} from '../lib/weatherService';

interface NWSWeatherAlertsProps {
  radios: Radio[];
  onSendMessage: (radioId: string, text: string, channel: number) => void;
}

const STORAGE_KEY = 'nws-weather-settings';

interface NWSSettings {
  enabled: boolean;
  autoBroadcast: boolean;
  monitorLocation: 'state' | 'coords';
  selectedState: string;
  latitude: string;
  longitude: string;
  updateInterval: number;
}

const defaultSettings: NWSSettings = {
  enabled: true,
  autoBroadcast: true,
  monitorLocation: 'state',
  selectedState: 'CA',
  latitude: '37.7749',
  longitude: '-122.4194',
  updateInterval: 5,
};

export default function NWSWeatherAlerts({ radios, onSendMessage }: NWSWeatherAlertsProps) {
  // Load settings from localStorage
  const [settings, setSettings] = useState<NWSSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...defaultSettings, ...JSON.parse(stored) };
      } catch (e) {
        console.error('Error loading NWS settings:', e);
      }
    }
    return defaultSettings;
  });

  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  const [lastWeatherCheck, setLastWeatherCheck] = useState<Date | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [broadcastedAlerts, setBroadcastedAlerts] = useState<Set<string>>(new Set());
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Play alert sound
  const playAlert = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Fetch weather alerts
  const fetchWeatherAlerts = async () => {
    if (!settings.enabled) return;

    setWeatherLoading(true);
    try {
      let response;
      if (settings.monitorLocation === 'state') {
        response = await fetchAlertsByState(settings.selectedState);
      } else {
        response = await fetchAlertsByPoint(
          parseFloat(settings.latitude),
          parseFloat(settings.longitude)
        );
      }

      setWeatherAlerts(response.alerts);
      setLastWeatherCheck(new Date());

      // Auto-broadcast severe alerts
      if (settings.autoBroadcast && radios.length > 0) {
        response.alerts.forEach(alert => {
          if (shouldAutoBroadcast(alert) && !broadcastedAlerts.has(alert.id)) {
            const message = formatAlertForBroadcast(alert);
            onSendMessage(radios[0].id, message, 0);
            setBroadcastedAlerts(prev => new Set([...prev, alert.id]));
            playAlert();
          }
        });
      }
    } catch (error) {
      console.error('Error fetching weather alerts:', error);
    } finally {
      setWeatherLoading(false);
    }
  };

  // Auto-fetch weather alerts on interval
  useEffect(() => {
    if (!settings.enabled) return;

    fetchWeatherAlerts();
    const interval = setInterval(fetchWeatherAlerts, settings.updateInterval * 60 * 1000);

    return () => clearInterval(interval);
  }, [settings.enabled, settings.monitorLocation, settings.selectedState, settings.latitude, settings.longitude, settings.updateInterval, broadcastedAlerts, radios, settings.autoBroadcast]);

  // Broadcast weather alert
  const broadcastWeatherAlert = (alert: WeatherAlert) => {
    if (radios.length === 0) return;
    const message = formatAlertForBroadcast(alert);
    onSendMessage(radios[0].id, message, 0);
    setBroadcastedAlerts(prev => new Set([...prev, alert.id]));
  };

  // Get time until alert expires
  const getTimeUntilExpires = (alert: WeatherAlert): string => {
    const remaining = alert.expires.getTime() - Date.now();
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);

    if (remaining < 0) return 'Expired';
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const activeWeatherAlerts = weatherAlerts.filter(a => a.expires.getTime() > Date.now());

  const updateSetting = <K extends keyof NWSSettings>(key: K, value: NWSSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Static color class mappings for Tailwind (dynamic classes don't work with JIT)
  const alertColorClasses = {
    red: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      hover: 'hover:bg-red-500/20',
      badge: 'bg-red-500',
      button: 'bg-red-600 hover:bg-red-700',
    },
    orange: {
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      hover: 'hover:bg-orange-500/20',
      badge: 'bg-orange-500',
      button: 'bg-orange-600 hover:bg-orange-700',
    },
    yellow: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      hover: 'hover:bg-yellow-500/20',
      badge: 'bg-yellow-500',
      button: 'bg-yellow-600 hover:bg-yellow-700',
    },
  } as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">🌩️ NWS Weather Alerts</h2>
        <p className="text-slate-400">
          Monitor and broadcast National Weather Service alerts to your mesh network
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-orange-500/10 border border-orange-500/30">
          <div className="text-sm text-orange-300">Active Alerts</div>
          <div className="text-4xl font-bold text-orange-400">{activeWeatherAlerts.length}</div>
          <div className="text-xs text-orange-300">NWS warnings/watches</div>
        </div>

        <div className="card bg-blue-500/10 border border-blue-500/30">
          <div className="text-sm text-blue-300">Monitoring</div>
          <div className="text-2xl font-bold text-blue-400">
            {settings.monitorLocation === 'state'
              ? US_STATES.find(s => s.code === settings.selectedState)?.name
              : `${parseFloat(settings.latitude).toFixed(2)}°, ${parseFloat(settings.longitude).toFixed(2)}°`}
          </div>
          <div className="text-xs text-blue-300">
            {settings.monitorLocation === 'state' ? 'State' : 'GPS Coordinates'}
          </div>
        </div>

        <div className="card bg-green-500/10 border border-green-500/30">
          <div className="text-sm text-green-300">Auto-Broadcast</div>
          <div className="text-2xl font-bold text-green-400">
            {settings.autoBroadcast ? 'Enabled' : 'Disabled'}
          </div>
          <div className="text-xs text-green-300">
            {lastWeatherCheck ? `Last check: ${lastWeatherCheck.toLocaleTimeString()}` : 'Not yet checked'}
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Alert Settings</h3>
          <div className="flex gap-2">
            <button
              onClick={fetchWeatherAlerts}
              disabled={weatherLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-semibold"
            >
              {weatherLoading ? '⏳ Loading...' : '🔄 Refresh Now'}
            </button>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateSetting('enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Monitor By</label>
            <select
              value={settings.monitorLocation}
              onChange={(e) => updateSetting('monitorLocation', e.target.value as 'state' | 'coords')}
              className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2"
            >
              <option value="state">State</option>
              <option value="coords">GPS Coordinates</option>
            </select>
          </div>

          {settings.monitorLocation === 'state' ? (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">State</label>
              <select
                value={settings.selectedState}
                onChange={(e) => updateSetting('selectedState', e.target.value)}
                className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2"
              >
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Latitude</label>
                <input
                  type="text"
                  value={settings.latitude}
                  onChange={(e) => updateSetting('latitude', e.target.value)}
                  placeholder="37.7749"
                  className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Longitude</label>
                <input
                  type="text"
                  value={settings.longitude}
                  onChange={(e) => updateSetting('longitude', e.target.value)}
                  placeholder="-122.4194"
                  className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Update Interval (minutes)</label>
            <input
              type="number"
              value={settings.updateInterval}
              onChange={(e) => updateSetting('updateInterval', parseInt(e.target.value))}
              min="1"
              max="60"
              className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white text-sm">Auto-Broadcast Severe Alerts</div>
              <div className="text-xs text-slate-400">Automatically send extreme weather warnings</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoBroadcast}
                onChange={(e) => updateSetting('autoBroadcast', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <strong>Auto-broadcast</strong> will automatically send Extreme, Severe, and some Moderate alerts to the mesh.
              All settings are saved automatically and persist across sessions.
            </div>
          </div>
        </div>
      </div>

      {/* Active Weather Alerts */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">Active Weather Alerts</h3>

        {activeWeatherAlerts.length > 0 ? (
          <div className="space-y-2">
            {activeWeatherAlerts.map(alert => {
              const color = getAlertColor(alert.severity);
              const isSelected = selectedAlert === alert.id;
              const colorClasses = alertColorClasses[color as keyof typeof alertColorClasses] || alertColorClasses.yellow;

              return (
                <div
                  key={alert.id}
                  className={`${colorClasses.bg} border ${colorClasses.border} rounded-lg p-4 cursor-pointer ${colorClasses.hover} transition-all ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => setSelectedAlert(isSelected ? null : alert.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{getAlertEmoji(alert)}</div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-bold text-white">{alert.event}</h4>
                          <p className="text-sm text-slate-400">{alert.areaDesc}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${colorClasses.badge} text-white`}>
                            {alert.severity}
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-700 text-white">
                            {getTimeUntilExpires(alert)}
                          </span>
                        </div>
                      </div>

                      {alert.headline && (
                        <p className="text-sm text-white mb-2">{alert.headline}</p>
                      )}

                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                          <div className="text-sm text-slate-300">
                            <strong>Description:</strong>
                            <p className="mt-1">{alert.description}</p>
                          </div>
                          {alert.instruction && (
                            <div className="text-sm text-slate-300">
                              <strong>Instructions:</strong>
                              <p className="mt-1">{alert.instruction}</p>
                            </div>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                broadcastWeatherAlert(alert);
                              }}
                              className={`${colorClasses.button} text-white px-4 py-2 rounded-lg text-sm font-semibold`}
                            >
                              📢 Broadcast Alert
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400">
            {settings.enabled ? (
              <>
                <svg className="w-12 h-12 mx-auto mb-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No active weather alerts for this location</p>
              </>
            ) : (
              <p>Weather monitoring is disabled</p>
            )}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="card bg-blue-500/10 border border-blue-500/30">
        <h3 className="text-lg font-semibold text-blue-300 mb-3">ℹ️ About NWS Alerts</h3>
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            This system monitors the <strong>National Weather Service (NWS)</strong> API for weather alerts
            in your selected location. Alerts are categorized by severity:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Extreme:</strong> Extraordinary threat to life/property (auto-broadcast)</li>
            <li><strong>Severe:</strong> Significant threat to life/property (auto-broadcast)</li>
            <li><strong>Moderate:</strong> Possible threat to life/property (some auto-broadcast)</li>
            <li><strong>Minor:</strong> Minimal threat (manual broadcast only)</li>
          </ul>
          <p className="pt-2">
            When auto-broadcast is enabled, severe weather warnings will be automatically sent to the mesh
            network to ensure everyone is informed of dangerous conditions.
          </p>
        </div>
      </div>
    </div>
  );
}
