import { MeshNode } from '../types';
import { formatTimeAgo, formatDateTime, formatCoordinates } from '../lib/formatters';

interface NodeDetailModalProps {
  node: MeshNode;
  onClose: () => void;
}

export function NodeDetailModal({ node, onClose }: NodeDetailModalProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-900 rounded-lg border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{node.longName}</h2>
            <p className="text-slate-400 text-sm">
              {node.shortName} • {node.nodeId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoCard label="Long Name" value={node.longName} />
              <InfoCard label="Short Name" value={node.shortName} />
              <InfoCard label="Node ID" value={node.nodeId} mono />
              <InfoCard label="Hardware Model" value={node.hwModel} />
              <InfoCard label="Node Number" value={node.num.toString()} />
              <InfoCard label="Last Heard" value={formatTimeAgo(node.lastHeard)} subtitle={formatDateTime(node.lastHeard)} />
              <InfoCard label="Seen By Radio" value={node.fromRadio || 'Unknown'} mono />
            </div>
          </section>

          {/* GPS/Position */}
          {node.position && (
            <section>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                GPS Position
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoCard label="Latitude" value={node.position.latitude.toFixed(6)} mono />
                <InfoCard label="Longitude" value={node.position.longitude.toFixed(6)} mono />
                {node.position.altitude !== undefined && (
                  <InfoCard label="Altitude" value={`${node.position.altitude} m`} />
                )}
                <InfoCard
                  label="Coordinates"
                  value={formatCoordinates(node.position.latitude, node.position.longitude)}
                  mono
                  className="md:col-span-2"
                />
                {node.position.time && (
                  <InfoCard label="GPS Time" value={formatDateTime(node.position.time)} />
                )}
              </div>
            </section>
          )}

          {/* Power & Battery */}
          {(node.batteryLevel !== undefined || node.voltage !== undefined) && (
            <section>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Power & Battery
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {node.batteryLevel !== undefined && (
                  <InfoCard
                    label="Battery Level"
                    value={`${node.batteryLevel}%`}
                    valueColor={
                      node.batteryLevel > 80 ? 'text-green-400' :
                      node.batteryLevel > 50 ? 'text-yellow-400' :
                      node.batteryLevel > 20 ? 'text-orange-400' : 'text-red-400'
                    }
                  />
                )}
                {node.voltage !== undefined && (
                  <InfoCard label="Voltage" value={`${node.voltage.toFixed(2)} V`} />
                )}
              </div>
            </section>
          )}

          {/* Environmental Sensors */}
          {(node.temperature !== undefined || node.humidity !== undefined || node.pressure !== undefined) && (
            <section>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Environmental Sensors
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {node.temperature !== undefined && (
                  <InfoCard
                    label="Temperature"
                    value={`${node.temperature.toFixed(1)}°C`}
                    valueColor={
                      node.temperature < 0 ? 'text-blue-400' :
                      node.temperature < 25 ? 'text-green-400' :
                      node.temperature < 35 ? 'text-yellow-400' :
                      node.temperature < 50 ? 'text-orange-400' : 'text-red-400'
                    }
                  />
                )}
                {node.humidity !== undefined && (
                  <InfoCard
                    label="Humidity"
                    value={`${node.humidity.toFixed(0)}%`}
                    valueColor="text-blue-400"
                  />
                )}
                {node.pressure !== undefined && (
                  <InfoCard
                    label="Barometric Pressure"
                    value={`${node.pressure.toFixed(1)} hPa`}
                    valueColor="text-purple-400"
                  />
                )}
              </div>
            </section>
          )}

          {/* Network & Signal Quality */}
          {(node.snr !== undefined || node.channelUtilization !== undefined || node.airUtilTx !== undefined) && (
            <section>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
                Network & Telemetry
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {node.snr !== undefined && (
                  <InfoCard
                    label="Signal-to-Noise Ratio (SNR)"
                    value={`${node.snr.toFixed(1)} dB`}
                    valueColor={
                      node.snr > 5 ? 'text-green-400' :
                      node.snr > 0 ? 'text-yellow-400' : 'text-red-400'
                    }
                    subtitle={
                      node.snr > 10 ? 'Excellent' :
                      node.snr > 5 ? 'Good' :
                      node.snr > 0 ? 'Fair' : 'Poor'
                    }
                  />
                )}
                {node.channelUtilization !== undefined && (
                  <InfoCard
                    label="Channel Utilization"
                    value={`${node.channelUtilization.toFixed(1)}%`}
                    valueColor={
                      node.channelUtilization > 80 ? 'text-red-400' :
                      node.channelUtilization > 50 ? 'text-yellow-400' : 'text-green-400'
                    }
                    subtitle={
                      node.channelUtilization > 80 ? 'High' :
                      node.channelUtilization > 50 ? 'Moderate' : 'Low'
                    }
                  />
                )}
                {node.airUtilTx !== undefined && (
                  <InfoCard
                    label="Air Utilization (TX)"
                    value={`${node.airUtilTx.toFixed(1)}%`}
                    valueColor={
                      node.airUtilTx > 80 ? 'text-red-400' :
                      node.airUtilTx > 50 ? 'text-yellow-400' : 'text-green-400'
                    }
                    subtitle="Transmit airtime"
                  />
                )}
              </div>
            </section>
          )}

          {/* Info Note */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-300">
                <strong className="font-semibold">Note:</strong> This view shows the most recent telemetry data for this node.
                Historical telemetry tracking and charts are planned for a future update.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface InfoCardProps {
  label: string;
  value: string;
  subtitle?: string;
  mono?: boolean;
  valueColor?: string;
  className?: string;
}

function InfoCard({ label, value, subtitle, mono, valueColor = 'text-white', className = '' }: InfoCardProps) {
  return (
    <div className={`bg-slate-800/50 p-4 rounded-lg ${className}`}>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${valueColor} ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}
