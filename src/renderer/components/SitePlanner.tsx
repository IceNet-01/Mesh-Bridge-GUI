import { useState } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Calculate radio horizon based on antenna heights
 * Uses the 4/3 Earth radius approximation for atmospheric refraction
 * Formula: d = 3.57 * (√h1 + √h2) where h is height in meters, d is in km
 */
function calculateRadioHorizon(txHeightMeters: number, rxHeightMeters: number): number {
  return 3.57 * (Math.sqrt(txHeightMeters) + Math.sqrt(rxHeightMeters));
}

/**
 * Calculate maximum range based on link budget with realistic constraints
 * Uses FSPL but caps at radio horizon and adds ground-based path loss
 */
function calculateMaxRange(
  txPowerDBm: number,
  txGainDBi: number,
  rxGainDBi: number,
  rxSensitivityDBm: number,
  frequencyMHz: number,
  txHeightMeters: number,
  rxHeightMeters: number,
  fadingMarginDB: number = 10 // Safety margin for fading/obstacles
): number {
  // Calculate radio horizon (line-of-sight limit due to Earth curvature)
  const radioHorizonKm = calculateRadioHorizon(txHeightMeters, rxHeightMeters);

  // Available link budget
  const linkBudget = txPowerDBm + txGainDBi + rxGainDBi - rxSensitivityDBm - fadingMarginDB;

  // Solve FSPL equation for distance (Free Space Path Loss)
  // FSPL(dB) = 20log₁₀(d) + 20log₁₀(f) + 32.44
  // where d = distance in km, f = frequency in MHz
  const exponent = (linkBudget - 20 * Math.log10(frequencyMHz) - 32.44) / 20;
  let fsplRangeKm = Math.pow(10, exponent);

  // Ground-based radios have additional losses beyond FSPL
  // Apply a more realistic path loss model for ground-based communications
  // Use a simplified 2-ray ground reflection model: add ~30-40dB loss for ground bounce
  const groundLossFactor = 0.3; // Reduces range by ~70% for ground-based radios
  let practicalRangeKm = fsplRangeKm * groundLossFactor;

  // Cap at radio horizon (can't see beyond the curve of the Earth)
  practicalRangeKm = Math.min(practicalRangeKm, radioHorizonKm);

  return practicalRangeKm;
}

interface TransmitterSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  antennaHeight: number; // meters
  txPower: number; // dBm
  txGain: number; // dBi
  frequency: number; // MHz
}

interface ReceiverConfig {
  antennaHeight: number; // meters
  rxGain: number; // dBi
  rxSensitivity: number; // dBm
  fadingMargin: number; // dB
}

// Default Meshtastic parameters
const MESHTASTIC_DEFAULTS = {
  // US915 LoRa settings
  frequency: 906.875, // MHz (US915 center frequency)
  txPower: 30, // dBm (1W max for US915)
  txGain: 2.15, // dBi (typical dipole)
  rxGain: 2.15, // dBi (typical dipole)
  rxSensitivity: -148, // dBm (typical LoRa sensitivity for SF12)
  antennaHeight: 10, // meters
  fadingMargin: 10, // dB
};

function SitePlanner() {
  const [sites, setSites] = useState<TransmitterSite[]>([]);
  const [receiverConfig, setReceiverConfig] = useState<ReceiverConfig>({
    antennaHeight: MESHTASTIC_DEFAULTS.antennaHeight,
    rxGain: MESHTASTIC_DEFAULTS.rxGain,
    rxSensitivity: MESHTASTIC_DEFAULTS.rxSensitivity,
    fadingMargin: MESHTASTIC_DEFAULTS.fadingMargin,
  });
  const [mapLayer, setMapLayer] = useState<'osm' | 'satellite' | 'topo'>('topo');
  const [isAddingNewSite, setIsAddingNewSite] = useState(false);
  const [clickToPlaceMode, setClickToPlaceMode] = useState(false);
  const [newSite, setNewSite] = useState<Partial<TransmitterSite>>({
    name: '',
    latitude: 40.7128,
    longitude: -74.0060,
    antennaHeight: MESHTASTIC_DEFAULTS.antennaHeight,
    txPower: MESHTASTIC_DEFAULTS.txPower,
    txGain: MESHTASTIC_DEFAULTS.txGain,
    frequency: MESHTASTIC_DEFAULTS.frequency,
  });

  // Calculate coverage for each site
  const siteCoverage = sites.map(site => {
    const rangeKm = calculateMaxRange(
      site.txPower,
      site.txGain,
      receiverConfig.rxGain,
      receiverConfig.rxSensitivity,
      site.frequency,
      site.antennaHeight,
      receiverConfig.antennaHeight,
      receiverConfig.fadingMargin
    );
    return {
      siteId: site.id,
      rangeKm,
      rangeMeters: rangeKm * 1000,
    };
  });

  const handleAddSite = () => {
    if (!newSite.name || !newSite.latitude || !newSite.longitude) {
      alert('Please fill in all required fields');
      return;
    }

    const site: TransmitterSite = {
      id: `site-${Date.now()}`,
      name: newSite.name!,
      latitude: newSite.latitude!,
      longitude: newSite.longitude!,
      antennaHeight: newSite.antennaHeight!,
      txPower: newSite.txPower!,
      txGain: newSite.txGain!,
      frequency: newSite.frequency!,
    };

    setSites([...sites, site]);
    setIsAddingNewSite(false);
    setNewSite({
      name: '',
      latitude: 40.7128,
      longitude: -74.0060,
      antennaHeight: MESHTASTIC_DEFAULTS.antennaHeight,
      txPower: MESHTASTIC_DEFAULTS.txPower,
      txGain: MESHTASTIC_DEFAULTS.txGain,
      frequency: MESHTASTIC_DEFAULTS.frequency,
    });
  };

  const handleDeleteSite = (siteId: string) => {
    setSites(sites.filter(s => s.id !== siteId));
  };

  const defaultCenter: [number, number] = sites.length > 0
    ? [sites[0].latitude, sites[0].longitude]
    : [40.7128, -74.0060]; // Default to NYC

  // Component to handle map clicks for placing sites
  function MapClickHandler() {
    useMapEvents({
      click(e) {
        if (clickToPlaceMode) {
          const { lat, lng } = e.latlng;
          setNewSite({
            ...newSite,
            latitude: lat,
            longitude: lng,
            name: newSite.name || `Site ${sites.length + 1}`,
          });
          setIsAddingNewSite(true);
          setClickToPlaceMode(false);
        }
      },
    });
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">RF Site Planner</h2>
        <p className="text-slate-400">
          Plan and visualize Meshtastic radio coverage using RF propagation models
        </p>
      </div>

      {/* Info Alert */}
      <div className="card bg-blue-500/10 border border-blue-500/30">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-300 mb-1">Ground-Based RF Propagation Model (v2.0)</h3>
            <p className="text-xs text-slate-400">
              Uses FSPL with radio horizon calculation (Earth curvature) and ground-based path loss factor.
              Estimates are conservative for ground-level radios. Actual range varies with terrain, obstacles,
              and atmospheric conditions. Click-to-place towers on map for quick site planning.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="space-y-6">
          {/* Receiver Configuration */}
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4">Receiver Parameters</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Antenna Height (m)
                </label>
                <input
                  type="number"
                  value={receiverConfig.antennaHeight}
                  onChange={(e) => setReceiverConfig({ ...receiverConfig, antennaHeight: parseFloat(e.target.value) })}
                  className="input w-full"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Antenna Gain (dBi)
                </label>
                <input
                  type="number"
                  value={receiverConfig.rxGain}
                  onChange={(e) => setReceiverConfig({ ...receiverConfig, rxGain: parseFloat(e.target.value) })}
                  className="input w-full"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sensitivity (dBm)
                </label>
                <input
                  type="number"
                  value={receiverConfig.rxSensitivity}
                  onChange={(e) => setReceiverConfig({ ...receiverConfig, rxSensitivity: parseFloat(e.target.value) })}
                  className="input w-full"
                  step="1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Typical: -148 dBm (SF12)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Fading Margin (dB)
                </label>
                <input
                  type="number"
                  value={receiverConfig.fadingMargin}
                  onChange={(e) => setReceiverConfig({ ...receiverConfig, fadingMargin: parseFloat(e.target.value) })}
                  className="input w-full"
                  step="1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Safety margin for obstacles/fading
                </p>
              </div>
            </div>
          </div>

          {/* Transmitter Sites */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Transmitter Sites ({sites.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setClickToPlaceMode(!clickToPlaceMode);
                    setIsAddingNewSite(false);
                  }}
                  className={`text-sm px-3 py-2 rounded-lg transition-colors ${
                    clickToPlaceMode
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {clickToPlaceMode ? '📍 Click Map to Place' : '🗺️ Click to Place'}
                </button>
                <button
                  onClick={() => {
                    setIsAddingNewSite(!isAddingNewSite);
                    setClickToPlaceMode(false);
                  }}
                  className="btn-primary text-sm"
                >
                  {isAddingNewSite ? 'Cancel' : '+ Manual Entry'}
                </button>
              </div>
            </div>

            {/* Add New Site Form */}
            {isAddingNewSite && (
              <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h4 className="text-sm font-semibold text-white mb-3">New Transmitter Site</h4>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Site Name"
                    value={newSite.name}
                    onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                    className="input w-full text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Latitude"
                      value={newSite.latitude}
                      onChange={(e) => setNewSite({ ...newSite, latitude: parseFloat(e.target.value) })}
                      className="input w-full text-sm"
                      step="0.000001"
                    />
                    <input
                      type="number"
                      placeholder="Longitude"
                      value={newSite.longitude}
                      onChange={(e) => setNewSite({ ...newSite, longitude: parseFloat(e.target.value) })}
                      className="input w-full text-sm"
                      step="0.000001"
                    />
                  </div>
                  <input
                    type="number"
                    placeholder="Antenna Height (m)"
                    value={newSite.antennaHeight}
                    onChange={(e) => setNewSite({ ...newSite, antennaHeight: parseFloat(e.target.value) })}
                    className="input w-full text-sm"
                    step="0.1"
                  />
                  <input
                    type="number"
                    placeholder="TX Power (dBm)"
                    value={newSite.txPower}
                    onChange={(e) => setNewSite({ ...newSite, txPower: parseFloat(e.target.value) })}
                    className="input w-full text-sm"
                    step="1"
                  />
                  <input
                    type="number"
                    placeholder="TX Gain (dBi)"
                    value={newSite.txGain}
                    onChange={(e) => setNewSite({ ...newSite, txGain: parseFloat(e.target.value) })}
                    className="input w-full text-sm"
                    step="0.1"
                  />
                  <input
                    type="number"
                    placeholder="Frequency (MHz)"
                    value={newSite.frequency}
                    onChange={(e) => setNewSite({ ...newSite, frequency: parseFloat(e.target.value) })}
                    className="input w-full text-sm"
                    step="0.001"
                  />
                  <button
                    onClick={handleAddSite}
                    className="btn-primary w-full text-sm"
                  >
                    Add Site
                  </button>
                </div>
              </div>
            )}

            {/* Sites List */}
            <div className="space-y-2">
              {sites.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  No sites configured. Add a site to begin planning.
                </p>
              ) : (
                sites.map((site) => {
                  const coverage = siteCoverage.find(c => c.siteId === site.id);
                  return (
                    <div key={site.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-white">{site.name}</h4>
                          <p className="text-xs text-slate-400">
                            {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteSite(site.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-slate-400">
                          <span className="font-medium">Height:</span> {site.antennaHeight}m
                        </div>
                        <div className="text-slate-400">
                          <span className="font-medium">Power:</span> {site.txPower}dBm
                        </div>
                        <div className="text-slate-400">
                          <span className="font-medium">Gain:</span> {site.txGain}dBi
                        </div>
                        <div className="text-slate-400">
                          <span className="font-medium">Freq:</span> {site.frequency}MHz
                        </div>
                      </div>
                      {coverage && (
                        <div className="mt-2 pt-2 border-t border-slate-700">
                          <div className="text-sm font-semibold text-green-400">
                            Predicted Range: {coverage.rangeKm.toFixed(2)} km
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Map */}
        <div className="lg:col-span-2">
          <div className="card p-0 overflow-hidden" style={{ height: '800px' }}>
            {/* Layer Switcher */}
            <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setMapLayer('osm')}
                className={`px-4 py-2 text-sm font-medium transition-colors block w-full text-left ${
                  mapLayer === 'osm' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                🗺️ Street Map
              </button>
              <button
                onClick={() => setMapLayer('satellite')}
                className={`px-4 py-2 text-sm font-medium transition-colors block w-full text-left border-t border-gray-200 ${
                  mapLayer === 'satellite' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                🛰️ Satellite
              </button>
              <button
                onClick={() => setMapLayer('topo')}
                className={`px-4 py-2 text-sm font-medium transition-colors block w-full text-left border-t border-gray-200 ${
                  mapLayer === 'topo' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                ⛰️ Topographic
              </button>
            </div>

            <MapContainer
              center={defaultCenter}
              zoom={10}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <MapClickHandler />
              {mapLayer === 'osm' && (
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

              {/* Render sites and coverage circles */}
              {sites.map((site) => {
                const coverage = siteCoverage.find(c => c.siteId === site.id);
                if (!coverage) return null;

                return (
                  <div key={site.id}>
                    {/* Coverage Circle */}
                    <Circle
                      center={[site.latitude, site.longitude]}
                      radius={coverage.rangeMeters}
                      pathOptions={{
                        color: '#3b82f6',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.1,
                        weight: 2,
                      }}
                    />
                    {/* Transmitter Marker */}
                    <Marker
                      position={[site.latitude, site.longitude]}
                      icon={L.divIcon({
                        html: `
                          <div style="position: relative; text-align: center;">
                            <svg width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="12" cy="12" r="10" fill="#3b82f6" stroke="white" stroke-width="2"/>
                              <path d="M8 9l4-4 4 4M12 5v10" stroke="white" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                            <div style="
                              position: absolute;
                              top: -25px;
                              left: 50%;
                              transform: translateX(-50%);
                              background: white;
                              padding: 2px 6px;
                              border-radius: 4px;
                              font-size: 11px;
                              font-weight: 600;
                              white-space: nowrap;
                              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                              border: 1px solid #3b82f6;
                              color: #3b82f6;
                            ">${site.name}</div>
                          </div>
                        `,
                        className: '',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15],
                      })}
                    >
                      <Popup>
                        <div className="min-w-[200px]">
                          <h3 className="font-bold text-lg mb-2">{site.name}</h3>
                          <div className="text-sm space-y-1">
                            <div><strong>Location:</strong> {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}</div>
                            <div><strong>Antenna Height:</strong> {site.antennaHeight}m</div>
                            <div><strong>TX Power:</strong> {site.txPower} dBm</div>
                            <div><strong>TX Gain:</strong> {site.txGain} dBi</div>
                            <div><strong>Frequency:</strong> {site.frequency} MHz</div>
                            <div className="pt-2 border-t mt-2">
                              <strong className="text-green-600">Predicted Range:</strong> {coverage.rangeKm.toFixed(2)} km
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  </div>
                );
              })}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SitePlanner;
