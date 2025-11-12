import { useState, useEffect } from 'react';
import { useStore } from './store/useStore';
import Dashboard from './components/Dashboard';
import RadioList from './components/RadioList';
import MessageMonitor from './components/MessageMonitor';
import LogViewer from './components/LogViewer';
import BridgeConfiguration from './components/BridgeConfiguration';

type Tab = 'dashboard' | 'radios' | 'messages' | 'configuration' | 'logs';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Zustand store
  const radios = useStore(state => state.radios);
  const statistics = useStore(state => state.statistics);
  const logs = useStore(state => state.logs);
  const messages = useStore(state => state.messages);
  const bridgeConfig = useStore(state => state.bridgeConfig);
  const bridgeConnected = useStore(state => state.bridgeConnected);
  const initialize = useStore(state => state.initialize);
  const connectToBridge = useStore(state => state.connectToBridge);
  const scanAndConnectRadio = useStore(state => state.scanAndConnectRadio);
  const disconnectRadio = useStore(state => state.disconnectRadio);
  const updateBridgeConfig = useStore(state => state.updateBridgeConfig);
  const clearLogs = useStore(state => state.clearLogs);

  useEffect(() => {
    initialize();

    // Auto-connect to bridge server
    connectToBridge().then(result => {
      if (!result.success) {
        console.error('Failed to connect to bridge:', result.error);
        alert(`Failed to connect to bridge server: ${result.error}\n\nMake sure the bridge server is running:\n  npm run start`);
      }
    });
  }, [initialize, connectToBridge]);

  const handleConnectRadio = async () => {
    try {
      await scanAndConnectRadio();
    } catch (error) {
      console.error('Failed to connect radio:', error);
      const errorMessage = (error as Error).message || 'Unknown error';

      if (errorMessage.includes('cancel') || errorMessage.includes('NotFoundError')) {
        console.log('User canceled serial port selection');
      } else {
        alert(`Failed to connect radio: ${errorMessage}\n\nMake sure:\n- Your Meshtastic device is connected via USB\n- You granted permission to access the serial port\n- No other application is using the device`);
      }
    }
  };

  const connectedRadios = radios.filter((r) => r.status === 'connected');

  // Check for Web Serial API support
  const isWebSerialSupported = 'serial' in navigator;

  if (!isWebSerialSupported) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="card p-8 max-w-md text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-2xl font-bold text-white mb-4">Web Serial API Not Supported</h2>
          <p className="text-slate-300 mb-4">
            This application requires the Web Serial API, which is only available in:
          </p>
          <ul className="text-left text-slate-300 mb-6 space-y-2">
            <li>✅ Chrome 89+ (Desktop)</li>
            <li>✅ Edge 89+ (Desktop)</li>
            <li>✅ Opera 75+ (Desktop)</li>
          </ul>
          <p className="text-slate-400 text-sm">
            Please use a supported browser to access USB Meshtastic devices.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900/50 backdrop-blur-sm border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Meshtastic</h1>
              <p className="text-xs text-slate-400">Bridge PWA</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavButton
            icon="chart"
            label="Dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <NavButton
            icon="radio"
            label="Radios"
            active={activeTab === 'radios'}
            badge={connectedRadios.length}
            onClick={() => setActiveTab('radios')}
          />
          <NavButton
            icon="messages"
            label="Messages"
            active={activeTab === 'messages'}
            badge={messages.length}
            onClick={() => setActiveTab('messages')}
          />
          <NavButton
            icon="config"
            label="Configuration"
            active={activeTab === 'configuration'}
            onClick={() => setActiveTab('configuration')}
          />
          <NavButton
            icon="logs"
            label="Logs"
            active={activeTab === 'logs'}
            badge={logs.filter((l) => l.level === 'error').length}
            badgeColor="red"
            onClick={() => setActiveTab('logs')}
          />
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          {/* Bridge Connection Status */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50">
            <div className={`w-2 h-2 rounded-full ${bridgeConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-xs text-slate-400">
              {bridgeConnected ? 'Bridge Connected' : 'Bridge Disconnected'}
            </span>
          </div>

          {/* Connect Radio Button */}
          <button
            onClick={handleConnectRadio}
            disabled={!bridgeConnected}
            className={`w-full btn-primary flex items-center justify-center gap-2 ${
              !bridgeConnected ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={!bridgeConnected ? 'Bridge server must be connected first' : 'Connect a Meshtastic radio'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Connect Radio
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="p-6">
            {activeTab === 'dashboard' && statistics && (
              <Dashboard radios={radios} statistics={statistics} messages={messages} />
            )}
            {activeTab === 'radios' && (
              <RadioList radios={radios} onDisconnect={disconnectRadio} />
            )}
            {activeTab === 'messages' && (
              <MessageMonitor messages={messages} radios={radios} />
            )}
            {activeTab === 'configuration' && bridgeConfig && (
              <BridgeConfiguration
                config={bridgeConfig}
                radios={radios}
                onUpdate={updateBridgeConfig}
              />
            )}
            {activeTab === 'logs' && (
              <LogViewer logs={logs} onClear={clearLogs} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface NavButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  badgeColor?: 'blue' | 'red';
  onClick: () => void;
}

function NavButton({ icon, label, active, badge, badgeColor = 'blue', onClick }: NavButtonProps) {
  const icons: Record<string, JSX.Element> = {
    chart: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
    radio: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    ),
    messages: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    ),
    config: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    ),
    logs: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
        active
          ? 'bg-primary-600 text-white'
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
      }`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[icon]}
      </svg>
      <span className="flex-1 text-left text-sm font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
            badgeColor === 'red' ? 'bg-red-500 text-white' : 'bg-primary-500 text-white'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default App;
