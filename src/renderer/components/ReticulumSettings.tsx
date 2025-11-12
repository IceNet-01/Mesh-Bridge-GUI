import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

interface ReticulumDestination {
  hash: string;
  name: string;
  lastAnnounce?: Date;
  hops?: number;
}

interface ReticulumIdentity {
  hash: string;
  publicKey?: string;
  privateKey?: string;
}

function ReticulumSettings() {
  const { radios } = useStore();
  const [selectedRadio, setSelectedRadio] = useState<string>('');
  const [destinations, setDestinations] = useState<ReticulumDestination[]>([]);
  const [identity, setIdentity] = useState<ReticulumIdentity | null>(null);
  const [announceInterval, setAnnounceInterval] = useState<number>(600);
  const [newDestName, setNewDestName] = useState<string>('');

  // Filter for Reticulum/RNode radios
  const reticulumRadios = radios.filter(r =>
    r.protocol === 'reticulum' || r.protocol === 'rnode'
  );

  useEffect(() => {
    if (reticulumRadios.length > 0 && !selectedRadio) {
      setSelectedRadio(reticulumRadios[0].id);
    }
  }, [reticulumRadios, selectedRadio]);

  // Mock data for demonstration - in real implementation, this would come from the backend
  useEffect(() => {
    if (selectedRadio) {
      // Simulate loading destinations
      setDestinations([
        { hash: 'a3f5c9...', name: 'Public Relay', lastAnnounce: new Date(), hops: 0 },
        { hash: 'b7e2d1...', name: 'Emergency Net', lastAnnounce: new Date(Date.now() - 300000), hops: 2 },
      ]);

      // Simulate loading identity
      setIdentity({
        hash: '4d8f6a...',
        publicKey: '0x1234...',
      });
    }
  }, [selectedRadio]);

  const handleAnnounce = () => {
    console.log('Broadcasting announce packet...');
    // TODO: Implement announce via bridge server
  };

  const handleAddDestination = () => {
    if (newDestName.trim()) {
      console.log('Adding destination:', newDestName);
      // TODO: Implement add destination via bridge server
      setNewDestName('');
    }
  };

  const handleGenerateIdentity = () => {
    console.log('Generating new identity...');
    // TODO: Implement identity generation via bridge server
  };

  if (reticulumRadios.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Reticulum Network</h2>
          <p className="text-slate-400">Manage Reticulum/RNode radio destinations and identity</p>
        </div>

        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No Reticulum Radios Connected</h3>
          <p className="text-slate-400">Connect an RNode or Reticulum radio to manage destinations</p>
        </div>
      </div>
    );
  }

  const radio = reticulumRadios.find(r => r.id === selectedRadio);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Reticulum Network</h2>
        <p className="text-slate-400">Manage Reticulum/RNode radio destinations and identity</p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-purple-500/10 border border-purple-500/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white font-medium">About Reticulum Network Stack</p>
            <p className="text-sm text-purple-200 mt-1">
              Reticulum uses cryptographic identities and destination-based addressing instead of channels.
              Announce packets broadcast your destinations to the network. Messages are end-to-end encrypted by default.
            </p>
          </div>
        </div>
      </div>

      {/* Radio Selector */}
      {reticulumRadios.length > 1 && (
        <div className="card p-6">
          <h3 className="text-xl font-bold text-white mb-4">Select Radio</h3>
          <select
            value={selectedRadio}
            onChange={(e) => setSelectedRadio(e.target.value)}
            className="input w-full"
          >
            {reticulumRadios.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.port}) - {r.protocol === 'rnode' ? 'RNode' : 'Reticulum'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Identity Section */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Identity</h3>
          <button onClick={handleGenerateIdentity} className="btn-secondary">
            Generate New
          </button>
        </div>

        {identity ? (
          <div className="space-y-3">
            <div className="p-4 bg-slate-900/50 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">Identity Hash</p>
              <code className="text-white font-mono text-sm break-all">{identity.hash}</code>
            </div>
            {identity.publicKey && (
              <div className="p-4 bg-slate-900/50 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Public Key</p>
                <code className="text-white font-mono text-xs break-all">{identity.publicKey}</code>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-400 mb-4">No identity configured</p>
            <button onClick={handleGenerateIdentity} className="btn-primary">
              Generate Identity
            </button>
          </div>
        )}
      </div>

      {/* Announce Settings */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Announce Settings</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Announce Interval (seconds)
            </label>
            <input
              type="number"
              value={announceInterval}
              onChange={(e) => setAnnounceInterval(parseInt(e.target.value))}
              className="input w-full"
              min={60}
              max={3600}
            />
            <p className="text-xs text-slate-400 mt-1">
              How often to broadcast announce packets (60-3600 seconds)
            </p>
          </div>

          <button onClick={handleAnnounce} className="btn-primary w-full">
            <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            Broadcast Announce Now
          </button>
        </div>
      </div>

      {/* Destinations */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Known Destinations</h3>

        {/* Add New Destination */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newDestName}
            onChange={(e) => setNewDestName(e.target.value)}
            placeholder="Destination name..."
            className="input flex-1"
          />
          <button onClick={handleAddDestination} className="btn-primary">
            Add
          </button>
        </div>

        {/* Destination List */}
        <div className="space-y-2">
          {destinations.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No destinations discovered yet</p>
          ) : (
            destinations.map((dest) => (
              <div key={dest.hash} className="p-4 bg-slate-900/50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-medium">{dest.name}</p>
                      {dest.hops !== undefined && (
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                          {dest.hops} {dest.hops === 1 ? 'hop' : 'hops'}
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-slate-400 font-mono">{dest.hash}</code>
                    {dest.lastAnnounce && (
                      <p className="text-xs text-slate-500 mt-1">
                        Last announce: {new Date(dest.lastAnnounce).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button className="btn-secondary text-sm">
                    Send Test
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Network Stats */}
      {radio && (
        <div className="card p-6">
          <h3 className="text-xl font-bold text-white mb-4">Network Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Messages Received</p>
              <p className="text-2xl font-bold text-green-400">{radio.messagesReceived}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Messages Sent</p>
              <p className="text-2xl font-bold text-blue-400">{radio.messagesSent}</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Announces Sent</p>
              <p className="text-2xl font-bold text-purple-400">24</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Destinations</p>
              <p className="text-2xl font-bold text-orange-400">{destinations.length}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReticulumSettings;
