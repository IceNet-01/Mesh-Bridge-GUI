import { useState, useEffect } from 'react';
import { useStore } from './store/useStore';
import './utils/clearStorage'; // Load storage utilities in dev mode
import { RadioIcon } from './components/icons';
import { StatusBadge } from './components/ui/StatusBadge';
import { NavButton } from './components/navigation/NavButton';
import { getNavigationConfig } from './components/navigation/config';
import { Tab } from './components/navigation/types';
import { TAB_ROUTES } from './components/navigation/tabRoutes';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Zustand store
  const radios = useStore(state => state.radios);
  const statistics = useStore(state => state.statistics);
  const logs = useStore(state => state.logs);
  const consoleLines = useStore(state => state.consoleLines);
  const messages = useStore(state => state.messages);
  const nodes = useStore(state => state.nodes);
  const bridgeConfig = useStore(state => state.bridgeConfig);
  const bridgeConnected = useStore(state => state.bridgeConnected);
  const autoScanEnabled = useStore(state => state.autoScanEnabled);
  const lastScan = useStore(state => state.lastScan);
  const initialize = useStore(state => state.initialize);
  const connectToBridge = useStore(state => state.connectToBridge);
  const disconnectRadio = useStore(state => state.disconnectRadio);
  const rebootRadio = useStore(state => state.rebootRadio);
  const syncRadioTime = useStore(state => state.syncRadioTime);
  const getChannel = useStore(state => state.getChannel);
  const setChannel = useStore(state => state.setChannel);
  const getRadioConfig = useStore(state => state.getRadioConfig);
  const setRadioConfig = useStore(state => state.setRadioConfig);
  const sendMessage = useStore(state => state.sendMessage);
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

  const getTimeSinceLastScan = () => {
    if (!lastScan) return 'Never';
    const seconds = Math.floor((Date.now() - lastScan.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  // Get navigation configuration
  const navGroups = getNavigationConfig(nodes, radios, messages, logs);

  // Get current tab route
  const currentRoute = TAB_ROUTES[activeTab];
  const TabComponent = currentRoute.component;
  const isFullHeight = currentRoute.fullHeight;

  // Get props for current tab
  const getTabProps = () => {
    switch (activeTab) {
      case 'dashboard':
        return { radios, statistics, messages };
      case 'devices':
        return { radios, onDisconnect: disconnectRadio, onReboot: rebootRadio, onSyncTime: syncRadioTime, onGetChannel: getChannel, onSetChannel: setChannel, onGetConfig: getRadioConfig, onSetConfig: setRadioConfig };
      case 'nodes':
        return { nodes, radios };
      case 'messages':
        return { messages, radios };
      case 'map':
      case 'tactical':
        return { nodes, radios };
      case 'siteplanner':
        return {};
      case 'networkhealth':
        return { nodes, radios, messages };
      case 'emergency':
        return { nodes, radios, messages, onSendMessage: sendMessage };
      case 'configuration':
        return { config: bridgeConfig, radios, onUpdate: updateBridgeConfig };
      case 'integrations':
        return {};
      case 'system':
        return { logs, consoleLines, onClear: clearLogs };
      default:
        return {};
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900/50 backdrop-blur-sm border-r border-slate-800 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <RadioIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Mesh Bridge</h1>
              <p className="text-xs text-slate-400">Relay Station</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {navGroups.map((group, idx) => (
            <div key={idx}>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-4">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map(item => (
                  <NavButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeTab === item.id}
                    badge={item.badge ? item.badge() : undefined}
                    badgeColor={item.badgeColor}
                    onClick={() => setActiveTab(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer Status */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          {/* Bridge Connection Status */}
          <div className="px-3 py-2 rounded-lg bg-slate-800/50">
            <StatusBadge
              status={bridgeConnected ? 'active' : 'error'}
              label={bridgeConnected ? 'Bridge Connected' : 'Bridge Disconnected'}
              pulse={bridgeConnected}
            />
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
              Alpha 25.11
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
          {isFullHeight ? (
            <div className="h-full">
              <TabComponent {...getTabProps()} />
            </div>
          ) : (
            <div className="p-6">
              <TabComponent {...getTabProps()} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
