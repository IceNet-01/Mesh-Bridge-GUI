import { Radio } from '../types';

interface RadioListProps {
  radios: Radio[];
  onDisconnect: (radioId: string) => void;
}

function RadioList({ radios, onDisconnect }: RadioListProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Radio Management</h2>
        <p className="text-slate-400">Monitor and manage connected radios (auto-detects protocol)</p>
      </div>

      {radios.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No Radios Connected</h3>
          <p className="text-slate-400">Click "Connect Radio" to add your first radio device</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {radios.map((radio) => (
            <RadioCard key={radio.id} radio={radio} onDisconnect={onDisconnect} />
          ))}
        </div>
      )}
    </div>
  );
}

interface RadioCardProps {
  radio: Radio;
  onDisconnect: (radioId: string) => void;
}

function RadioCard({ radio, onDisconnect }: RadioCardProps) {
  const statusColors = {
    connected: 'border-green-500/50 bg-green-500/5',
    connecting: 'border-yellow-500/50 bg-yellow-500/5',
    disconnected: 'border-slate-700/50 bg-slate-800/50',
    error: 'border-red-500/50 bg-red-500/5',
  };

  const statusLabels = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Error',
  };

  const protocolColors = {
    meshtastic: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    reticulum: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    rnode: 'bg-green-500/20 text-green-300 border-green-500/30',
    auto: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
  };

  const protocolLabels = {
    meshtastic: 'Meshtastic',
    reticulum: 'Reticulum',
    rnode: 'RNode',
    auto: 'Auto-Detect'
  };

  return (
    <div className={`card p-6 ${statusColors[radio.status]}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`status-dot status-${radio.status}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">{radio.name}</h3>
              {radio.protocol && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${protocolColors[radio.protocol]}`}>
                  {protocolLabels[radio.protocol]}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">{radio.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-${radio.status === 'connected' ? 'success' : radio.status === 'error' ? 'error' : 'info'}`}>
            {statusLabels[radio.status]}
          </span>
          {radio.status === 'connected' && (
            <button
              onClick={() => onDisconnect(radio.id)}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
              title="Disconnect"
            >
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {radio.nodeInfo && (
        <div className="mb-4 p-3 bg-slate-900/50 rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-slate-400">Long Name</p>
              <p className="text-white font-medium">{radio.nodeInfo.longName}</p>
            </div>
            <div>
              <p className="text-slate-400">Short Name</p>
              <p className="text-white font-medium">{radio.nodeInfo.shortName}</p>
            </div>
            <div>
              <p className="text-slate-400">Node ID</p>
              <p className="text-white font-mono text-xs">{radio.nodeInfo.nodeId}</p>
            </div>
            <div>
              <p className="text-slate-400">Hardware</p>
              <p className="text-white font-medium">{radio.nodeInfo.hwModel}</p>
            </div>
          </div>
        </div>
      )}

      {/* Meshtastic-specific LoRa Configuration */}
      {radio.protocol === 'meshtastic' && radio.protocolMetadata?.loraConfig && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-300 text-xs font-semibold mb-2 uppercase">LoRa Configuration</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-slate-400">Region</p>
              <p className="text-white font-medium">{radio.protocolMetadata.loraConfig.region}</p>
            </div>
            <div>
              <p className="text-slate-400">Modem Preset</p>
              <p className="text-white font-medium">{radio.protocolMetadata.loraConfig.modemPreset}</p>
            </div>
            {radio.protocolMetadata.loraConfig.txPower !== undefined && (
              <div>
                <p className="text-slate-400">TX Power</p>
                <p className="text-white font-medium">{radio.protocolMetadata.loraConfig.txPower} dBm</p>
              </div>
            )}
            {radio.protocolMetadata.loraConfig.hopLimit !== undefined && (
              <div>
                <p className="text-slate-400">Hop Limit</p>
                <p className="text-white font-medium">{radio.protocolMetadata.loraConfig.hopLimit}</p>
              </div>
            )}
          </div>
          {radio.protocolMetadata.firmware && (
            <p className="text-xs text-slate-500 mt-2">Firmware: {radio.protocolMetadata.firmware}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <MetricItem label="Received" value={radio.messagesReceived} color="green" />
        <MetricItem label="Sent" value={radio.messagesSent} color="blue" />
        <MetricItem label="Errors" value={radio.errors} color="red" />
      </div>

      {radio.status === 'connected' && (
        <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-4 text-sm">
          {radio.batteryLevel !== undefined && (
            <div>
              <p className="text-slate-400 mb-1">Battery</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${radio.batteryLevel}%` }}
                  />
                </div>
                <span className="text-white font-medium">{radio.batteryLevel}%</span>
              </div>
            </div>
          )}
          {radio.channelUtilization !== undefined && (
            <div>
              <p className="text-slate-400 mb-1">Channel Util</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${radio.channelUtilization}%` }}
                  />
                </div>
                <span className="text-white font-medium">{radio.channelUtilization.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {radio.lastSeen && (
        <p className="text-xs text-slate-500 mt-4">
          Last seen: {new Date(radio.lastSeen).toLocaleString()}
        </p>
      )}
    </div>
  );
}

interface MetricItemProps {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'red';
}

function MetricItem({ label, value, color }: MetricItemProps) {
  const colors = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
  };

  return (
    <div className="text-center">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

export default RadioList;
