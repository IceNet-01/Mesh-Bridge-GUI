import { useState } from 'react';
import { Card } from './ui/Card';
import AISettings from './AISettings';
import OllamaInstaller from './OllamaInstaller';
import CommunicationSettings from './CommunicationSettings';
import MQTTSettings from './MQTTSettings';
import AdvertisementBotSettings from './AdvertisementBotSettings';

type IntegrationTab = 'ai' | 'ollama' | 'communication' | 'mqtt' | 'adbot';

export default function Integrations() {
  const [activeTab, setActiveTab] = useState<IntegrationTab>('ai');

  const tabs: { id: IntegrationTab; label: string; icon: string }[] = [
    { id: 'ai', label: 'AI Assistant', icon: '🤖' },
    { id: 'ollama', label: 'Ollama Installer', icon: '🦙' },
    { id: 'communication', label: 'Email & Discord', icon: '📧' },
    { id: 'mqtt', label: 'MQTT', icon: '📡' },
    { id: 'adbot', label: 'Advertisement Bot', icon: '📢' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Integrations</h2>
        <p className="text-slate-400">
          Connect your bridge to external services and AI assistants
        </p>
      </div>

      {/* Tab Navigation */}
      <Card>
        <div className="flex gap-2 border-b border-slate-700 pb-4 flex-wrap">
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
        {activeTab === 'ai' && <AISettings />}
        {activeTab === 'ollama' && <OllamaInstaller />}
        {activeTab === 'communication' && <CommunicationSettings />}
        {activeTab === 'mqtt' && <MQTTSettings />}
        {activeTab === 'adbot' && <AdvertisementBotSettings />}
      </div>
    </div>
  );
}
