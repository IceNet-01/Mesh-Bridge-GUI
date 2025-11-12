import { useState } from 'react';
import { Message, Radio } from '../types';

interface MessageMonitorProps {
  messages: Message[];
  radios: Radio[];
}

function MessageMonitor({ messages, radios }: MessageMonitorProps) {
  const [filter, setFilter] = useState<'all' | 'forwarded' | 'duplicate'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const getRadioName = (radioId: string) => {
    const radio = radios.find((r) => r.id === radioId);
    return radio ? radio.name : radioId;
  };

  const filteredMessages = messages.filter((msg) => {
    if (filter === 'forwarded' && !msg.forwarded) return false;
    if (filter === 'duplicate' && !msg.duplicate) return false;

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        msg.from.toString().includes(search) ||
        msg.to.toString().includes(search) ||
        getRadioName(msg.fromRadio).toLowerCase().includes(search)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Message Monitor</h2>
        <p className="text-slate-400">Real-time message traffic and forwarding status</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'all' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All ({messages.length})
          </button>
          <button
            onClick={() => setFilter('forwarded')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'forwarded' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Forwarded ({messages.filter((m) => m.forwarded).length})
          </button>
          <button
            onClick={() => setFilter('duplicate')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === 'duplicate' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Duplicates ({messages.filter((m) => m.duplicate).length})
          </button>
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search messages..."
            className="input w-full"
          />
        </div>
      </div>

      {/* Messages Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">From Radio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Sender</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Message</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Port</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No messages to display
                  </td>
                </tr>
              ) : (
                filteredMessages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {getRadioName(msg.fromRadio)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">{msg.from}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">{msg.to}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate" title={msg.payload?.text || 'No text data'}>
                      {msg.payload?.text || (msg.payload?.raw ? `[Binary: ${msg.payload.raw.length} bytes]` : '-')}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{msg.channel}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{msg.portnum}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {msg.forwarded && <span className="badge-success">Forwarded</span>}
                        {msg.duplicate && <span className="badge-warning">Duplicate</span>}
                        {!msg.forwarded && !msg.duplicate && (
                          <span className="badge-info">Received</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MessageMonitor;
