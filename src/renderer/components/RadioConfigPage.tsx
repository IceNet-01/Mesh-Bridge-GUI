import { useState, useEffect } from 'react';
import { Radio } from '../types';
import RadioSettings from './RadioSettings';

interface RadioConfigPageProps {
  radios: Radio[];
  onSetChannel: (radioId: string, channelConfig: any) => void;
  onSetConfig: (radioId: string, configType: string, config: any) => void;
}

interface ChannelEdit {
  name: string;
  psk: Uint8Array | null;
  role: 'PRIMARY' | 'SECONDARY' | 'DISABLED';
}

function RadioConfigPage({ radios, onSetChannel, onSetConfig }: RadioConfigPageProps) {
  const [selectedRadioId, setSelectedRadioId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'channels' | 'settings'>('channels');
  const [editingChannel, setEditingChannel] = useState<Record<number, ChannelEdit>>({});
  const [savingChannels, setSavingChannels] = useState<Set<number>>(new Set());

  const selectedRadio = radios.find(r => r.id === selectedRadioId);
  const connectedMeshtasticRadios = radios.filter(
    (r) => r.protocol === 'meshtastic' && r.status === 'connected'
  );

  // Auto-select first connected radio
  useEffect(() => {
    if (!selectedRadioId && connectedMeshtasticRadios.length > 0) {
      setSelectedRadioId(connectedMeshtasticRadios[0].id);
    }
  }, [connectedMeshtasticRadios, selectedRadioId]);

  // Initialize editing state from radio channels
  useEffect(() => {
    if (selectedRadio?.channels) {
      const newEdits: Record<number, ChannelEdit> = {};
      selectedRadio.channels.forEach(channel => {
        newEdits[channel.index] = {
          name: channel.settings?.name || '',
          psk: channel.settings?.psk || null,
          role: channel.role || (channel.index === 0 ? 'PRIMARY' : 'SECONDARY'),
        };
      });
      setEditingChannel(newEdits);
    }
  }, [selectedRadio?.channels]);

  const handleSaveChannel = async (channelIndex: number) => {
    if (!selectedRadioId || !editingChannel[channelIndex]) return;

    setSavingChannels(prev => new Set(prev).add(channelIndex));
    try {
      const edit = editingChannel[channelIndex];
      const channelConfig = {
        index: channelIndex,
        settings: {
          name: edit.name || undefined,
          psk: edit.psk || undefined,
          uplinkEnabled: true,
          downlinkEnabled: true,
        },
        role: edit.role,
      };

      await onSetChannel(selectedRadioId, channelConfig);
    } catch (error) {
      console.error(`Failed to save channel ${channelIndex}:`, error);
    } finally {
      setSavingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelIndex);
        return next;
      });
    }
  };

  const updateChannelEdit = (index: number, updates: Partial<ChannelEdit>) => {
    setEditingChannel(prev => ({
      ...prev,
      [index]: { ...prev[index], ...updates },
    }));
  };

  const generateKey = (channelIndex: number) => {
    const psk = new Uint8Array(32);
    crypto.getRandomValues(psk);
    updateChannelEdit(channelIndex, { psk });
  };

  const copyToClipboard = async (psk: Uint8Array) => {
    try {
      const base64 = btoa(String.fromCharCode(...psk));
      await navigator.clipboard.writeText(base64);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const pskToBase64 = (psk: Uint8Array | null): string => {
    if (!psk || psk.length === 0) return '';
    return btoa(String.fromCharCode(...psk));
  };

  const base64ToPsk = (base64: string): Uint8Array | null => {
    if (!base64) return null;
    try {
      const binary = atob(base64);
      const psk = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        psk[i] = binary.charCodeAt(i);
      }
      return psk;
    } catch {
      return null;
    }
  };

  if (connectedMeshtasticRadios.length === 0) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Radio Configuration</h2>
          <p className="text-slate-400">Configure channels and settings for your Meshtastic radios</p>
        </div>
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Connected Radios</h3>
          <p className="text-slate-400">Please connect a Meshtastic radio to configure it</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Radio Configuration</h2>
        <p className="text-slate-400">Configure channels and settings for your Meshtastic radios</p>
      </div>

      {/* Radio Selection */}
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
          ⚙️ LoRa Settings
        </button>
      </div>

      {/* Content */}
      {activeTab === 'channels' ? (
        <div className="space-y-4">
          {/* Info Banner */}
          {(!selectedRadio?.channels || selectedRadio.channels.length === 0) && (
            <div className="card p-4 bg-blue-500/10 border border-blue-500/30">
              <p className="text-blue-400 text-sm">
                ⏳ Waiting for channel configuration from radio...
              </p>
            </div>
          )}

          {/* Channel Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
              const channel = selectedRadio?.channels?.find(ch => ch.index === index);
              const edit = editingChannel[index] || { name: '', psk: null, role: index === 0 ? 'PRIMARY' : 'SECONDARY' };
              const isSaving = savingChannels.has(index);
              const hasData = !!channel;

              return (
                <div key={index} className={`card p-5 ${hasData ? 'border-green-500/30' : 'border-slate-700'}`}>
                  {/* Channel Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">
                        Channel {index} {index === 0 && '(Primary)'}
                      </h3>
                      {hasData && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                          ✓
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Channel Fields */}
                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Channel Name
                      </label>
                      <input
                        type="text"
                        value={edit.name}
                        onChange={(e) => updateChannelEdit(index, { name: e.target.value })}
                        placeholder={index === 0 ? 'LongFast' : `Channel ${index}`}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    {/* PSK */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Encryption Key (Base64)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={pskToBase64(edit.psk)}
                          onChange={(e) => updateChannelEdit(index, { psk: base64ToPsk(e.target.value) })}
                          placeholder="AQ=="
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-primary-500"
                        />
                        <button
                          onClick={() => generateKey(index)}
                          className="btn-secondary text-xs px-3 py-2 whitespace-nowrap"
                          title="Generate random 32-byte key"
                        >
                          🔑
                        </button>
                        {edit.psk && (
                          <button
                            onClick={() => copyToClipboard(edit.psk!)}
                            className="btn-secondary text-xs px-3 py-2"
                            title="Copy to clipboard"
                          >
                            📋
                          </button>
                        )}
                      </div>
                      {edit.psk && (
                        <p className={`text-xs mt-1 ${edit.psk.length === 32 ? 'text-green-400' : 'text-yellow-400'}`}>
                          {edit.psk.length === 32
                            ? `✓ Valid (${edit.psk.length} bytes)`
                            : `⚠ Expected 32 bytes, got ${edit.psk.length}`}
                        </p>
                      )}
                    </div>

                    {/* Role */}
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Role
                      </label>
                      <select
                        value={edit.role}
                        onChange={(e) => updateChannelEdit(index, { role: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                      >
                        <option value="PRIMARY">Primary</option>
                        <option value="SECONDARY">Secondary</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={() => handleSaveChannel(index)}
                      disabled={isSaving}
                      className="btn-primary w-full text-sm py-2"
                    >
                      {isSaving ? '⏳ Saving...' : '💾 Save Channel'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warning */}
          <div className="card p-4 bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <h4 className="text-yellow-400 font-semibold mb-1">Important</h4>
                <p className="text-yellow-400 text-sm">
                  Channels configure your encryption and network settings. Changing channel configuration
                  may disconnect you from the network. Make sure all devices use the same channel settings
                  to communicate. Channel 0 is the primary channel and must be configured correctly.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <RadioSettings
          radioId={selectedRadioId}
          radio={selectedRadio}
          onSetConfig={onSetConfig}
        />
      )}
    </div>
  );
}

export default RadioConfigPage;
