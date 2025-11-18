import { IconName } from '../icons';

export type Tab =
  | 'dashboard'
  | 'radios'
  | 'nodes'
  | 'messages'
  | 'map'
  | 'tactical'
  | 'siteplanner'
  | 'networkhealth'
  | 'emergency'
  | 'configuration'
  | 'ai'
  | 'communication'
  | 'mqtt'
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
