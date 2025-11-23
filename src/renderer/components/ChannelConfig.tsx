import { useState } from 'react';
import { ChannelRole } from '../types';

interface ChannelConfigProps {
  radioId: string;
  onGetChannel: (channelIndex: number) => void;
  onSetChannel: (channelConfig: any) => void;
}

function ChannelConfig({ onGetChannel, onSetChannel }: ChannelConfigProps) {
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [channelName, setChannelName] = useState('');
  const [pskBase64, setPskBase64] = useState('');
  const [role, setRole] = useState<ChannelRole>('SECONDARY');
  const [uplinkEnabled, setUplinkEnabled] = useState(true);
  const [downlinkEnabled, setDownlinkEnabled] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const handleGetChannel = () => {
    onGetChannel(selectedChannel);
  };

  const handleSetChannel = () => {
    // Convert base64 PSK to Uint8Array if provided
    let psk: Uint8Array | undefined;
    if (pskBase64) {
      try {
        const binaryString = atob(pskBase64);
        psk = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          psk[i] = binaryString.charCodeAt(i);
        }
      } catch (error) {
        console.error('Invalid base64 PSK:', error);
        alert('Invalid base64 PSK format');
        return;
      }
    }

    const channelConfig = {
      index: selectedChannel,
      settings: {
        name: channelName || undefined,
        psk: psk,
        uplinkEnabled,
        downlinkEnabled,
      },
      role,
    };

    onSetChannel(channelConfig);
  };

  return (
    <div className="card p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Channel Configuration</h3>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="btn-secondary text-sm"
        >
          {showConfig ? 'Hide' : 'Show'}
        </button>
      </div>

      {showConfig && (
        <div className="space-y-4">
          {/* Channel Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Channel Index (0-7)
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                <option key={index} value={index}>
                  Channel {index} {index === 0 ? '(Primary)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGetChannel}
              className="btn-secondary flex-1"
            >
              📡 Get Channel {selectedChannel}
            </button>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <h4 className="text-lg font-semibold text-white mb-3">Set Channel Configuration</h4>

            {/* Channel Name */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Channel Name
              </label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g., LongFast"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* PSK (Base64) */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                PSK (Base64 encoded)
              </label>
              <input
                type="text"
                value={pskBase64}
                onChange={(e) => setPskBase64(e.target.value)}
                placeholder="AQ=="
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave empty to keep existing PSK. Default PSK: "AQ==" (0x01)
              </p>
            </div>

            {/* Channel Role */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Channel Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ChannelRole)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="PRIMARY">Primary</option>
                <option value="SECONDARY">Secondary</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>

            {/* Uplink/Downlink */}
            <div className="mb-3 flex gap-4">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={uplinkEnabled}
                  onChange={(e) => setUplinkEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Uplink Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={downlinkEnabled}
                  onChange={(e) => setDownlinkEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Downlink Enabled</span>
              </label>
            </div>

            <button
              onClick={handleSetChannel}
              className="btn-primary w-full"
            >
              💾 Set Channel Configuration
            </button>

            <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs">
              <p className="text-yellow-400">
                ⚠️ Warning: Changing channel configuration may disconnect you from the network.
                Make sure you know what you're doing!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChannelConfig;
