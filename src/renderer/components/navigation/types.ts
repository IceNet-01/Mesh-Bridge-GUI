import { IconName } from '../icons';

export type Tab =
  | 'dashboard'
  | 'devices'
  | 'nodes'
  | 'messages'
  | 'map'
  | 'tactical'
  | 'siteplanner'
  | 'networkhealth'
  | 'emergency'
  | 'configuration'
  | 'integrations'
  | 'system';

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
