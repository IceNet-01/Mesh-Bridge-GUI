import { useState } from 'react';
import { Card } from '../ui/Card';

interface ChannelMetric {
  timestamp: Date;
  utilization: number;
  airUtilTx: number;
  nodeId: string;
}

interface ChannelUtilizationChartProps {
  channelHistory: ChannelMetric[];
}

export function ChannelUtilizationChart({ channelHistory }: ChannelUtilizationChartProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h'>('1h');

  const filteredHistory = channelHistory.filter(m => {
    const cutoff = selectedTimeRange === '1h' ? 60 : selectedTimeRange === '6h' ? 360 : 1440;
    const minutesAgo = (Date.now() - m.timestamp.getTime()) / 60000;
    return minutesAgo <= cutoff;
  }).slice(-50); // Show last 50 data points

  return (
    <Card>
      <h3 className="card-header">📈 Channel Utilization Over Time</h3>

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
              {filteredHistory.map((metric, idx) => (
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
    </Card>
  );
}
