import { useState } from 'react';
import { Card } from './ui/Card';
import BridgeConfiguration from './BridgeConfiguration';
import { PublicChannelSettings } from './PublicChannelSettings';
import { BridgeConfig, Radio } from '../types';

interface BridgeConfigurationConsolidatedProps {
  config: BridgeConfig;
  radios: Radio[];
  onUpdate: (config: Partial<BridgeConfig>) => void;
}

type ConfigTab = 'bridge' | 'public-channel';

export default function BridgeConfigurationConsolidated(props: BridgeConfigurationConsolidatedProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>('bridge');

  const tabs: { id: ConfigTab; label: string; icon: string }[] = [
    { id: 'bridge', label: 'Bridge Settings', icon: '🌉' },
    { id: 'public-channel', label: 'Public Channel', icon: '📡' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Bridge Configuration</h2>
        <p className="text-slate-400">
          Configure bridge settings and channel management
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
        {activeTab === 'bridge' && (
          <BridgeConfiguration
            config={props.config}
            radios={props.radios}
            onUpdate={props.onUpdate}
          />
        )}

        {activeTab === 'public-channel' && (
          <PublicChannelSettings />
        )}
      </div>
    </div>
  );
}
