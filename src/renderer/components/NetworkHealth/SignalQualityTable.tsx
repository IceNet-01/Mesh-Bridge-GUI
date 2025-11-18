import { Card } from '../ui/Card';

interface SignalQuality {
  nodeId: string;
  nodeName: string;
  avgSnr: number;
  avgRssi: number;
  messageCount: number;
  lastSeen: Date;
  interferenceScore: number;
}

interface SignalQualityTableProps {
  signalQuality: SignalQuality[];
}

export function SignalQualityTable({ signalQuality }: SignalQualityTableProps) {
  return (
    <Card>
      <h3 className="card-header">📡 Signal Quality & Interference Detection</h3>

      {signalQuality.length > 0 ? (
        <div className="space-y-2">
          {signalQuality.map(quality => (
            <div
              key={quality.nodeId}
              className="bg-slate-800/50 p-4 rounded-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-bold text-white">{quality.nodeName}</span>
                  <span className="text-sm text-slate-400 ml-2">({quality.messageCount} messages)</span>
                </div>
                <div className="flex gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">SNR</div>
                    <div className={`font-bold ${
                      quality.avgSnr > 5 ? 'text-green-400' :
                      quality.avgSnr > 0 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {quality.avgSnr.toFixed(1)} dB
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">RSSI</div>
                    <div className="font-bold text-blue-400">
                      {quality.avgRssi.toFixed(0)} dBm
                    </div>
                  </div>
                </div>
              </div>

              {/* Signal quality bar */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Signal Quality</div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        quality.avgSnr > 5 ? 'bg-green-500' :
                        quality.avgSnr > 0 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, (quality.avgSnr + 10) * 5))}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    Interference Score
                    {quality.interferenceScore > 30 && (
                      <span className="ml-2 text-red-400">⚠️ Detected</span>
                    )}
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        quality.interferenceScore > 50 ? 'bg-red-500' :
                        quality.interferenceScore > 30 ? 'bg-orange-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${quality.interferenceScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {quality.interferenceScore > 30 && (
                <div className="mt-2 bg-orange-500/10 border border-orange-500/30 rounded p-2">
                  <p className="text-xs text-orange-300">
                    <strong>Interference Detected:</strong> Strong signal ({quality.avgRssi.toFixed(0)} dBm) but poor SNR ({quality.avgSnr.toFixed(1)} dB).
                    This suggests RF interference, noisy environment, or competing transmissions on the same frequency.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">
          <p>No signal quality data available</p>
          <p className="text-sm text-slate-500 mt-1">Data will appear as messages are received</p>
        </div>
      )}
    </Card>
  );
}
