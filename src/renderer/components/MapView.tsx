import { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Radio, MeshNode } from '../types';

// Fix for default marker icons in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom icons for different node types
const radioIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 8.4 12.5 28.5 12.5 28.5S25 20.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#2563eb"/>
      <circle cx="12.5" cy="12.5" r="6" fill="#fff"/>
    </svg>
  `),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});

const nodeIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 8.4 12.5 28.5 12.5 28.5S25 20.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#10b981"/>
      <circle cx="12.5" cy="12.5" r="6" fill="#fff"/>
    </svg>
  `),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});

interface MapViewProps {
  nodes: MeshNode[];
  radios: Radio[];
}

// Component to auto-fit bounds when markers change
function MapBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [positions, map]);

  return null;
}

export function MapView({ nodes, radios }: MapViewProps) {
  // Debug: Log nodes on mount and when they change
  useEffect(() => {
    console.log('[MapView] Nodes:', nodes.length, 'with positions:', nodes.filter(n => n.position).length);
    console.log('[MapView] Radios:', radios.length);
  }, [nodes, radios]);

  // Collect all positions from nodes and radios
  const positions = useMemo(() => {
    const pos: [number, number][] = [];

    // Add node positions
    nodes.forEach(node => {
      if (node.position) {
        pos.push([node.position.latitude, node.position.longitude]);
      }
    });

    // Add radio positions (if they have nodeInfo with position)
    radios.forEach(radio => {
      const node = nodes.find(n => n.nodeId === radio.nodeInfo?.nodeId);
      if (node?.position) {
        pos.push([node.position.latitude, node.position.longitude]);
      }
    });

    return pos;
  }, [nodes, radios]);

  // Default center (will be overridden by auto-fit if we have positions)
  // Use first position if available, otherwise default to world view center
  const defaultCenter: [number, number] = positions.length > 0
    ? positions[0]
    : [20, 0]; // Center of world map

  // Format time ago
  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Check if node is a radio
  const isRadio = (nodeId: string) => {
    return radios.some(r => r.nodeInfo?.nodeId === nodeId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 p-4">
        <h1 className="text-2xl font-bold text-gray-900">Mesh Network Map</h1>
        <p className="text-sm text-gray-600 mt-1">
          Showing {positions.length} node{positions.length !== 1 ? 's' : ''} with location data
        </p>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={positions.length > 0 ? 13 : 2}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {positions.length > 0 && <MapBounds positions={positions} />}

          {nodes.map(node => {
            if (!node.position) return null;

            const isThisRadio = isRadio(node.nodeId);

            return (
              <Marker
                key={node.nodeId}
                position={[node.position.latitude, node.position.longitude]}
                icon={isThisRadio ? radioIcon : nodeIcon}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <div className="font-bold text-lg mb-2 flex items-center gap-2">
                      {isThisRadio && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          RADIO
                        </span>
                      )}
                      {node.longName}
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="text-gray-600">
                        <span className="font-semibold">Short:</span> {node.shortName}
                      </div>
                      <div className="text-gray-600">
                        <span className="font-semibold">ID:</span> {node.nodeId}
                      </div>
                      <div className="text-gray-600">
                        <span className="font-semibold">Hardware:</span> {node.hwModel}
                      </div>
                      <div className="text-gray-600">
                        <span className="font-semibold">Last Heard:</span> {formatTimeAgo(node.lastHeard)}
                      </div>

                      {node.snr !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-semibold">SNR:</span> {node.snr.toFixed(1)} dB
                        </div>
                      )}

                      {node.batteryLevel !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-semibold">Battery:</span> {node.batteryLevel}%
                        </div>
                      )}

                      {node.voltage !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-semibold">Voltage:</span> {node.voltage.toFixed(2)}V
                        </div>
                      )}

                      {node.position.altitude !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-semibold">Altitude:</span> {node.position.altitude}m
                        </div>
                      )}

                      <div className="text-gray-600 text-xs mt-2 pt-2 border-t border-gray-200">
                        <span className="font-semibold">Seen by:</span> {node.fromRadio}
                      </div>

                      <div className="text-gray-500 text-xs mt-1">
                        {node.position.latitude.toFixed(6)}, {node.position.longitude.toFixed(6)}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="bg-white border-t border-gray-200 p-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-600"></div>
            <span className="text-gray-700">Radio</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-600"></div>
            <span className="text-gray-700">Mesh Node</span>
          </div>
        </div>
      </div>
    </div>
  );
}
