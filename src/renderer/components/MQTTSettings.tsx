import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { MQTTConfig } from '../types';

function MQTTSettings() {
  const {
    mqttConfig,
    getMQTTConfig,
    setMQTTConfig,
    setMQTTEnabled,
    testMQTT
  } = useStore();

  const [mqttForm, setMQTTForm] = useState<MQTTConfig>({
    enabled: false,
    brokerUrl: '',
    username: '',
    password: '',
    topicPrefix: 'meshtastic',
    qos: 0,
    retain: false,
    connected: false
  });

  const [mqttTesting, setMQTTTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    getMQTTConfig();
  }, []);

  useEffect(() => {
    if (mqttConfig) {
      setMQTTForm(prev => ({ ...prev, ...mqttConfig, password: '' }));
    }
  }, [mqttConfig]);

  const handleMQTTSave = async () => {
    await setMQTTConfig(mqttForm);
    await getMQTTConfig();
  };

  const handleMQTTTest = async () => {
    setMQTTTesting(true);
    await testMQTT();
    setTimeout(() => setMQTTTesting(false), 2000);
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    await setMQTTEnabled(enabled);
    await getMQTTConfig();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">MQTT Bridge Settings</h2>
        <p className="text-slate-400">Connect your mesh network to MQTT brokers for IoT integration</p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-green-500/10 border border-green-500/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white font-medium">Bridge Meshtastic messages to MQTT</p>
            <p className="text-sm text-green-200 mt-1">
              Messages received on your radios are published to <span className="font-mono bg-green-500/20 px-1 rounded">{mqttForm.topicPrefix}/channel#/tx</span>
            </p>
            <p className="text-sm text-green-200 mt-1">
              Subscribe to <span className="font-mono bg-green-500/20 px-1 rounded">{mqttForm.topicPrefix}/channel#/rx</span> to send messages to radios
            </p>
          </div>
        </div>
      </div>

      {/* MQTT Connection Status */}
      {mqttConfig?.connected && (
        <div className="card p-4 bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-green-300 font-medium">Connected to MQTT broker</span>
          </div>
        </div>
      )}

      {/* MQTT Settings */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">🌐 MQTT Bridge</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={mqttForm.enabled}
              onChange={(e) => handleToggleEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            <span className="ml-3 text-sm font-medium text-slate-300">
              {mqttForm.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        <div className="space-y-4">
          {/* Broker URL */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Broker URL
            </label>
            <input
              type="text"
              value={mqttForm.brokerUrl}
              onChange={(e) => setMQTTForm({ ...mqttForm, brokerUrl: e.target.value })}
              placeholder="mqtt://broker.hivemq.com:1883"
              className="input w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              Format: mqtt://hostname:port or mqtts://hostname:port for SSL
            </p>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Username (optional)
            </label>
            <input
              type="text"
              value={mqttForm.username}
              onChange={(e) => setMQTTForm({ ...mqttForm, username: e.target.value })}
              placeholder="username"
              className="input w-full"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Password (optional)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={mqttForm.password}
                onChange={(e) => setMQTTForm({ ...mqttForm, password: e.target.value })}
                placeholder="********"
                className="input w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Topic Prefix */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Topic Prefix
            </label>
            <input
              type="text"
              value={mqttForm.topicPrefix}
              onChange={(e) => setMQTTForm({ ...mqttForm, topicPrefix: e.target.value })}
              placeholder="meshtastic"
              className="input w-full"
            />
            <p className="text-xs text-slate-500 mt-1">
              Messages will be published to: {mqttForm.topicPrefix}/channel#/tx
            </p>
          </div>

          {/* QoS */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Quality of Service (QoS)
            </label>
            <select
              value={mqttForm.qos}
              onChange={(e) => setMQTTForm({ ...mqttForm, qos: parseInt(e.target.value) })}
              className="input w-full"
            >
              <option value="0">0 - At most once (fire and forget)</option>
              <option value="1">1 - At least once (acknowledged delivery)</option>
              <option value="2">2 - Exactly once (assured delivery)</option>
            </select>
          </div>

          {/* Retain */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="mqtt-retain"
              checked={mqttForm.retain}
              onChange={(e) => setMQTTForm({ ...mqttForm, retain: e.target.checked })}
              className="w-4 h-4 text-green-600 bg-slate-700 border-slate-600 rounded focus:ring-green-600 focus:ring-2"
            />
            <label htmlFor="mqtt-retain" className="text-sm font-medium text-slate-300">
              Retain messages on broker
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleMQTTSave}
              className="btn-primary flex-1"
            >
              Save Configuration
            </button>
            <button
              onClick={handleMQTTTest}
              disabled={mqttTesting || !mqttForm.brokerUrl}
              className="btn-secondary px-6"
            >
              {mqttTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </div>
      </div>

      {/* Example Usage */}
      <div className="card p-6 bg-slate-800/50">
        <h4 className="text-lg font-bold text-white mb-3">📖 Example Usage</h4>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-slate-300 font-medium mb-1">Publish to MQTT (Node.js):</p>
            <pre className="bg-slate-900 p-3 rounded text-green-400 overflow-x-auto">
{`const mqtt = require('mqtt');
const client = mqtt.connect('${mqttForm.brokerUrl || 'mqtt://broker.example.com'}');

client.on('connect', () => {
  client.publish('${mqttForm.topicPrefix}/channel0/rx', JSON.stringify({
    text: 'Hello from MQTT!',
    timestamp: new Date().toISOString()
  }));
});`}
            </pre>
          </div>
          <div>
            <p className="text-slate-300 font-medium mb-1">Subscribe to messages (Node.js):</p>
            <pre className="bg-slate-900 p-3 rounded text-blue-400 overflow-x-auto">
{`client.on('connect', () => {
  client.subscribe('${mqttForm.topicPrefix}/channel0/tx', (err) => {
    if (!err) console.log('Subscribed!');
  });
});

client.on('message', (topic, message) => {
  const data = JSON.parse(message.toString());
  console.log('Received:', data.text);
});`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MQTTSettings;
