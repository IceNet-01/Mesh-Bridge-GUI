import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { EmailConfig, DiscordConfig } from '../types';

function CommunicationSettings() {
  const {
    commConfig,
    getCommConfig,
    setEmailConfig,
    setDiscordConfig,
    testEmail,
    testDiscord
  } = useStore();

  const [emailForm, setEmailForm] = useState<EmailConfig>({
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: '',
    to: '',
    subjectPrefix: '[Mesh Bridge]'
  });

  const [discordForm, setDiscordForm] = useState<DiscordConfig>({
    enabled: false,
    webhook: '',
    username: 'Mesh Bridge',
    avatarUrl: '',
    botEnabled: false,
    botToken: '',
    channelId: '',
    sendEmergency: false
  });

  const [emailTesting, setEmailTesting] = useState(false);
  const [discordTesting, setDiscordTesting] = useState(false);

  useEffect(() => {
    getCommConfig();
  }, [getCommConfig]);

  useEffect(() => {
    if (commConfig) {
      setEmailForm(prev => ({ ...prev, ...commConfig.email, password: '' }));
      setDiscordForm(prev => ({ ...prev, ...commConfig.discord, botToken: '' }));
    }
  }, [commConfig]);

  const handleEmailSave = async () => {
    await setEmailConfig(emailForm);
    await getCommConfig();
  };

  const handleDiscordSave = async () => {
    await setDiscordConfig(discordForm);
    await getCommConfig();
  };

  const handleEmailTest = async () => {
    setEmailTesting(true);
    await testEmail();
    setTimeout(() => setEmailTesting(false), 2000);
  };

  const handleDiscordTest = async () => {
    setDiscordTesting(true);
    await testDiscord();
    setTimeout(() => setDiscordTesting(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Communication Settings</h2>
        <p className="text-slate-400">Configure email and Discord notifications from your radio</p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-blue-500/10 border border-blue-500/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white font-medium">Send messages from your radio to email or Discord</p>
            <p className="text-sm text-blue-200 mt-1">
              Use <span className="font-mono bg-blue-500/20 px-1 rounded">#email [message]</span>, <span className="font-mono bg-blue-500/20 px-1 rounded">#discord [message]</span>, or <span className="font-mono bg-blue-500/20 px-1 rounded">#notify [message]</span> to send notifications.
            </p>
          </div>
        </div>
      </div>

      {/* Email Settings */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">📧 Email Notifications</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={emailForm.enabled}
              onChange={(e) => setEmailForm({ ...emailForm, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">SMTP Host</label>
              <input
                type="text"
                value={emailForm.host}
                onChange={(e) => setEmailForm({ ...emailForm, host: e.target.value })}
                placeholder="smtp.gmail.com"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">SMTP Port</label>
              <input
                type="number"
                value={emailForm.port}
                onChange={(e) => setEmailForm({ ...emailForm, port: parseInt(e.target.value) })}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Email Username</label>
            <input
              type="text"
              value={emailForm.user}
              onChange={(e) => setEmailForm({ ...emailForm, user: e.target.value })}
              placeholder="your-email@gmail.com"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Email Password</label>
            <input
              type="password"
              value={emailForm.password}
              onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
              placeholder="App-specific password (leave blank to keep current)"
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">From Address</label>
              <input
                type="email"
                value={emailForm.from}
                onChange={(e) => setEmailForm({ ...emailForm, from: e.target.value })}
                placeholder="bridge@example.com"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">To Address</label>
              <input
                type="email"
                value={emailForm.to}
                onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
                placeholder="recipient@example.com"
                className="input w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={emailForm.secure}
              onChange={(e) => setEmailForm({ ...emailForm, secure: e.target.checked })}
              className="w-4 h-4"
            />
            <label className="text-sm text-slate-300">Use SSL (port 465)</label>
          </div>

          <div className="flex gap-2">
            <button onClick={handleEmailSave} className="btn-primary">
              Save Email Settings
            </button>
            <button onClick={handleEmailTest} disabled={emailTesting || !emailForm.enabled} className="btn-secondary">
              {emailTesting ? 'Sending...' : 'Test Email'}
            </button>
          </div>
        </div>
      </div>

      {/* Discord Settings */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">💬 Discord Integration</h3>
        </div>

        {/* Webhook Section */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-white">Webhook (One-Way: Mesh → Discord)</h4>
              <p className="text-xs text-slate-400">Send mesh messages to Discord using #discord command</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={discordForm.enabled}
                onChange={(e) => setDiscordForm({ ...discordForm, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Webhook URL</label>
              <input
                type="text"
                value={discordForm.webhook}
                onChange={(e) => setDiscordForm({ ...discordForm, webhook: e.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
                className="input w-full"
              />
              <p className="text-xs text-slate-400 mt-1">
                Create a webhook in your Discord server settings → Integrations
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Bot Username</label>
              <input
                type="text"
                value={discordForm.username}
                onChange={(e) => setDiscordForm({ ...discordForm, username: e.target.value })}
                placeholder="Meshtastic Bridge"
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Bot Section */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-white">Discord Bot (Two-Way: Mesh ↔ Discord)</h4>
              <p className="text-xs text-slate-400">Receive Discord messages and forward to mesh network</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={discordForm.botEnabled}
                onChange={(e) => setDiscordForm({ ...discordForm, botEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Bot Token</label>
              <input
                type="password"
                value={discordForm.botToken}
                onChange={(e) => setDiscordForm({ ...discordForm, botToken: e.target.value })}
                placeholder="Bot token (leave blank to keep current)"
                className="input w-full"
              />
              <p className="text-xs text-slate-400 mt-1">
                Get this from <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">Discord Developer Portal</a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Channel ID</label>
              <input
                type="text"
                value={discordForm.channelId}
                onChange={(e) => setDiscordForm({ ...discordForm, channelId: e.target.value })}
                placeholder="123456789012345678"
                className="input w-full"
              />
              <p className="text-xs text-slate-400 mt-1">
                Right-click channel in Discord (with Developer Mode enabled) → Copy ID
              </p>
            </div>
          </div>
        </div>

        {/* Emergency Notifications */}
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🚨</span>
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-white">Auto-Send Emergency/SOS to Discord</h4>
              <p className="text-xs text-slate-400">Automatically forward emergency waypoints to Discord webhook/bot</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={discordForm.sendEmergency}
                onChange={(e) => setDiscordForm({ ...discordForm, sendEmergency: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>
          <p className="text-xs text-red-300">
            When enabled, any SOS waypoint received by your radio will be automatically sent to Discord with location details.
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={handleDiscordSave} className="btn-primary">
            Save Discord Settings
          </button>
          <button onClick={handleDiscordTest} disabled={discordTesting || !discordForm.enabled} className="btn-secondary">
            {discordTesting ? 'Sending...' : 'Test Webhook'}
          </button>
        </div>
      </div>

      {/* Usage Examples */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Usage Examples</h3>
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 mb-1">Send email:</p>
            <code className="text-primary-300 font-mono">#email Sensor alert: Temperature is 95°F</code>
          </div>
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 mb-1">Send to Discord:</p>
            <code className="text-primary-300 font-mono">#discord Power outage detected at station 3</code>
          </div>
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 mb-1">Send to both:</p>
            <code className="text-primary-300 font-mono">#notify Emergency: Help needed at coordinates</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommunicationSettings;
