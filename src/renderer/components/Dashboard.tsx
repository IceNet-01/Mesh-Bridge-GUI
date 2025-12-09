import { useMemo, ReactElement } from 'react';
import { Radio, Statistics, Message } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  radios: Radio[];
  statistics: Statistics | null;
  messages: Message[];
}

function Dashboard({ radios, statistics, messages }: DashboardProps) {
  const connectedRadios = radios.filter((r) => r.status === 'connected');
  const recentMessages = messages.slice(0, 10);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  // Generate chart data for message rate using real message timestamps
  // Memoized to avoid recalculating on every render
  const chartData = useMemo(() => {
    const calculateMessageRate = (minutesAgo: number): number => {
      const now = Date.now();
      const oneMinute = 60 * 1000;
      const startTime = now - (minutesAgo + 1) * oneMinute;
      const endTime = now - minutesAgo * oneMinute;

      return messages.filter(msg => {
        const msgTime = msg.timestamp instanceof Date ? msg.timestamp.getTime() : new Date(msg.timestamp).getTime();
        return msgTime >= startTime && msgTime < endTime;
      }).length;
    };

    return [
      { time: '5m ago', rate: calculateMessageRate(5) },
      { time: '4m ago', rate: calculateMessageRate(4) },
      { time: '3m ago', rate: calculateMessageRate(3) },
      { time: '2m ago', rate: calculateMessageRate(2) },
      { time: '1m ago', rate: calculateMessageRate(1) },
      { time: 'now', rate: calculateMessageRate(0) },
    ];
  }, [messages]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>
        <p className="text-slate-400">Real-time monitoring of your Mesh Bridge relay station</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Connected Radios"
          value={connectedRadios.length}
          total={radios.length}
          icon="radio"
          color="blue"
        />
        <StatCard
          title="Messages Received"
          value={statistics?.totalMessagesReceived ?? 0}
          subtitle={`${statistics?.messageRatePerMinute ?? 0}/min`}
          icon="inbox"
          color="green"
        />
        <StatCard
          title="Messages Forwarded"
          value={statistics?.totalMessagesForwarded ?? 0}
          subtitle={`${statistics?.totalMessagesDuplicate ?? 0} duplicates`}
          icon="forward"
          color="purple"
        />
        <StatCard
          title="Uptime"
          value={statistics ? formatUptime(statistics.uptime) : '0h 0m 0s'}
          subtitle={statistics && statistics.totalErrors > 0 ? `${statistics.totalErrors} errors` : 'No errors'}
          icon="clock"
          color="orange"
        />
      </div>

      {/* Message Rate Chart */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Message Rate</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            />
            <Line type="monotone" dataKey="rate" stroke="#0ea5e9" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Radios */}
        <div className="card p-6">
          <h3 className="text-xl font-bold text-white mb-4">Active Radios</h3>
          <div className="space-y-3">
            {connectedRadios.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No radios connected</p>
            ) : (
              connectedRadios.map((radio) => (
                <div key={radio.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50">
                  <div className="status-dot status-connected" />
                  <div className="flex-1">
                    <p className="text-white font-medium">{radio.name}</p>
                    <p className="text-xs text-slate-400">{radio.port}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-green-400">↓ {radio.messagesReceived}</p>
                    <p className="text-sm text-blue-400">↑ {radio.messagesSent}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Messages */}
        <div className="card p-6">
          <h3 className="text-xl font-bold text-white mb-4">Recent Messages</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentMessages.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No messages yet</p>
            ) : (
              recentMessages.map((msg) => (
                <div key={msg.id} className="p-2 rounded bg-slate-900/30 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                    {msg.forwarded && <span className="badge-success">Forwarded</span>}
                    {msg.duplicate && <span className="badge-warning">Duplicate</span>}
                  </div>
                  <p className="text-white mt-1">
                    From: {msg.from} → To: {msg.to} (Ch: {msg.channel})
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  total?: number;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function StatCard({ title, value, subtitle, total, icon, color }: StatCardProps) {
  const colors = {
    blue: 'from-blue-500 to-blue-700',
    green: 'from-green-500 to-green-700',
    purple: 'from-purple-500 to-purple-700',
    orange: 'from-orange-500 to-orange-700',
  };

  const icons: Record<string, ReactElement> = {
    radio: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0" />
    ),
    inbox: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    ),
    forward: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    ),
    clock: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-slate-400 text-sm font-medium">{title}</p>
        </div>
        <div className={`w-10 h-10 bg-gradient-to-br ${colors[color]} rounded-lg flex items-center justify-center`}>
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {icons[icon]}
          </svg>
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-white">
          {value}
          {total !== undefined && <span className="text-lg text-slate-400">/{total}</span>}
        </p>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export default Dashboard;
