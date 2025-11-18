import { Card } from '../ui/Card';

export function NetworkInsights() {
  return (
    <Card className="bg-blue-500/10 border border-blue-500/30">
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
    </Card>
  );
}
