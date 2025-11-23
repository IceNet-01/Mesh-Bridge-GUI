import { useState, useEffect } from 'react';
import { MeshNode, Radio, Message } from '../types';

interface EmergencyEvent {
  id: string;
  nodeId: string;
  nodeName: string;
  shortName: string;
  timestamp: Date;
  status: 'active' | 'responding' | 'resolved';
  message: string;
  position?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  batteryLevel?: number;
  temperature?: number;
  snr?: number;
  lastUpdate: Date;
  responseCount: number;
}

interface EmergencyResponseProps {
  nodes: MeshNode[];
  radios: Radio[];
  messages: Message[];
  onSendMessage: (radioId: string, text: string, channel: number) => void;
}

export default function EmergencyResponse({ nodes, radios, messages, onSendMessage }: EmergencyResponseProps) {
  const [emergencies, setEmergencies] = useState<EmergencyEvent[]>([]);
  const [autoRespond, setAutoRespond] = useState(true);
  const [alertSound, setAlertSound] = useState(true);
  const [selectedEmergency, setSelectedEmergency] = useState<string | null>(null);

  // Emergency keywords to detect
  const emergencyKeywords = [
    '#sos', 'sos', '#emergency', 'emergency', '#help', 'mayday',
    '#911', '911', '#rescue', 'rescue', '#urgent', 'urgent'
  ];

  // Play alert sound
  const playAlert = () => {
    if (!alertSound) return;

    // Create a simple beep using Web Audio API
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

  // Monitor messages for emergency keywords
  useEffect(() => {
    messages.forEach(msg => {
      const text = msg.text?.toLowerCase() || '';
      const hasEmergencyKeyword = emergencyKeywords.some(keyword =>
        text.includes(keyword.toLowerCase())
      );

      if (hasEmergencyKeyword) {
        // Use functional update to avoid dependency on emergencies state
        setEmergencies(prev => {
          // Check if we already have this emergency
          const existingEmergency = prev.find(e =>
            e.nodeId === msg.from &&
            Math.abs(new Date(e.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 60000 // Within 1 minute
          );

          if (existingEmergency) {
            return prev; // No change needed
          }

          const node = nodes.find(n => n.nodeId === msg.from || n.num.toString() === msg.from);

          const newEmergency: EmergencyEvent = {
            id: `emer-${Date.now()}-${msg.from}`,
            nodeId: msg.from.toString(),
            nodeName: node?.longName || 'Unknown',
            shortName: node?.shortName || '????',
            timestamp: new Date(msg.timestamp),
            status: 'active',
            message: msg.text || '',
            position: node?.position,
            batteryLevel: node?.batteryLevel,
            temperature: node?.temperature,
            snr: msg.snr,
            lastUpdate: new Date(),
            responseCount: 0,
          };

          playAlert();

          // Auto-respond if enabled
          if (autoRespond && radios.length > 0) {
            setTimeout(() => {
              handleAutoResponse(newEmergency);
            }, 1000);
          }

          return [newEmergency, ...prev];
        });
      }
    });
  }, [messages, nodes, radios, autoRespond]);

  // Auto-response to SOS
  const handleAutoResponse = (emergency: EmergencyEvent) => {
    if (radios.length === 0) return;

    const primaryRadio = radios[0];
    const node = nodes.find(n => n.nodeId === emergency.nodeId);

    let response = `🚨 EMERGENCY RESPONSE to ${emergency.shortName}:\n`;

    if (node?.position) {
      response += `✅ Location received: ${node.position.latitude.toFixed(6)}, ${node.position.longitude.toFixed(6)}\n`;
    } else {
      response += `⚠️ SEND GPS LOCATION (Settings→Position→Send Now)\n`;
    }

    if (node?.batteryLevel !== undefined) {
      response += `Battery: ${node.batteryLevel}%\n`;
    } else {
      response += `Send battery status\n`;
    }

    response += `Help is being notified. Stay calm. Do not move unless unsafe.`;

    onSendMessage(primaryRadio.id, response, 0);

    // Update response count
    setEmergencies(prev => prev.map(e =>
      e.id === emergency.id
        ? { ...e, responseCount: e.responseCount + 1, lastUpdate: new Date() }
        : e
    ));
  };

  // Update emergency status
  const updateEmergencyStatus = (emergencyId: string, status: EmergencyEvent['status']) => {
    setEmergencies(prev => prev.map(e =>
      e.id === emergencyId ? { ...e, status, lastUpdate: new Date() } : e
    ));

    if (status === 'responding' && radios.length > 0) {
      const emergency = emergencies.find(e => e.id === emergencyId);
      if (emergency) {
        onSendMessage(
          radios[0].id,
          `🚑 RESPONDING to ${emergency.shortName} emergency. Help is on the way!`,
          0
        );
      }
    }
  };

  // Broadcast emergency to all nodes
  const broadcastEmergency = (emergency: EmergencyEvent) => {
    if (radios.length === 0) return;

    let broadcast = `🚨 EMERGENCY BROADCAST:\n`;
    broadcast += `${emergency.shortName} needs help!\n`;

    if (emergency.position) {
      broadcast += `Location: ${emergency.position.latitude.toFixed(6)}, ${emergency.position.longitude.toFixed(6)}\n`;
    }

    broadcast += `All units respond if able.`;

    onSendMessage(radios[0].id, broadcast, 0);
  };

  // Get emergency duration
  const getEmergencyDuration = (emergency: EmergencyEvent): string => {
    const duration = Date.now() - new Date(emergency.timestamp).getTime();
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const activeEmergencies = emergencies.filter(e => e.status === 'active');
  const respondingEmergencies = emergencies.filter(e => e.status === 'responding');
  const resolvedEmergencies = emergencies.filter(e => e.status === 'resolved');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">🚨 SOS Emergency System</h2>
        <p className="text-slate-400">
          Monitor and respond to SOS emergencies from the mesh network
        </p>
      </div>

      {/* Alert Banner for Active Emergencies */}
      {activeEmergencies.length > 0 && (
        <div className="card bg-red-500/20 border-red-500 border-2 animate-pulse">
          <div className="flex items-center gap-4">
            <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-300">
                {activeEmergencies.length} ACTIVE EMERGENCY{activeEmergencies.length > 1 ? 'IES' : ''}
              </h3>
              <p className="text-red-200">Immediate attention required</p>
            </div>
            <button
              onClick={() => activeEmergencies.forEach(e => broadcastEmergency(e))}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold"
            >
              📢 Broadcast All
            </button>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-red-500/10 border border-red-500/30">
          <div className="text-sm text-red-300">Active SOS</div>
          <div className="text-4xl font-bold text-red-400">{activeEmergencies.length}</div>
          <div className="text-xs text-red-300">Needs immediate response</div>
        </div>

        <div className="card bg-yellow-500/10 border border-yellow-500/30">
          <div className="text-sm text-yellow-300">Responding</div>
          <div className="text-4xl font-bold text-yellow-400">{respondingEmergencies.length}</div>
          <div className="text-xs text-yellow-300">Help en route</div>
        </div>

        <div className="card bg-green-500/10 border border-green-500/30">
          <div className="text-sm text-green-300">Resolved</div>
          <div className="text-4xl font-bold text-green-400">{resolvedEmergencies.length}</div>
          <div className="text-xs text-green-300">Successfully handled</div>
        </div>
      </div>

      {/* SOS Settings */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">SOS Emergency System Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Auto-Response to SOS</div>
              <div className="text-sm text-slate-400">
                Automatically send help instructions when SOS detected
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRespond}
                onChange={(e) => setAutoRespond(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Alert Sound</div>
              <div className="text-sm text-slate-400">
                Play audio alert when new emergency detected
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={alertSound}
                onChange={(e) => setAlertSound(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-300 mb-2">Monitored Keywords</h4>
            <div className="flex flex-wrap gap-2">
              {emergencyKeywords.map(keyword => (
                <span key={keyword} className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs font-mono">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Events List */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white">SOS Emergency Events</h3>

        {emergencies.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-400 text-lg">No emergency events detected</p>
            <p className="text-slate-500 text-sm mt-2">System is monitoring for SOS keywords</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emergencies.map(emergency => {
              const isSelected = selectedEmergency === emergency.id;

              return (
                <div
                  key={emergency.id}
                  className={`card cursor-pointer transition-all ${
                    emergency.status === 'active'
                      ? 'border-2 border-red-500 bg-red-500/5'
                      : emergency.status === 'responding'
                      ? 'border border-yellow-500/50 bg-yellow-500/5'
                      : 'border border-green-500/30 bg-green-500/5'
                  } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => setSelectedEmergency(isSelected ? null : emergency.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Status Icon */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      emergency.status === 'active'
                        ? 'bg-red-500 animate-pulse'
                        : emergency.status === 'responding'
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}>
                      {emergency.status === 'active' && (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      {emergency.status === 'responding' && (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                      {emergency.status === 'resolved' && (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Emergency Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-lg font-bold text-white">
                            {emergency.nodeName} ({emergency.shortName})
                          </h4>
                          <p className="text-sm text-slate-400">
                            {emergency.timestamp.toLocaleString()} • Duration: {getEmergencyDuration(emergency)}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          emergency.status === 'active'
                            ? 'bg-red-500 text-white'
                            : emergency.status === 'responding'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-green-500 text-white'
                        }`}>
                          {emergency.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="bg-slate-900/50 p-3 rounded-lg mb-3">
                        <p className="text-white font-mono text-sm">{emergency.message}</p>
                      </div>

                      {/* Node Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        {emergency.position && (
                          <div className="bg-slate-800/50 p-2 rounded">
                            <div className="text-xs text-slate-400">GPS Location</div>
                            <div className="text-sm text-green-400 font-semibold">
                              {emergency.position.latitude.toFixed(6)}, {emergency.position.longitude.toFixed(6)}
                            </div>
                          </div>
                        )}
                        {emergency.batteryLevel !== undefined && (
                          <div className="bg-slate-800/50 p-2 rounded">
                            <div className="text-xs text-slate-400">Battery</div>
                            <div className={`text-sm font-semibold ${
                              emergency.batteryLevel > 50 ? 'text-green-400' :
                              emergency.batteryLevel > 20 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {emergency.batteryLevel}%
                            </div>
                          </div>
                        )}
                        {emergency.snr !== undefined && (
                          <div className="bg-slate-800/50 p-2 rounded">
                            <div className="text-xs text-slate-400">Signal (SNR)</div>
                            <div className="text-sm text-blue-400 font-semibold">
                              {emergency.snr} dB
                            </div>
                          </div>
                        )}
                        <div className="bg-slate-800/50 p-2 rounded">
                          <div className="text-xs text-slate-400">Responses</div>
                          <div className="text-sm text-white font-semibold">
                            {emergency.responseCount}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {isSelected && (
                        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-700">
                          {emergency.status === 'active' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateEmergencyStatus(emergency.id, 'responding');
                                }}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                              >
                                🚑 Mark Responding
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  broadcastEmergency(emergency);
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                              >
                                📢 Broadcast
                              </button>
                            </>
                          )}
                          {emergency.status === 'responding' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateEmergencyStatus(emergency.id, 'resolved');
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                            >
                              ✅ Mark Resolved
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoResponse(emergency);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                          >
                            📡 Send Instructions
                          </button>
                          {emergency.position && (
                            <a
                              href={`https://www.google.com/maps?q=${emergency.position.latitude},${emergency.position.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              🗺️ Open in Maps
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Emergency Instructions Card */}
      <div className="card bg-orange-500/10 border border-orange-500/30">
        <h3 className="text-lg font-semibold text-orange-300 mb-3">📋 Emergency Protocol</h3>
        <div className="space-y-2 text-sm text-slate-300">
          <p><strong>If you need help:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Send message with keyword: <code className="bg-slate-800 px-2 py-1 rounded">#sos</code> or <code className="bg-slate-800 px-2 py-1 rounded">#emergency</code></li>
            <li>Share your GPS location (Settings → Position → Send Now)</li>
            <li>Include details: injury, location, number of people</li>
            <li>Stay calm and await response</li>
            <li>Conserve device battery if possible</li>
          </ol>
          <p className="pt-2"><strong>Operators will:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Receive immediate alert with your position</li>
            <li>Send help instructions and status updates</li>
            <li>Coordinate rescue if needed</li>
            <li>Monitor your battery and signal status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
