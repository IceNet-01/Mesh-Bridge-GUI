import { useState, useEffect } from 'react';
import { useStore } from './store/useStore';
import Dashboard from './components/Dashboard';
import RadioList from './components/RadioList';
import MessageMonitor from './components/MessageMonitor';
import LogViewer from './components/LogViewer';
import BridgeConfiguration from './components/BridgeConfiguration';
import AISettings from './components/AISettings';
import CommunicationSettings from './components/CommunicationSettings';
import { MapView } from './components/MapView';

type Tab = 'dashboard' | 'radios' | 'messages' | 'map' | 'configuration' | 'ai' | 'communication' | 'logs';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Zustand store
  const radios = useStore(state => state.radios);
  const statistics = useStore(state => state.statistics);
  const logs = useStore(state => state.logs);
  const messages = useStore(state => state.messages);
  const nodes = useStore(state => state.nodes);
  const bridgeConfig = useStore(state => state.bridgeConfig);
  const bridgeConnected = useStore(state => state.bridgeConnected);
  const autoScanEnabled = useStore(state => state.autoScanEnabled);
  const lastScan = useStore(state => state.lastScan);
  const initialize = useStore(state => state.initialize);
  const connectToBridge = useStore(state => state.connectToBridge);
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

  const connectedRadios = radios.filter((r) => r.status === 'connected');

  const getTimeSinceLastScan = () => {
    if (!lastScan) return 'Never';
    const seconds = Math.floor((Date.now() - lastScan.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

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
              <h1 className="text-lg font-bold text-white">Mesh Bridge</h1>
              <p className="text-xs text-slate-400">Relay Station</p>
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
            icon="map"
            label="Map"
            active={activeTab === 'map'}
            badge={nodes.filter(n => n.position).length}
            onClick={() => setActiveTab('map')}
          />
          <NavButton
            icon="config"
            label="Configuration"
            active={activeTab === 'configuration'}
            onClick={() => setActiveTab('configuration')}
          />
          <NavButton
            icon="ai"
            label="AI Assistant"
            active={activeTab === 'ai'}
            onClick={() => setActiveTab('ai')}
          />
          <NavButton
            icon="communication"
            label="Communication"
            active={activeTab === 'communication'}
            onClick={() => setActiveTab('communication')}
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

          {/* Auto-Scan Status */}
          {bridgeConnected && (
            <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center gap-2 mb-1">
                {autoScanEnabled ? (
                  <svg className="w-3 h-3 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className="text-xs font-medium text-blue-300">
                  {autoScanEnabled ? 'Auto-Scanning' : 'Auto-Scan Paused'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {autoScanEnabled ? `Last: ${getTimeSinceLastScan()}` : 'Radios detected automatically'}
              </p>
            </div>
          )}

          {/* Version and Copyright Footer */}
          <div className="px-3 py-2 text-center border-t border-slate-800/50">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-400">Meshtastic-Only Version</span>
              <br />
              v2.0.0
              <br />
              © 2024 Northern Plains IT, LLC
              <br />
              and OnyxVZ, LLC (IceNet-01)
            </p>
          </div>
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
            {activeTab === 'map' && (
              <MapView nodes={nodes} radios={radios} />
            )}
            {activeTab === 'configuration' && bridgeConfig && (
              <BridgeConfiguration
                config={bridgeConfig}
                radios={radios}
                onUpdate={updateBridgeConfig}
              />
            )}
            {activeTab === 'ai' && (
              <AISettings />
            )}
            {activeTab === 'communication' && (
              <CommunicationSettings />
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
    map: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    ),
    config: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    ),
    ai: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    ),
    communication: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
