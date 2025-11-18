import { useState, useEffect, useMemo } from 'react';
import { MeshNode, Radio, Message } from '../types';
import { MetricCard } from './ui/MetricCard';
import { Card } from './ui/Card';
import { ChannelUtilizationChart } from './NetworkHealth/ChannelUtilizationChart';
import { SignalQualityTable } from './NetworkHealth/SignalQualityTable';
import { AirtimeByNode } from './NetworkHealth/AirtimeByNode';
import { EnvironmentalSensors } from './NetworkHealth/EnvironmentalSensors';
import { NetworkInsights } from './NetworkHealth/NetworkInsights';
import { getHealthColor } from '../lib/colorUtils';

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
  interferenceScore: number;
}

interface NodeAirtime {
  nodeId: string;
  nodeName: string;
  messagesCount: number;
  estimatedAirtime: number;
  lastActive: Date;
}

export default function NetworkHealth({ nodes, messages }: NetworkHealthProps) {
  const [channelHistory, setChannelHistory] = useState<ChannelMetric[]>([]);
  const [congestionThreshold] = useState(80);
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

    setShowCongestionAlert(currentUtilization > congestionThreshold);
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
      let interferenceScore = 0;
      if (avgRssi > -80 && avgSnr < 5) {
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
  const collisionProbability = useMemo(() => {
    if (avgChannelUtilization === 0) return 0;

    const activeNodes = nodes.filter(n =>
      n.lastHeard && (Date.now() - n.lastHeard.getTime()) < 15 * 60 * 1000
    ).length;

    const offeredLoad = (avgChannelUtilization / 100) * Math.log(activeNodes + 1);
    return Math.min(100, offeredLoad * 50);
  }, [avgChannelUtilization, nodes]);

  // Network health score (0-100)
  const healthScore = useMemo(() => {
    let score = 100;

    if (avgChannelUtilization > 80) score -= 30;
    else if (avgChannelUtilization > 60) score -= 15;
    else if (avgChannelUtilization > 40) score -= 5;

    if (avgSnr < 0) score -= 20;
    else if (avgSnr < 5) score -= 10;

    if (collisionProbability > 50) score -= 20;
    else if (collisionProbability > 30) score -= 10;

    const interferenceCount = signalQuality.filter(q => q.interferenceScore > 30).length;
    if (interferenceCount > 0) score -= Math.min(20, interferenceCount * 5);

    return Math.max(0, score);
  }, [avgChannelUtilization, avgSnr, collisionProbability, signalQuality]);

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
        humidity: n.humidity,
        pressure: n.pressure,
        lastHeard: n.lastHeard
      }));
  }, [nodes]);

  const healthColor = getHealthColor(healthScore);

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
        <Card variant="danger" className="animate-pulse">
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
        </Card>
      )}

      {/* Network Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard
          title="Network Health"
          value={healthScore.toFixed(0)}
          subtitle={healthScore >= 80 ? '✅ Excellent' : healthScore >= 60 ? '⚠️ Good' : healthScore >= 40 ? '⚠️ Fair' : '❌ Poor'}
          color={healthColor as any}
        />
        <MetricCard
          title="Channel Utilization"
          value={`${avgChannelUtilization.toFixed(1)}%`}
          subtitle="Average across nodes"
          color="blue"
        />
        <MetricCard
          title="TX Air Utilization"
          value={`${avgAirUtilTx.toFixed(1)}%`}
          subtitle="Transmit airtime"
          color="purple"
        />
        <MetricCard
          title="Average SNR"
          value={`${avgSnr.toFixed(1)} dB`}
          subtitle="Signal quality"
          color={avgSnr > 5 ? 'green' : avgSnr > 0 ? 'yellow' : 'red'}
        />
        <MetricCard
          title="Collision Risk"
          value={`${collisionProbability.toFixed(0)}%`}
          subtitle="Estimated probability"
          color={collisionProbability < 20 ? 'green' : collisionProbability < 50 ? 'yellow' : 'red'}
        />
      </div>

      <ChannelUtilizationChart channelHistory={channelHistory} />
      <SignalQualityTable signalQuality={signalQuality} />
      <AirtimeByNode airtimeByNode={airtimeByNode} />
      <EnvironmentalSensors environmentalData={environmentalData} />
      <NetworkInsights />
    </div>
  );
}
