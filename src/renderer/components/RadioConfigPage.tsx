import { useState, useEffect } from 'react';
import { Radio } from '../types';

interface RadioConfigPageProps {
  radios: Radio[];
  onGetChannel: (radioId: string, channelIndex: number) => void;
  onSetChannel: (radioId: string, channelConfig: any) => void;
}

interface ChannelFormData {
  name: string;
  pskBase64: string;
  role: 'PRIMARY' | 'SECONDARY' | 'DISABLED';
  uplinkEnabled: boolean;
  downlinkEnabled: boolean;
}

function RadioConfigPage({ radios, onGetChannel, onSetChannel }: RadioConfigPageProps) {
  const [selectedRadioId, setSelectedRadioId] = useState<string>('');
  const [channels, setChannels] = useState<Record<number, ChannelFormData>>({});
  const [activeTab, setActiveTab] = useState<'channels' | 'settings'>('channels');

  // Initialize with default values for all channels
  useEffect(() => {
    const initialChannels: Record<number, ChannelFormData> = {};
    for (let i = 0; i < 8; i++) {
      initialChannels[i] = {
        name: '',
        pskBase64: '',
        role: i === 0 ? 'PRIMARY' : 'SECONDARY',
        uplinkEnabled: true,
        downlinkEnabled: true,
      };
    }
    setChannels(initialChannels);
  }, []);

  // Set first connected Meshtastic radio as default
  useEffect(() => {
    if (!selectedRadioId && radios.length > 0) {
      const firstMeshtasticRadio = radios.find(
        (r) => r.protocol === 'meshtastic' && r.status === 'connected'
      );
      if (firstMeshtasticRadio) {
        setSelectedRadioId(firstMeshtasticRadio.id);
      }
    }
  }, [radios, selectedRadioId]);

  const connectedMeshtasticRadios = radios.filter(
    (r) => r.protocol === 'meshtastic' && r.status === 'connected'
  );

  const handleGetChannel = (channelIndex: number) => {
    if (!selectedRadioId) return;
    onGetChannel(selectedRadioId, channelIndex);
  };

  const handleGetAllChannels = () => {
    if (!selectedRadioId) return;
    for (let i = 0; i < 8; i++) {
      setTimeout(() => onGetChannel(selectedRadioId, i), i * 500); // Stagger requests
    }
  };

  const handleSetChannel = (channelIndex: number) => {
    if (!selectedRadioId) return;

    const channelData = channels[channelIndex];

    // Convert base64 PSK to Uint8Array if provided
    let psk: Uint8Array | undefined;
    if (channelData.pskBase64) {
      try {
        const binaryString = atob(channelData.pskBase64);
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
      index: channelIndex,
      settings: {
        name: channelData.name || undefined,
        psk: psk,
        uplinkEnabled: channelData.uplinkEnabled,
        downlinkEnabled: channelData.downlinkEnabled,
      },
      role: channelData.role,
    };

    onSetChannel(selectedRadioId, channelConfig);
  };

  const updateChannel = (index: number, updates: Partial<ChannelFormData>) => {
    setChannels((prev) => ({
      ...prev,
      [index]: { ...prev[index], ...updates },
    }));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Radio Configuration</h2>
        <p className="text-slate-400">Configure channels and settings for your Meshtastic radios</p>
      </div>

      {/* Radio Selection */}
      {connectedMeshtasticRadios.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Connected Radios</h3>
          <p className="text-slate-400">Please connect a Meshtastic radio to configure it</p>
        </div>
      ) : (
        <>
          <div className="card p-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Select Radio
            </label>
            <select
              value={selectedRadioId}
              onChange={(e) => setSelectedRadioId(e.target.value)}
              className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            >
              {connectedMeshtasticRadios.map((radio) => (
                <option key={radio.id} value={radio.id}>
                  {radio.nodeInfo?.longName || radio.name} ({radio.port})
                </option>
              ))}
            </select>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 bg-slate-800 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab('channels')}
              className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${
                activeTab === 'channels' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              📻 Channels
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${
                activeTab === 'settings' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚙️ Settings
            </button>
          </div>

          {/* Content */}
          {activeTab === 'channels' ? (
            <div className="space-y-4">
              {/* Bulk Actions */}
              <div className="card p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Bulk Channel Operations</h3>
                  <p className="text-sm text-slate-400">Retrieve configuration for all channels at once</p>
                </div>
                <button
                  onClick={handleGetAllChannels}
                  className="btn-secondary"
                >
                  📡 Get All Channels
                </button>
              </div>

              {/* Channel Configuration Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
                  <div key={index} className="card p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white">
                        Channel {index} {index === 0 && '(Primary)'}
                      </h3>
                      <button
                        onClick={() => handleGetChannel(index)}
                        className="btn-secondary text-sm py-1 px-3"
                      >
                        📡 Get
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Channel Name */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Channel Name
                        </label>
                        <input
                          type="text"
                          value={channels[index]?.name || ''}
                          onChange={(e) => updateChannel(index, { name: e.target.value })}
                          placeholder={index === 0 ? 'LongFast' : `Channel ${index}`}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* PSK */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          PSK (Base64)
                        </label>
                        <input
                          type="text"
                          value={channels[index]?.pskBase64 || ''}
                          onChange={(e) => updateChannel(index, { pskBase64: e.target.value })}
                          placeholder="AQ=="
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* Role */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Role
                        </label>
                        <select
                          value={channels[index]?.role || 'SECONDARY'}
                          onChange={(e) => updateChannel(index, { role: e.target.value as any })}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                        >
                          <option value="PRIMARY">Primary</option>
                          <option value="SECONDARY">Secondary</option>
                          <option value="DISABLED">Disabled</option>
                        </select>
                      </div>

                      {/* Uplink/Downlink */}
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-white cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={channels[index]?.uplinkEnabled ?? true}
                            onChange={(e) => updateChannel(index, { uplinkEnabled: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>Uplink</span>
                        </label>
                        <label className="flex items-center gap-2 text-white cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={channels[index]?.downlinkEnabled ?? true}
                            onChange={(e) => updateChannel(index, { downlinkEnabled: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>Downlink</span>
                        </label>
                      </div>

                      {/* Set Button */}
                      <button
                        onClick={() => handleSetChannel(index)}
                        className="btn-primary w-full text-sm py-2"
                      >
                        💾 Set Channel {index}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Warning */}
              <div className="card p-4 bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-1">Important</h4>
                    <p className="text-yellow-400 text-sm">
                      Changing channel configuration may disconnect you from the network. Make sure you understand Meshtastic channel settings before making changes. Incorrect configuration can prevent communication with other devices.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-slate-400">Additional radio settings will be available here in the future</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RadioConfigPage;
