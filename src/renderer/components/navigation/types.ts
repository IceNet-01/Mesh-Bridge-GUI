import { IconName } from '../icons';

export type Tab =
  | 'dashboard'
  | 'radios'
  | 'radioconfig'
  | 'nodes'
  | 'messages'
  | 'map'
  | 'tactical'
  | 'siteplanner'
  | 'networkhealth'
  | 'emergency'
  | 'weather'
  | 'configuration'
  | 'server'
  | 'update'
  | 'portexclusion'
  | 'ai'
  | 'communication'
  | 'mqtt'
  | 'adbot'
  | 'logs';

export interface NavItem {
  id: Tab;
  icon: IconName;
  label: string;
  badge?: () => number;
  badgeColor?: 'blue' | 'red';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
