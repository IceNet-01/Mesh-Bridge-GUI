import { useState } from 'react';
import { Card } from './ui/Card';
import RadioList from './RadioList';
import { BluetoothDeviceScanner } from './BluetoothDeviceScanner';
import RadioConfigPage from './RadioConfigPage';
import { PortExclusion } from './PortExclusion';

interface DeviceManagerProps {
  radios: any[];
  onDisconnect: (radioId: string) => void;
  onReboot: (radioId: string) => void;
  onSyncTime: (radioId: string) => void;
  onGetChannel: (radioId: string, channelIndex: number) => void;
  onSetChannel: (radioId: string, channelConfig: any) => void;
  onGetConfig?: (radioId: string, configType: string) => void;
  onSetConfig?: (radioId: string, configType: string, config: any) => void;
}

type DeviceTab = 'radios' | 'bluetooth' | 'config' | 'ports';

export default function DeviceManager(props: DeviceManagerProps) {
  const [activeTab, setActiveTab] = useState<DeviceTab>('radios');

  const tabs: { id: DeviceTab; label: string; icon: string }[] = [
    { id: 'radios', label: 'USB/Serial Radios', icon: '📻' },
    { id: 'bluetooth', label: 'Bluetooth Scanner', icon: '🔵' },
    { id: 'config', label: 'Radio Configuration', icon: '⚙️' },
    { id: 'ports', label: 'Port Exclusion', icon: '🔌' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Device Manager</h2>
        <p className="text-slate-400">
          Manage all your Meshtastic devices in one place
        </p>
      </div>

      {/* Tab Navigation */}
      <Card>
        <div className="flex gap-2 border-b border-slate-700 pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Tab Content */}
      <div>
        {activeTab === 'radios' && (
          <RadioList
            radios={props.radios}
            onDisconnect={props.onDisconnect}
            onReboot={props.onReboot}
            onSyncTime={props.onSyncTime}
            onGetChannel={props.onGetChannel}
            onSetChannel={props.onSetChannel}
          />
        )}

        {activeTab === 'bluetooth' && (
          <BluetoothDeviceScanner />
        )}

        {activeTab === 'config' && (
          <RadioConfigPage
            radios={props.radios}
            onGetChannel={props.onGetChannel}
            onSetChannel={props.onSetChannel}
            onGetConfig={props.onGetConfig}
            onSetConfig={props.onSetConfig}
          />
        )}

        {activeTab === 'ports' && (
          <PortExclusion />
        )}
      </div>
    </div>
  );
}
