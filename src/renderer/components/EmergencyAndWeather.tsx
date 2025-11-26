import { useState } from 'react';
import { Card } from './ui/Card';
import EmergencyResponse from './EmergencyResponse';
import NWSWeatherAlerts from './NWSWeatherAlerts';
import { MeshNode, Radio, Message } from '../types';

interface EmergencyAndWeatherProps {
  nodes: MeshNode[];
  radios: Radio[];
  messages: Message[];
  onSendMessage: (radioId: string, text: string, channel: number) => void;
}

type EmergencyTab = 'sos' | 'weather';

export default function EmergencyAndWeather(props: EmergencyAndWeatherProps) {
  const [activeTab, setActiveTab] = useState<EmergencyTab>('sos');

  const tabs: { id: EmergencyTab; label: string; icon: string }[] = [
    { id: 'sos', label: 'Emergency / SOS', icon: '🚨' },
    { id: 'weather', label: 'Weather Alerts', icon: '🌩️' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Emergency Response</h2>
        <p className="text-slate-400">
          Monitor emergency alerts and weather warnings
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
        {activeTab === 'sos' && (
          <EmergencyResponse
            nodes={props.nodes}
            radios={props.radios}
            messages={props.messages}
            onSendMessage={props.onSendMessage}
          />
        )}

        {activeTab === 'weather' && (
          <NWSWeatherAlerts
            radios={props.radios}
            onSendMessage={props.onSendMessage}
          />
        )}
      </div>
    </div>
  );
}
