import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TelemetrySnapshot } from '../types';
import { Card } from './ui/Card';

interface TelemetryChartProps {
  title: string;
  snapshots: TelemetrySnapshot[];
  dataKeys: Array<{
    key: keyof TelemetrySnapshot;
    label: string;
    color: string;
    unit?: string;
  }>;
  height?: number;
}

export function TelemetryChart({ title, snapshots, dataKeys, height = 200 }: TelemetryChartProps) {
  if (snapshots.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
        <div className="text-center py-8 text-slate-400">
          No historical data available yet. Data will appear as telemetry is received.
        </div>
      </Card>
    );
  }

  // Format data for recharts
  const chartData = snapshots.map(snapshot => {
    const formattedSnapshot: any = {
      timestamp: snapshot.timestamp instanceof Date
        ? snapshot.timestamp.getTime()
        : new Date(snapshot.timestamp).getTime(),
    };

    // Add each data key
    dataKeys.forEach(({ key }) => {
      formattedSnapshot[key] = snapshot[key];
    });

    return formattedSnapshot;
  });

  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const timestamp = new Date(payload[0].payload.timestamp);
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg">
          <p className="text-xs text-slate-400 mb-2">
            {timestamp.toLocaleString()}
          </p>
          {payload.map((entry: any, index: number) => {
            const dataKey = dataKeys.find(dk => dk.key === entry.dataKey);
            if (!dataKey || entry.value === undefined) return null;

            return (
              <p key={index} className="text-sm" style={{ color: entry.color }}>
                <strong>{dataKey.label}:</strong> {entry.value.toFixed(1)}
                {dataKey.unit || ''}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Format time for X-axis
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60 * 60 * 1000) {
      // Less than 1 hour: show minutes
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 24 * 60 * 60 * 1000) {
      // Less than 24 hours: show hours
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      // More than 24 hours: show date
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="timestamp"
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            tickFormatter={formatXAxis}
          />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value) => {
              const dataKey = dataKeys.find(dk => dk.key === value);
              return dataKey?.label || value;
            }}
          />
          {dataKeys.map(({ key, color }) => (
            <Line
              key={key as string}
              type="monotone"
              dataKey={key as string}
              stroke={color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-slate-500 text-center">
        Showing {snapshots.length} data point{snapshots.length !== 1 ? 's' : ''} from the last 24 hours
      </div>
    </Card>
  );
}
