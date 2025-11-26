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
          id: 'devices',
          icon: 'radio',
          label: 'Devices',
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
      label: 'Monitoring',
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
        {
          id: 'networkhealth',
          icon: 'networkhealth',
          label: 'Network Health'
        },
        {
          id: 'emergency',
          icon: 'emergency',
          label: 'Emergency Response'
        },
      ]
    },
    {
      label: 'Settings',
      items: [
        {
          id: 'configuration',
          icon: 'config',
          label: 'Bridge Configuration'
        },
        {
          id: 'integrations',
          icon: 'communication',
          label: 'Integrations'
        },
        {
          id: 'system',
          icon: 'server',
          label: 'System & Logs',
          badge: () => errorLogs.length,
          badgeColor: 'red'
        },
      ]
    }
  ];
}
