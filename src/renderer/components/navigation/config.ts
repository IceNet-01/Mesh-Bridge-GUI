import { NavGroup } from './types';
import { MeshNode, Radio, LogEntry, Message } from '../../types';

export function getNavigationConfig(
  nodes: MeshNode[],
  radios: Radio[],
  messages: Message[],
  logs: LogEntry[]
): NavGroup[] {
  const connectedRadios = radios.filter(r => r.status === 'connected');
  const errorLogs = logs.filter(l => l.level === 'error');
  const nodesWithPosition = nodes.filter(n => n.position);
  const recentActiveNodes = nodes.filter(n =>
    n.position && n.lastHeard && (Date.now() - n.lastHeard.getTime()) < 5 * 60 * 1000
  );

  return [
    {
      label: 'Overview',
      items: [
        { id: 'dashboard', icon: 'chart', label: 'Dashboard' },
      ]
    },
    {
      label: 'Network',
      items: [
        {
          id: 'radios',
          icon: 'radio',
          label: 'Radios',
          badge: () => connectedRadios.length
        },
        {
          id: 'bluetooth',
          icon: 'bluetooth',
          label: 'Bluetooth Scanner',
        },
        {
          id: 'radioconfig',
          icon: 'config',
          label: 'Radio Config',
          badge: () => connectedRadios.length
        },
        {
          id: 'nodes',
          icon: 'nodes',
          label: 'Nodes',
          badge: () => nodes.length
        },
        {
          id: 'messages',
          icon: 'messages',
          label: 'Messages',
          badge: () => messages.length
        },
      ]
    },
    {
      label: 'Visualization',
      items: [
        {
          id: 'map',
          icon: 'map',
          label: 'Map',
          badge: () => nodesWithPosition.length
        },
        {
          id: 'tactical',
          icon: 'tactical',
          label: 'TAK',
          badge: () => recentActiveNodes.length
        },
        {
          id: 'siteplanner',
          icon: 'siteplanner',
          label: 'Site Planner'
        },
      ]
    },
    {
      label: 'Operations',
      items: [
        {
          id: 'networkhealth',
          icon: 'networkhealth',
          label: 'Network Health'
        },
        {
          id: 'emergency',
          icon: 'emergency',
          label: 'Emergency / SOS'
        },
        {
          id: 'weather',
          icon: 'weather',
          label: 'NWS Weather Alerts'
        },
      ]
    },
    {
      label: 'Settings',
      items: [
        {
          id: 'configuration',
          icon: 'config',
          label: 'Configuration'
        },
        {
          id: 'server',
          icon: 'server',
          label: 'Server'
        },
        {
          id: 'update',
          icon: 'update',
          label: 'System Update'
        },
        {
          id: 'ollama',
          icon: 'ai',
          label: 'Ollama Installer'
        },
        {
          id: 'portexclusion',
          icon: 'radio',
          label: 'Port Exclusion'
        },
        {
          id: 'publicchannel',
          icon: 'config',
          label: 'Public Channel'
        },
        {
          id: 'ai',
          icon: 'ai',
          label: 'AI Assistant'
        },
        {
          id: 'communication',
          icon: 'communication',
          label: 'Communication'
        },
        {
          id: 'mqtt',
          icon: 'mqtt',
          label: 'MQTT'
        },
        {
          id: 'adbot',
          icon: 'megaphone',
          label: 'Advertisement Bot'
        },
      ]
    },
    {
      label: 'System',
      items: [
        {
          id: 'logs',
          icon: 'logs',
          label: 'Logs',
          badge: () => errorLogs.length,
          badgeColor: 'red'
        },
      ]
    }
  ];
}
