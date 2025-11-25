import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { AdvertisementBotConfig } from '../types';

function AdvertisementBotSettings() {
  const {
    adBotConfig,
    getAdBotConfig,
    setAdBotConfig,
    testAdBot,
    radios
  } = useStore();

  const [adBotForm, setAdBotForm] = useState<AdvertisementBotConfig>({
    enabled: false,
    interval: 3600000, // 1 hour default
    messages: [],
    targetRadios: [],
    channel: 0
  });

  const [adBotTesting, setAdBotTesting] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    getAdBotConfig();
  }, [getAdBotConfig]);

  useEffect(() => {
    if (adBotConfig) {
      setAdBotForm(prev => ({ ...prev, ...adBotConfig }));
    }
  }, [adBotConfig]);

  const handleAdBotSave = async () => {
    await setAdBotConfig(adBotForm);
    await getAdBotConfig();
  };

  const handleAdBotTest = async () => {
    setAdBotTesting(true);
    await testAdBot();
    setTimeout(() => setAdBotTesting(false), 2000);
  };

  const handleAddMessage = () => {
    if (newMessage.trim()) {
      setAdBotForm({
        ...adBotForm,
        messages: [...adBotForm.messages, newMessage.trim()]
      });
      setNewMessage('');
    }
  };

  const handleRemoveMessage = (index: number) => {
    setAdBotForm({
      ...adBotForm,
      messages: adBotForm.messages.filter((_, i) => i !== index)
    });
  };

  const handleToggleRadio = (radioId: string) => {
    const isSelected = adBotForm.targetRadios.includes(radioId);
    if (isSelected) {
      setAdBotForm({
        ...adBotForm,
        targetRadios: adBotForm.targetRadios.filter(id => id !== radioId)
      });
    } else {
      setAdBotForm({
        ...adBotForm,
        targetRadios: [...adBotForm.targetRadios, radioId]
      });
    }
  };

  const formatInterval = (ms: number): string => {
    const minutes = ms / 60000;
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours} hr`;
    return `${hours / 24} days`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Advertisement Bot Settings</h2>
        <p className="text-slate-400">Periodically announce the bot's presence on the mesh network</p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-blue-500/10 border border-blue-500/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white font-medium">Automatic mesh network announcements</p>
            <p className="text-sm text-blue-200 mt-1">
              The bot will periodically send messages to let people know it's available and how to contact it
            </p>
            <p className="text-sm text-blue-200 mt-1">
              Future: Can be configured to advertise on public channel but direct users to a bot channel
            </p>
          </div>
        </div>
      </div>

      {/* Advertisement Bot Status */}
      {adBotForm.enabled && (
        <div className="card p-4 bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-green-300 font-medium">Advertisement bot is active</span>
            <span className="text-slate-400 text-sm ml-2">
              ({formatInterval(adBotForm.interval)} intervals)
            </span>
          </div>
        </div>
      )}

      {/* Advertisement Bot Settings */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">📢 Advertisement Bot</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={adBotForm.enabled}
              onChange={(e) => setAdBotForm({ ...adBotForm, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-sm font-medium text-slate-300">
              {adBotForm.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        <div className="space-y-4">
          {/* Interval Slider */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Advertisement Interval: {formatInterval(adBotForm.interval)}
            </label>
            <input
              type="range"
              min="300000"  // 5 minutes
              max="86400000"  // 24 hours
              step="300000"  // 5 minute increments
              value={adBotForm.interval}
              onChange={(e) => setAdBotForm({ ...adBotForm, interval: parseInt(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>5 min</span>
              <span>1 hr</span>
              <span>6 hr</span>
              <span>24 hr</span>
            </div>
          </div>

          {/* Channel Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Channel
            </label>
            <select
              value={adBotForm.channel}
              onChange={(e) => setAdBotForm({ ...adBotForm, channel: parseInt(e.target.value) })}
              className="input w-full"
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map(ch => (
                <option key={ch} value={ch}>Channel {ch} {ch === 0 ? '(Primary/Public)' : ''}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Channel 0 is typically the public/primary channel
            </p>
          </div>

          {/* Messages */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Advertisement Messages
            </label>

            {/* Add Message Input */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddMessage()}
                placeholder="Type a message and press Enter or click Add"
                className="input flex-1"
                maxLength={200}
              />
              <button
                onClick={handleAddMessage}
                disabled={!newMessage.trim()}
                className="btn-secondary px-4"
              >
                Add
              </button>
            </div>

            {/* Message List */}
            <div className="space-y-2">
              {adBotForm.messages.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No messages added yet</p>
              ) : (
                adBotForm.messages.map((msg, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-slate-800 rounded">
                    <span className="flex-1 text-sm text-slate-200">{msg}</span>
                    <button
                      onClick={() => handleRemoveMessage(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              The bot will rotate through these messages. Keep messages under 200 characters for Meshtastic compatibility.
            </p>
          </div>

          {/* Target Radios */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Target Radios (leave empty to use all radios)
            </label>
            <div className="space-y-2">
              {radios.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No radios connected</p>
              ) : (
                radios.map((radio) => (
                  <div key={radio.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`radio-${radio.id}`}
                      checked={adBotForm.targetRadios.includes(radio.id)}
                      onChange={() => handleToggleRadio(radio.id)}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-600 focus:ring-2"
                    />
                    <label htmlFor={`radio-${radio.id}`} className="text-sm font-medium text-slate-300">
                      {radio.name} ({radio.id})
                    </label>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {adBotForm.targetRadios.length === 0
                ? 'All connected radios will be used'
                : `Using ${adBotForm.targetRadios.length} selected radio(s)`}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleAdBotSave}
              className="btn-primary flex-1"
            >
              Save Configuration
            </button>
            <button
              onClick={handleAdBotTest}
              disabled={adBotTesting || adBotForm.messages.length === 0}
              className="btn-secondary px-6"
            >
              {adBotTesting ? 'Testing...' : 'Send Test Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Example Messages */}
      <div className="card p-6 bg-slate-800/50">
        <h4 className="text-lg font-bold text-white mb-3">💡 Example Messages</h4>
        <div className="space-y-2 text-sm">
          <div className="p-3 bg-slate-900 rounded">
            <p className="text-slate-300">"🤖 Bot online! Send #help for commands"</p>
          </div>
          <div className="p-3 bg-slate-900 rounded">
            <p className="text-slate-300">"📡 Bridge bot active - monitoring mesh network"</p>
          </div>
          <div className="p-3 bg-slate-900 rounded">
            <p className="text-slate-300">"ℹ️ Need help? Use #ping to check if I'm alive"</p>
          </div>
          <div className="p-3 bg-slate-900 rounded">
            <p className="text-slate-300">"🌐 Connect to the mesh - bot ready to assist"</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdvertisementBotSettings;
