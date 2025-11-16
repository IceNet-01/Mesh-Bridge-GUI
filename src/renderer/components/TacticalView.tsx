import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MeshNode, Radio } from '../types';

interface TacticalViewProps {
  nodes: MeshNode[];
  radios: Radio[];
}

interface GPSTrack {
  nodeId: string;
  positions: Array<{
    latitude: number;
    longitude: number;
    timestamp: Date;
  }>;
}

interface TacticalChannel {
  name: string;
  psk: string;
  index: number;
  description: string;
}

// Auto-fit map to show all nodes
function AutoFitBounds({ nodes }: { nodes: MeshNode[] }) {
  const map = useMap();

  useEffect(() => {
    const nodesWithPos = nodes.filter(n => n.position);
    if (nodesWithPos.length === 0) return;

    const bounds = L.latLngBounds(
      nodesWithPos.map(n => [n.position!.latitude, n.position!.longitude])
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [nodes, map]);

  return null;
}

export default function TacticalView({ nodes, radios }: TacticalViewProps) {
  const [mapLayer, setMapLayer] = useState<'osm' | 'satellite' | 'topo'>('satellite');
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);
  const [breadcrumbAge, setBreadcrumbAge] = useState(60); // minutes
  const [gpsTrails, setGpsTrails] = useState<Map<string, GPSTrack>>(new Map());
  const [setupMode, setSetupMode] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [generatedChannel, setGeneratedChannel] = useState<TacticalChannel | null>(null);

  // Track GPS positions over time
  useEffect(() => {
    const newTrails = new Map(gpsTrails);

    nodes.forEach(node => {
      if (!node.position) return;

      const trail = newTrails.get(node.nodeId) || {
        nodeId: node.nodeId,
        positions: [],
      };

      // Add new position if it's different from the last one
      const lastPos = trail.positions[trail.positions.length - 1];
      const isDifferent = !lastPos ||
        Math.abs(lastPos.latitude - node.position.latitude) > 0.0001 ||
        Math.abs(lastPos.longitude - node.position.longitude) > 0.0001;

      if (isDifferent) {
        trail.positions.push({
          latitude: node.position.latitude,
          longitude: node.position.longitude,
          timestamp: new Date(),
        });

        // Keep only positions within the breadcrumb age window
        const cutoffTime = Date.now() - breadcrumbAge * 60 * 1000;
        trail.positions = trail.positions.filter(
          p => p.timestamp.getTime() > cutoffTime
        );
      }

      newTrails.set(node.nodeId, trail);
    });

    setGpsTrails(newTrails);
  }, [nodes, breadcrumbAge]);

  // Generate secure channel configuration
  const generateTacticalChannel = () => {
    if (!channelName.trim()) {
      alert('Please enter a channel name');
      return;
    }

    // Generate random PSK (AES-256 key)
    const pskBytes = new Uint8Array(32);
    crypto.getRandomValues(pskBytes);
    const pskBase64 = btoa(String.fromCharCode(...pskBytes));

    const channel: TacticalChannel = {
      name: channelName.trim(),
      psk: pskBase64,
      index: 1, // Secondary channel
      description: `Tactical channel: ${channelName}`,
    };

    setGeneratedChannel(channel);
  };

  // Copy channel config to clipboard
  const copyChannelConfig = () => {
    if (!generatedChannel) return;

    const config = `Meshtastic Tactical Channel: ${generatedChannel.name}
Channel Index: ${generatedChannel.index}
PSK (Base64): ${generatedChannel.psk}

⚠️ SECURE THIS KEY - Anyone with this PSK can decrypt your messages!

Setup Instructions:
1. Open Meshtastic app on each device
2. Go to Settings → Channels → Add Channel
3. Name: ${generatedChannel.name}
4. PSK: ${generatedChannel.psk}
5. Save and ensure channel index is ${generatedChannel.index}

All devices must use the EXACT same PSK and channel index.`;

    navigator.clipboard.writeText(config);
    alert('Channel configuration copied to clipboard!');
  };

  // Get color for node based on status
  const getNodeColor = (node: MeshNode): string => {
    const minutesSinceHeard = (Date.now() - node.lastHeard.getTime()) / 1000 / 60;

    if (minutesSinceHeard < 5) return '#22c55e'; // Green - active (< 5 min)
    if (minutesSinceHeard < 30) return '#eab308'; // Yellow - recent (< 30 min)
    return '#ef4444'; // Red - stale (> 30 min)
  };

  // Create custom marker icon
  const createNodeIcon = (node: MeshNode) => {
    const color = getNodeColor(node);
    const isRadio = radios.some(r => r.nodeInfo?.nodeId === node.nodeId);

    return L.divIcon({
      html: `
        <div style="position: relative; text-align: center;">
          <svg width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            ${isRadio ? `
              <!-- Radio/Base Station Icon -->
              <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
              <path d="M8 9l4-4 4 4M12 5v10" stroke="white" stroke-width="2" stroke-linecap="round"/>
            ` : `
              <!-- Person/Handheld Icon -->
              <circle cx="12" cy="7" r="3" fill="${color}"/>
              <path d="M12 11c-3 0-5 2-5 4v5h10v-5c0-2-2-4-5-4z" fill="${color}" stroke="white" stroke-width="1"/>
            `}
          </svg>
          <div style="
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            background: ${color};
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${node.shortName}</div>
        </div>
      `,
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  };

  const nodesWithPosition = nodes.filter(n => n.position);
  const defaultCenter: [number, number] = nodesWithPosition.length > 0
    ? [nodesWithPosition[0].position!.latitude, nodesWithPosition[0].position!.longitude]
    : [40.7128, -74.0060];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Tactical Awareness Kit</h2>
        <p className="text-slate-400">
          Real-time team tracking with GPS breadcrumbs and secure channel setup
        </p>
      </div>

      {/* Setup Mode Panel */}
      {setupMode ? (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">🔒 Tactical Channel Setup</h3>
            <button
              onClick={() => setSetupMode(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-yellow-300 mb-1">Security Notice</h4>
                  <p className="text-xs text-slate-400">
                    This will generate a cryptographically secure AES-256 key for your tactical channel.
                    Anyone with this key can decrypt your messages. Share it only with trusted team members
                    via secure means (in person, encrypted chat, etc.).
                  </p>
                </div>
              </div>
            </div>

            {!generatedChannel ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Tactical Channel Name
                  </label>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    placeholder="e.g., Alpha Team, Search & Rescue, Event Ops"
                    className="input w-full"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Choose a descriptive name for this tactical channel
                  </p>
                </div>

                <button
                  onClick={generateTacticalChannel}
                  className="btn-primary w-full"
                >
                  🔐 Generate Secure Channel
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-300 mb-3">
                    ✅ Channel Generated: {generatedChannel.name}
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Channel Index
                      </label>
                      <div className="bg-slate-900 p-2 rounded font-mono text-sm text-white">
                        {generatedChannel.index}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Pre-Shared Key (PSK) - AES-256
                      </label>
                      <div className="bg-slate-900 p-2 rounded font-mono text-xs text-white break-all">
                        {generatedChannel.psk}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={copyChannelConfig}
                    className="btn-primary flex-1"
                  >
                    📋 Copy Setup Instructions
                  </button>
                  <button
                    onClick={() => {
                      setGeneratedChannel(null);
                      setChannelName('');
                    }}
                    className="bg-slate-700 text-white px-4 py-2 rounded-lg hover:bg-slate-600"
                  >
                    Generate Another
                  </button>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-300 mb-2">Setup Instructions</h4>
                  <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                    <li>Copy the configuration using the button above</li>
                    <li>Share securely with team members (encrypted chat, in person)</li>
                    <li>Each member opens Meshtastic app → Settings → Channels</li>
                    <li>Add new channel with exact PSK and channel index</li>
                    <li>All devices must use IDENTICAL settings to communicate</li>
                    <li>Configure radios connected to this bridge via Configuration tab</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Stats & Controls */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-sm text-slate-400">Team Members</div>
            <div className="text-3xl font-bold text-white">{nodesWithPosition.length}</div>
            <div className="text-xs text-slate-500">with GPS</div>
          </div>

          <div className="card">
            <div className="text-sm text-slate-400">Active (&lt; 5 min)</div>
            <div className="text-3xl font-bold text-green-400">
              {nodesWithPosition.filter(n => (Date.now() - n.lastHeard.getTime()) < 5 * 60 * 1000).length}
            </div>
            <div className="text-xs text-slate-500">transmitting</div>
          </div>

          <div className="card">
            <div className="text-sm text-slate-400">Recent (&lt; 30 min)</div>
            <div className="text-3xl font-bold text-yellow-400">
              {nodesWithPosition.filter(n => {
                const age = Date.now() - n.lastHeard.getTime();
                return age >= 5 * 60 * 1000 && age < 30 * 60 * 1000;
              }).length}
            </div>
            <div className="text-xs text-slate-500">heard recently</div>
          </div>

          <div className="card">
            <button
              onClick={() => setSetupMode(true)}
              className="w-full h-full flex flex-col items-center justify-center gap-2 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm font-medium text-white">Channel Setup</span>
              <span className="text-xs text-slate-400">Configure tactical channel</span>
            </button>
          </div>
        </div>
      )}

      {/* Map Controls */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="breadcrumbs"
              checked={showBreadcrumbs}
              onChange={(e) => setShowBreadcrumbs(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="breadcrumbs" className="text-sm text-slate-300">
              Show GPS Trails
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">Trail Age:</label>
            <select
              value={breadcrumbAge}
              onChange={(e) => setBreadcrumbAge(parseInt(e.target.value))}
              className="bg-slate-700 text-white text-sm rounded px-2 py-1 border border-slate-600"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="360">6 hours</option>
              <option value="720">12 hours</option>
              <option value="1440">24 hours</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setMapLayer('osm')}
              className={`text-xs px-3 py-1 rounded ${mapLayer === 'osm' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Street
            </button>
            <button
              onClick={() => setMapLayer('satellite')}
              className={`text-xs px-3 py-1 rounded ${mapLayer === 'satellite' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Satellite
            </button>
            <button
              onClick={() => setMapLayer('topo')}
              className={`text-xs px-3 py-1 rounded ${mapLayer === 'topo' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Topo
            </button>
          </div>
        </div>
      </div>

      {/* Tactical Map */}
      <div className="card p-0 overflow-hidden" style={{ height: '700px' }}>
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <AutoFitBounds nodes={nodesWithPosition} />

          {mapLayer === 'osm' && (
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}
          {mapLayer === 'satellite' && (
            <TileLayer
              attribution='Tiles &copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          )}
          {mapLayer === 'topo' && (
            <TileLayer
              attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxZoom={17}
            />
          )}

          {/* GPS Breadcrumb Trails */}
          {showBreadcrumbs && Array.from(gpsTrails.values()).map(trail => {
            if (trail.positions.length < 2) return null;

            const node = nodes.find(n => n.nodeId === trail.nodeId);
            if (!node) return null;

            const color = getNodeColor(node);
            const coords: [number, number][] = trail.positions.map(p => [p.latitude, p.longitude]);

            return (
              <Polyline
                key={trail.nodeId}
                positions={coords}
                pathOptions={{
                  color: color,
                  weight: 3,
                  opacity: 0.7,
                  dashArray: '5, 10',
                }}
              />
            );
          })}

          {/* Node Markers */}
          {nodesWithPosition.map(node => (
            <Marker
              key={node.nodeId}
              position={[node.position!.latitude, node.position!.longitude]}
              icon={createNodeIcon(node)}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-bold text-lg mb-2">{node.longName}</h3>
                  <div className="text-sm space-y-1">
                    <div><strong>Call Sign:</strong> {node.shortName}</div>
                    <div><strong>Device:</strong> {node.hwModel}</div>
                    <div><strong>Position:</strong> {node.position!.latitude.toFixed(6)}, {node.position!.longitude.toFixed(6)}</div>
                    {node.position!.altitude && (
                      <div><strong>Altitude:</strong> {node.position!.altitude}m</div>
                    )}
                    <div><strong>Last Heard:</strong> {new Date(node.lastHeard).toLocaleString()}</div>
                    {node.batteryLevel !== undefined && (
                      <div><strong>Battery:</strong> {node.batteryLevel}%</div>
                    )}
                    {node.snr !== undefined && (
                      <div><strong>Signal (SNR):</strong> {node.snr} dB</div>
                    )}
                    {node.temperature !== undefined && (
                      <div><strong>Temperature:</strong> {node.temperature.toFixed(1)}°C</div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">Status Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span className="text-sm text-slate-300">Active (&lt; 5 min ago)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
            <span className="text-sm text-slate-300">Recent (5-30 min ago)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span className="text-sm text-slate-300">Stale (&gt; 30 min ago)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
