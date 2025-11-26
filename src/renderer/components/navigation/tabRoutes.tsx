import { ComponentType } from 'react';
import { Tab } from './types';
import Dashboard from '../Dashboard';
import DeviceManager from '../DeviceManager';
import NodeList from '../NodeList';
import MessageMonitor from '../MessageMonitor';
import { MapView } from '../MapView';
import TacticalView from '../TacticalView';
import SitePlanner from '../SitePlanner';
import NetworkHealth from '../NetworkHealth';
import EmergencyAndWeather from '../EmergencyAndWeather';
import BridgeConfigurationConsolidated from '../BridgeConfigurationConsolidated';
import Integrations from '../Integrations';
import SystemSettings from '../SystemSettings';

interface TabRoute {
  component: ComponentType<any>;
  fullHeight?: boolean;
}

export const TAB_ROUTES: Record<Tab, TabRoute> = {
  dashboard: {
    component: Dashboard,
  },
  devices: {
    component: DeviceManager,
  },
  nodes: {
    component: NodeList,
  },
  messages: {
    component: MessageMonitor,
  },
  map: {
    component: MapView,
    fullHeight: true,
  },
  tactical: {
    component: TacticalView,
    fullHeight: true,
  },
  siteplanner: {
    component: SitePlanner,
  },
  networkhealth: {
    component: NetworkHealth,
  },
  emergency: {
    component: EmergencyAndWeather,
  },
  configuration: {
    component: BridgeConfigurationConsolidated,
  },
  integrations: {
    component: Integrations,
  },
  system: {
    component: SystemSettings,
  },
};
