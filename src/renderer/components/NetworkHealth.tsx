import { useState, useEffect, useMemo } from 'react';
import { MeshNode, Radio, Message } from '../types';

interface NetworkHealthProps {
  nodes: MeshNode[];
  radios: Radio[];
  messages: Message[];
}

interface ChannelMetric {
  timestamp: Date;
  utilization: number;
  airUtilTx: number;
  nodeId: string;
}

interface SignalQuality {
  nodeId: string;
  nodeName: string;
  avgSnr: number;
  avgRssi: number;
  messageCount: number;
  lastSeen: Date;
  interferenceScore: number; // 0-100, higher = more interference
}

interface NodeAirtime {
  nodeId: string;
  nodeName: string;
  messagesCount: number;
  estimatedAirtime: number; // percentage
  lastActive: Date;
}

export default function NetworkHealth({ nodes, messages }: NetworkHealthProps) {
  const [channelHistory, setChannelHistory] = useState<ChannelMetric[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h'>('1h');
  const [congestionThreshold] = useState(80); // 80% utilization = congestion
  const [showCongestionAlert, setShowCongestionAlert] = useState(false);

  // Update channel utilization history
  useEffect(() => {
    const interval = setInterval(() => {
      nodes.forEach(node => {
        if (node.channelUtilization !== undefined && node.channelUtilization > 0) {
          setChannelHistory(prev => {
            const newMetric: ChannelMetric = {
              timestamp: new Date(),
              utilization: node.channelUtilization!,
              airUtilTx: node.airUtilTx || 0,
              nodeId: node.nodeId
            };

            // Keep last 24 hours of data
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const filtered = [...prev, newMetric].filter(
              m => m.timestamp.getTime() > oneDayAgo
            );

            return filtered;
          });
        }
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [nodes]);

  // Check for congestion
  useEffect(() => {
    const currentUtilization = nodes
      .filter(n => n.channelUtilization !== undefined)
      .reduce((sum, n) => sum + (n.channelUtilization || 0), 0) / nodes.length;

    if (currentUtilization > congestionThreshold) {
      setShowCongestionAlert(true);
    } else {
      setShowCongestionAlert(false);
    }
  }, [nodes, congestionThreshold]);

  // Calculate signal quality metrics
  const signalQuality = useMemo<SignalQuality[]>(() => {
    const qualityMap = new Map<string, { snrSum: number; rssiSum: number; count: number; nodeId: string; nodeName: string; lastSeen: Date }>();

    messages.forEach(msg => {
      if (msg.snr !== undefined || msg.rssi !== undefined) {
        const nodeId = msg.from.toString();
        const node = nodes.find(n => n.nodeId === nodeId || n.num.toString() === nodeId);

        if (!qualityMap.has(nodeId)) {
          qualityMap.set(nodeId, {
            snrSum: 0,
            rssiSum: 0,
            count: 0,
            nodeId: nodeId,
            nodeName: node?.shortName || node?.longName || 'Unknown',
            lastSeen: msg.timestamp
          });
        }

        const entry = qualityMap.get(nodeId)!;
        if (msg.snr !== undefined) entry.snrSum += msg.snr;
        if (msg.rssi !== undefined) entry.rssiSum += msg.rssi;
        entry.count++;
        if (msg.timestamp > entry.lastSeen) entry.lastSeen = msg.timestamp;
      }
    });

    return Array.from(qualityMap.values()).map(entry => {
      const avgSnr = entry.snrSum / entry.count;
      const avgRssi = entry.rssiSum / entry.count;

      // Interference score: High RSSI + Low SNR = Interference
      // Normal: RSSI and SNR correlated
      // Interference: RSSI high but SNR low (noise floor raised)
      let interferenceScore = 0;
      if (avgRssi > -80 && avgSnr < 5) {
        // Strong signal but poor SNR = likely interference
        interferenceScore = Math.min(100, ((80 - Math.abs(avgRssi)) / 80) * 100);
      }

      return {
        nodeId: entry.nodeId,
        nodeName: entry.nodeName,
        avgSnr,
        avgRssi,
        messageCount: entry.count,
        lastSeen: entry.lastSeen,
        interferenceScore
      };
    }).sort((a, b) => b.messageCount - a.messageCount);
  }, [messages, nodes]);

  // Calculate airtime usage by node
  const airtimeByNode = useMemo<NodeAirtime[]>(() => {
    const messagesByNode = new Map<string, { count: number; nodeName: string; lastActive: Date }>();

    messages.forEach(msg => {
      const nodeId = msg.from.toString();
      const node = nodes.find(n => n.nodeId === nodeId || n.num.toString() === nodeId);

      if (!messagesByNode.has(nodeId)) {
        messagesByNode.set(nodeId, {
          count: 0,
          nodeName: node?.shortName || node?.longName || 'Unknown',
          lastActive: msg.timestamp
        });
      }

      const entry = messagesByNode.get(nodeId)!;
      entry.count++;
      if (msg.timestamp > entry.lastActive) entry.lastActive = msg.timestamp;
    });

    const totalMessages = messages.length;

    return Array.from(messagesByNode.entries()).map(([nodeId, data]) => ({
      nodeId,
      nodeName: data.nodeName,
      messagesCount: data.count,
      estimatedAirtime: totalMessages > 0 ? (data.count / totalMessages) * 100 : 0,
      lastActive: data.lastActive
    })).sort((a, b) => b.estimatedAirtime - a.estimatedAirtime);
  }, [messages, nodes]);

  // Calculate average metrics
  const avgChannelUtilization = useMemo(() => {
    const validNodes = nodes.filter(n => n.channelUtilization !== undefined && n.channelUtilization > 0);
    if (validNodes.length === 0) return 0;
    return validNodes.reduce((sum, n) => sum + (n.channelUtilization || 0), 0) / validNodes.length;
  }, [nodes]);

  const avgAirUtilTx = useMemo(() => {
    const validNodes = nodes.filter(n => n.airUtilTx !== undefined && n.airUtilTx > 0);
    if (validNodes.length === 0) return 0;
    return validNodes.reduce((sum, n) => sum + (n.airUtilTx || 0), 0) / validNodes.length;
  }, [nodes]);

  const avgSnr = useMemo(() => {
    if (signalQuality.length === 0) return 0;
    return signalQuality.reduce((sum, q) => sum + q.avgSnr, 0) / signalQuality.length;
  }, [signalQuality]);

  // Collision probability estimation
  // Based on channel utilization and number of active nodes
  const collisionProbability = useMemo(() => {
    if (avgChannelUtilization === 0) return 0;

    const activeNodes = nodes.filter(n =>
      n.lastHeard && (Date.now() - n.lastHeard.getTime()) < 15 * 60 * 1000
    ).length;

    // Simplified collision probability (actual calculation is more complex)
    // P = 1 - e^(-2 * G) where G is offered load
    // Approximation: utilization * active_nodes factor
    const offeredLoad = (avgChannelUtilization / 100) * Math.log(activeNodes + 1);
    return Math.min(100, offeredLoad * 50);
  }, [avgChannelUtilization, nodes]);

  // Network health score (0-100)
  const healthScore = useMemo(() => {
    let score = 100;

    // Deduct for high utilization
    if (avgChannelUtilization > 80) score -= 30;
    else if (avgChannelUtilization > 60) score -= 15;
    else if (avgChannelUtilization > 40) score -= 5;

    // Deduct for poor SNR
    if (avgSnr < 0) score -= 20;
    else if (avgSnr < 5) score -= 10;

    // Deduct for high collision probability
    if (collisionProbability > 50) score -= 20;
    else if (collisionProbability > 30) score -= 10;

    // Deduct for interference
    const interferenceCount = signalQuality.filter(q => q.interferenceScore > 30).length;
    if (interferenceCount > 0) score -= Math.min(20, interferenceCount * 5);

    return Math.max(0, score);
  }, [avgChannelUtilization, avgSnr, collisionProbability, signalQuality]);

  // Get health score color
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    if (score >= 40) return 'orange';
    return 'red';
  };

  // Environmental sensors
  const environmentalData = useMemo(() => {
    return nodes
      .filter(n =>
        n.temperature !== undefined ||
        n.humidity !== undefined ||
        n.pressure !== undefined
      )
      .map(n => ({
        nodeId: n.nodeId,
        nodeName: n.shortName || n.longName,
        temperature: n.temperature,
        humidity: (n as any).humidity,
        pressure: (n as any).pressure,
        lastHeard: n.lastHeard
      }));
  }, [nodes]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">📊 Network Health Monitor</h2>
        <p className="text-slate-400">
          Real-time mesh network analysis: congestion, interference, signal quality, and environmental sensors
        </p>
      </div>

      {/* Congestion Alert */}
      {showCongestionAlert && (
        <div className="card bg-red-500/20 border-red-500 border-2 animate-pulse">
          <div className="flex items-center gap-4">
            <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-300">NETWORK CONGESTION DETECTED</h3>
              <p className="text-red-200">
                Channel utilization is {avgChannelUtilization.toFixed(1)}% (threshold: {congestionThreshold}%)
              </p>
              <p className="text-red-200 text-sm mt-1">
                ⚠️ High collision risk. Consider reducing message frequency or using different channels.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Network Health Score */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className={`card border-2 border-${getHealthColor(healthScore)}-500 bg-${getHealthColor(healthScore)}-500/10`}>
          <div className="text-sm text-slate-300">Network Health</div>
          <div className={`text-5xl font-bold text-${getHealthColor(healthScore)}-400`}>
            {healthScore.toFixed(0)}
          </div>
          <div className="text-xs text-slate-400">
            {healthScore >= 80 ? '✅ Excellent' : healthScore >= 60 ? '⚠️ Good' : healthScore >= 40 ? '⚠️ Fair' : '❌ Poor'}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-400">Channel Utilization</div>
          <div className="text-4xl font-bold text-blue-400">
            {avgChannelUtilization.toFixed(1)}<span className="text-2xl">%</span>
          </div>
          <div className="text-xs text-slate-500">Average across nodes</div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-400">TX Air Utilization</div>
          <div className="text-4xl font-bold text-purple-400">
            {avgAirUtilTx.toFixed(1)}<span className="text-2xl">%</span>
          </div>
          <div className="text-xs text-slate-500">Transmit airtime</div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-400">Average SNR</div>
          <div className={`text-4xl font-bold ${avgSnr > 5 ? 'text-green-400' : avgSnr > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            {avgSnr.toFixed(1)}<span className="text-2xl">dB</span>
          </div>
          <div className="text-xs text-slate-500">Signal quality</div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-400">Collision Risk</div>
          <div className={`text-4xl font-bold ${collisionProbability < 20 ? 'text-green-400' : collisionProbability < 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {collisionProbability.toFixed(0)}<span className="text-2xl">%</span>
          </div>
          <div className="text-xs text-slate-500">Estimated probability</div>
        </div>
      </div>

      {/* Channel Utilization History */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">📈 Channel Utilization Over Time</h3>

        {channelHistory.length > 0 ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['1h', '6h', '24h'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setSelectedTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    selectedTimeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <div className="bg-slate-900/50 p-4 rounded-lg">
              <div className="text-sm text-slate-400 mb-2">
                Showing data from last {selectedTimeRange}
              </div>
              <div className="h-48 flex items-end gap-1">
                {channelHistory
                  .filter(m => {
                    const cutoff = selectedTimeRange === '1h' ? 60 : selectedTimeRange === '6h' ? 360 : 1440;
                    const minutesAgo = (Date.now() - m.timestamp.getTime()) / 60000;
                    return minutesAgo <= cutoff;
                  })
                  .slice(-50) // Show last 50 data points
                  .map((metric, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 rounded-t transition-all ${
                        metric.utilization > 80
                          ? 'bg-red-500'
                          : metric.utilization > 60
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ height: `${Math.max(5, metric.utilization)}%` }}
                      title={`${metric.utilization.toFixed(1)}% at ${metric.timestamp.toLocaleTimeString()}`}
                    />
                  ))}
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>No channel utilization data yet</p>
            <p className="text-sm text-slate-500 mt-1">Metrics will appear as nodes report telemetry</p>
          </div>
        )}
      </div>

      {/* Signal Quality & Interference */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">📡 Signal Quality & Interference Detection</h3>

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
      </div>

      {/* Airtime Usage by Node */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">⏱️ Airtime Usage by Node</h3>

        {airtimeByNode.length > 0 ? (
          <div className="space-y-3">
            {airtimeByNode.map(node => (
              <div key={node.nodeId} className="bg-slate-800/50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-bold text-white">{node.nodeName}</span>
                    <span className="text-sm text-slate-400 ml-2">
                      ({node.messagesCount} msgs)
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${
                      node.estimatedAirtime > 30 ? 'text-red-400' :
                      node.estimatedAirtime > 15 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {node.estimatedAirtime.toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-500">
                      {node.lastActive && (
                        <>Last: {Math.floor((Date.now() - node.lastActive.getTime()) / 60000)}m ago</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      node.estimatedAirtime > 30 ? 'bg-red-500' :
                      node.estimatedAirtime > 15 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${node.estimatedAirtime}%` }}
                  />
                </div>
                {node.estimatedAirtime > 30 && (
                  <div className="mt-2 text-xs text-yellow-300">
                    ⚠️ High airtime usage - this node is transmitting frequently
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <p>No airtime data available</p>
            <p className="text-sm text-slate-500 mt-1">Data will appear as messages are received</p>
          </div>
        )}
      </div>

      {/* Environmental Sensors */}
      {environmentalData.length > 0 && (
        <div className="card">
          <h3 className="text-xl font-semibold text-white mb-4">🌡️ Environmental Sensors</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {environmentalData.map(sensor => (
              <div key={sensor.nodeId} className="bg-slate-800/50 p-4 rounded-lg">
                <div className="font-bold text-white mb-2">{sensor.nodeName}</div>

                {sensor.temperature !== undefined && (
                  <div className="mb-2">
                    <div className="text-xs text-slate-400">Temperature</div>
                    <div className="text-2xl font-bold text-orange-400">
                      {sensor.temperature.toFixed(1)}°C
                    </div>
                  </div>
                )}

                {sensor.humidity !== undefined && (
                  <div className="mb-2">
                    <div className="text-xs text-slate-400">Humidity</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {sensor.humidity.toFixed(0)}%
                    </div>
                  </div>
                )}

                {sensor.pressure !== undefined && (
                  <div className="mb-2">
                    <div className="text-xs text-slate-400">Pressure</div>
                    <div className="text-2xl font-bold text-purple-400">
                      {sensor.pressure.toFixed(1)} hPa
                    </div>
                  </div>
                )}

                <div className="text-xs text-slate-500 mt-2">
                  Last update: {Math.floor((Date.now() - sensor.lastHeard.getTime()) / 60000)}m ago
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network Insights */}
      <div className="card bg-blue-500/10 border border-blue-500/30">
        <h3 className="text-lg font-semibold text-blue-300 mb-3">💡 Network Insights</h3>
        <div className="space-y-2 text-sm text-slate-300">
          <p><strong>Channel Utilization:</strong> Percentage of time the channel is busy (receiving or transmitting)</p>
          <p><strong>SNR (Signal-to-Noise Ratio):</strong> Higher is better. &gt;10dB = excellent, 5-10dB = good, 0-5dB = fair, &lt;0dB = poor</p>
          <p><strong>Interference Detection:</strong> High RSSI but low SNR indicates RF interference or jamming</p>
          <p><strong>Collision Probability:</strong> Estimated chance of packet collisions based on utilization and active nodes</p>
          <p><strong>Airtime Usage:</strong> Relative proportion of network traffic from each node</p>

          <div className="mt-4 pt-4 border-t border-blue-500/30">
            <p><strong>Optimization Tips:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Keep channel utilization below 60% for best performance</li>
              <li>If congestion detected, reduce message frequency or use longer interval presets</li>
              <li>Nodes with &gt;30% airtime usage should reduce transmission frequency</li>
              <li>Interference can be mitigated by changing channels or relocating nodes</li>
              <li>Poor SNR with good RSSI suggests looking for RF noise sources nearby</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
