import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { useStore } from '../store/useStore';

export function PublicChannelSettings() {
  const [disablePublicChannel, setDisablePublicChannel] = useState(false);
  const [loading, setLoading] = useState(true);
  const manager = useStore(state => state.manager);

  useEffect(() => {
    if (!manager.isConnected()) return;

    // Request current config
    manager.send({ type: 'config-get-public-channel' });

    const handleMessage = ((event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'public-channel-config':
            setDisablePublicChannel(data.disablePublicChannel);
            setLoading(false);
            break;

          case 'public-channel-config-updated':
            setDisablePublicChannel(data.disablePublicChannel);
            break;

          case 'public-channel-config-result':
            if (!data.success) {
              alert(`Failed to update settings: ${data.error}`);
              // Revert to previous state
              manager.send({ type: 'config-get-public-channel' });
            }
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }) as EventListener;

    manager.addEventListener('message', handleMessage);

    return () => {
      manager.removeEventListener('message', handleMessage);
    };
  }, [manager]);

  const handleToggle = (newValue: boolean) => {
    if (!manager.isConnected()) return;

    // Confirm if enabling public channel access
    if (!newValue) {
      if (!confirm('Enable public channel (AQ==)?\n\nThis will allow bridge features on the default public channel.\n\nAnyone on the public mesh can trigger commands and see forwarded messages.')) {
        return;
      }
    } else {
      if (!confirm('Disable public channel (AQ==)?\n\nThis will make the bridge private-only. Bridge features will ONLY work on custom/private channels.\n\nPublic channel messages will be ignored.')) {
        return;
      }
    }

    setDisablePublicChannel(newValue);
    manager.send({
      type: 'config-set-public-channel',
      disabled: newValue
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Public Channel Settings</h2>
        <p className="text-slate-400">
          Control whether bridge features work on the default public channel (PSK: AQ==)
        </p>
      </div>

      {/* Main Setting Card */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Public Channel Access</h3>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span>Loading...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex-1">
                <div className="font-medium text-white mb-1">
                  {disablePublicChannel ? '🚫 Public Channel Disabled' : '✅ Public Channel Enabled'}
                </div>
                <div className="text-sm text-slate-400">
                  {disablePublicChannel
                    ? 'Bridge features only work on private/custom channels'
                    : 'Bridge features work on all channels including public (AQ==)'
                  }
                </div>
              </div>
              <button
                onClick={() => handleToggle(!disablePublicChannel)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  disablePublicChannel ? 'bg-red-600' : 'bg-green-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    disablePublicChannel ? 'translate-x-1' : 'translate-x-6'
                  }`}
                />
              </button>
            </div>

            {/* Status Card */}
            {disablePublicChannel ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-sm text-yellow-300">
                    <strong className="font-semibold">Private Mode Active</strong>
                    <p className="mt-1">
                      The bridge will ignore all messages on the default public channel (PSK: AQ==).
                      Only custom private channels will be bridged.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-300">
                    <strong className="font-semibold">Public Mode Active</strong>
                    <p className="mt-1">
                      Bridge features work on all channels including the default public channel (PSK: AQ==).
                      Anyone on the public mesh can use commands and see forwarded messages.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Info Card */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">What does this do?</h3>

        <div className="space-y-3 text-sm text-slate-300">
          <p>
            The default Meshtastic public channel uses PSK <code className="bg-slate-700 px-1 rounded">AQ==</code> (base64 for 0x01).
            This channel is accessible by anyone with default settings.
          </p>

          <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
            <div>
              <strong className="text-white">When Public Channel is ENABLED:</strong>
              <ul className="mt-1 space-y-1 list-disc list-inside text-slate-400">
                <li>Bridge forwards messages on ALL channels</li>
                <li>Commands (e.g., <code className="bg-slate-700 px-1 rounded">#ping</code>) work on public channel</li>
                <li>Anyone on public mesh can interact with bridge</li>
                <li>Good for: Public mesh participation, community bridges</li>
              </ul>
            </div>

            <div className="pt-2">
              <strong className="text-white">When Public Channel is DISABLED:</strong>
              <ul className="mt-1 space-y-1 list-disc list-inside text-slate-400">
                <li>Bridge ignores messages on public channel (AQ==)</li>
                <li>Commands and forwarding only work on private channels</li>
                <li>Bridge features are completely private</li>
                <li>Good for: Private operations, controlled access</li>
              </ul>
            </div>
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <div className="flex gap-2">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-green-300">
                <strong>Tip:</strong> Custom private channels will always work regardless of this setting.
                This only affects the default public channel.
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Use Cases Card */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-4">Common Use Cases</h3>

        <div className="space-y-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="font-medium text-white mb-1">🌐 Public Community Bridge</div>
            <div className="text-sm text-slate-400">
              Keep public channel ENABLED to participate in the public mesh and provide bridging services to the community.
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="font-medium text-white mb-1">🔒 Private Organization Bridge</div>
            <div className="text-sm text-slate-400">
              DISABLE public channel to keep bridge functionality restricted to your organization's private channels only.
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="font-medium text-white mb-1">🎯 Selective Bridging</div>
            <div className="text-sm text-slate-400">
              DISABLE public channel and use custom channels to bridge only specific groups while remaining invisible on public mesh.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
