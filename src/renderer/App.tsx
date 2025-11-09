import React, { useState, useEffect } from 'react';
import { Radio, Statistics, LogEntry, BridgeConfig, Message } from './types';
import Dashboard from './components/Dashboard';
import RadioList from './components/RadioList';
import MessageMonitor from './components/MessageMonitor';
import LogViewer from './components/LogViewer';
import BridgeConfiguration from './components/BridgeConfiguration';
import ConnectRadioModal from './components/ConnectRadioModal';

type Tab = 'dashboard' | 'radios' | 'messages' | 'configuration' | 'logs';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [radios, setRadios] = useState<Radio[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bridgeConfig, setBridgeConfig] = useState<BridgeConfig | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    // Load initial data
    loadData();

    // Set up event listeners
    window.electronAPI.onRadioStatusChange((updatedRadios) => {
      setRadios(updatedRadios);
    });

    window.electronAPI.onStatisticsUpdate((stats) => {
      setStatistics(stats);
    });

    window.electronAPI.onLogMessage((log) => {
      setLogs((prev) => [...prev, log].slice(-1000));
    });

    window.electronAPI.onMessageReceived(({ radioId, message }) => {
      setMessages((prev) => [message, ...prev].slice(0, 500));
    });

    window.electronAPI.onMessageForwarded(({ sourceRadioId, targetRadioId, message }) => {
      // Update message as forwarded
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, forwarded: true, toRadio: targetRadioId } : m))
      );
    });
  }, []);

  const loadData = async () => {
    const [radiosData, statsData, logsData, configData] = await Promise.all([
      window.electronAPI.getRadios(),
      window.electronAPI.getStatistics(),
      window.electronAPI.getLogs(),
      window.electronAPI.getBridgeConfig(),
    ]);

    setRadios(radiosData);
    setStatistics(statsData);
    setLogs(logsData);
    setBridgeConfig(configData);
  };

  const handleDisconnectRadio = async (radioId: string) => {
    await window.electronAPI.disconnectRadio(radioId);
  };

  const handleUpdateBridgeConfig = async (config: Partial<BridgeConfig>) => {
    const updated = await window.electronAPI.updateBridgeConfig(config);
    setBridgeConfig(updated);
  };

  const connectedRadios = radios.filter((r) => r.status === 'connected');

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
              <p className="text-xs text-slate-400">Bridge GUI</p>
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

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => setShowConnectModal(true)}
            className="w-full btn-primary flex items-center justify-center gap-2"
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
              <RadioList radios={radios} onDisconnect={handleDisconnectRadio} />
            )}
            {activeTab === 'messages' && (
              <MessageMonitor messages={messages} radios={radios} />
            )}
            {activeTab === 'configuration' && bridgeConfig && (
              <BridgeConfiguration
                config={bridgeConfig}
                radios={radios}
                onUpdate={handleUpdateBridgeConfig}
              />
            )}
            {activeTab === 'logs' && (
              <LogViewer logs={logs} onClear={() => window.electronAPI.clearLogs()} />
            )}
          </div>
        </div>
      </div>

      {showConnectModal && (
        <ConnectRadioModal onClose={() => setShowConnectModal(false)} />
      )}
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
