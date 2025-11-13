import { useStore } from '../store/useStore';

/**
 * Reticulum Network Stack Dashboard
 *
 * Shows the global Reticulum network status (singleton) and all RNode transports.
 * RNode devices are automatically detected and added as transports to Reticulum.
 */
function ReticulumSettings() {
  const reticulumStatus = useStore(state => state.reticulumStatus);

  if (!reticulumStatus || !reticulumStatus.running) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Reticulum Network Stack</h2>
          <p className="text-slate-400">Cryptographic mesh networking with destination-based addressing</p>
        </div>

        {/* Info Banner */}
        <div className="card p-4 bg-purple-500/10 border border-purple-500/30">
          <div className="flex gap-3">
            <svg className="w-6 h-6 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-white font-medium">About Reticulum</p>
              <p className="text-sm text-purple-200 mt-1">
                Reticulum is a cryptographic networking stack for building local and wide-area networks with minimal infrastructure.
                It uses end-to-end encryption and destination-based addressing instead of IP addresses.
              </p>
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Reticulum Network Stack Starting...</h3>
          <p className="text-slate-400 mb-2">
            {!reticulumStatus
              ? 'Waiting for bridge server connection...'
              : 'Reticulum is initializing...'}
          </p>
          <p className="text-xs text-slate-500 mt-4">
            Reticulum auto-starts when the bridge server starts. Check logs if this takes more than a few seconds.
          </p>
        </div>

        {/* Architecture Info */}
        <div className="card p-6 bg-slate-900/50">
          <h3 className="text-lg font-bold text-white mb-3">Architecture</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              <p><strong className="text-white">Global Network:</strong> Reticulum runs as a single network instance (not per-radio)</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              <p><strong className="text-white">Auto-Start:</strong> Starts automatically when bridge server starts</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              <p><strong className="text-white">RNode Transports:</strong> RNode devices are detected and added as transports automatically</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              <p><strong className="text-white">Multiple Transports:</strong> You can have multiple RNode radios as transports for one network</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const transports = reticulumStatus.transports || [];
  const rnodeTransports = transports.filter(t => t.type === 'rnode');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Reticulum Network Stack</h2>
        <p className="text-slate-400">Global cryptographic mesh network • {transports.length} transport(s) connected</p>
      </div>

      {/* Network Status Card */}
      <div className="card p-6 border-2 border-green-500/30 bg-green-500/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="status-dot status-connected"></div>
          <h3 className="text-xl font-bold text-white">Network Online</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Identity */}
          {reticulumStatus.identity && (
            <div className="p-4 bg-slate-900/50 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">Identity Hash</p>
              <code className="text-white font-mono text-sm break-all">
                {reticulumStatus.identity.hash}
              </code>
            </div>
          )}

          {/* Destination */}
          {reticulumStatus.destination && (
            <div className="p-4 bg-slate-900/50 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">Destination Hash</p>
              <code className="text-white font-mono text-sm break-all">
                {reticulumStatus.destination.hash}
              </code>
              {reticulumStatus.destination.name && (
                <p className="text-xs text-slate-500 mt-1">Name: {reticulumStatus.destination.name}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RNode Transports */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">RNode Transports</h3>
          <span className="text-sm px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full">
            {rnodeTransports.length} device{rnodeTransports.length !== 1 ? 's' : ''}
          </span>
        </div>

        {rnodeTransports.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm mb-2">No RNode devices connected</p>
            <p className="text-xs text-slate-500">
              Plug in an RNode device and it will be auto-detected and added as a transport
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rnodeTransports.map((transport, index) => (
              <RNodeTransportCard key={transport.port} transport={transport} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* Transport Statistics */}
      {transports.length > 0 && (
        <div className="card p-6">
          <h3 className="text-xl font-bold text-white mb-4">Network Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatItem
              label="Total Transports"
              value={transports.length}
              color="purple"
            />
            <StatItem
              label="RNode Devices"
              value={rnodeTransports.length}
              color="blue"
            />
            <StatItem
              label="Messages Sent"
              value={transports.reduce((sum, t) => sum + t.messages_sent, 0)}
              color="green"
            />
            <StatItem
              label="Messages Received"
              value={transports.reduce((sum, t) => sum + t.messages_received, 0)}
              color="orange"
            />
          </div>
        </div>
      )}

      {/* Architecture Info */}
      <div className="card p-4 bg-slate-900/50">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white text-sm font-medium">Single Network, Multiple Transports</p>
            <p className="text-xs text-slate-400 mt-1">
              Reticulum runs as one global network. RNode devices are physical transports that provide connectivity.
              You can have multiple RNode radios working together as transports for the same network.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RNodeTransportCardProps {
  transport: any;
  index: number;
}

function RNodeTransportCard({ transport, index }: RNodeTransportCardProps) {
  return (
    <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg hover:border-purple-500/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`status-dot ${transport.connected ? 'status-connected' : 'status-disconnected'}`}></div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-white font-medium">RNode {index + 1}</h4>
              <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded border border-green-500/30">
                LoRa
              </span>
            </div>
            <code className="text-xs text-slate-400 font-mono">{transport.port}</code>
          </div>
        </div>
        <span className={`badge ${transport.connected ? 'badge-success' : 'badge-error'}`}>
          {transport.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* LoRa Configuration */}
      {transport.config && (
        <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
          <p className="text-blue-300 text-xs font-semibold mb-2 uppercase">LoRa Configuration</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {transport.config.frequency && (
              <div>
                <p className="text-slate-400">Frequency</p>
                <p className="text-white font-medium">{(transport.config.frequency / 1000000).toFixed(1)} MHz</p>
              </div>
            )}
            {transport.config.bandwidth && (
              <div>
                <p className="text-slate-400">Bandwidth</p>
                <p className="text-white font-medium">{(transport.config.bandwidth / 1000).toFixed(0)} kHz</p>
              </div>
            )}
            {transport.config.spreadingFactor && (
              <div>
                <p className="text-slate-400">Spreading Factor</p>
                <p className="text-white font-medium">SF{transport.config.spreadingFactor}</p>
              </div>
            )}
            {transport.config.codingRate && (
              <div>
                <p className="text-slate-400">Coding Rate</p>
                <p className="text-white font-medium">4/{transport.config.codingRate}</p>
              </div>
            )}
            {transport.config.txPower !== undefined && (
              <div>
                <p className="text-slate-400">TX Power</p>
                <p className="text-white font-medium">{transport.config.txPower} dBm</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-xs text-slate-400 mb-1">Sent</p>
          <p className="text-lg font-bold text-blue-400">{transport.messages_sent}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Received</p>
          <p className="text-lg font-bold text-green-400">{transport.messages_received}</p>
        </div>
      </div>

      {transport.added_at && (
        <p className="text-xs text-slate-500 mt-3 text-center">
          Added: {new Date(transport.added_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: number;
  color: 'purple' | 'blue' | 'green' | 'orange';
}

function StatItem({ label, value, color }: StatItemProps) {
  const colors = {
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
  };

  return (
    <div className="text-center p-4 bg-slate-900/30 rounded-lg">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

export default ReticulumSettings;
