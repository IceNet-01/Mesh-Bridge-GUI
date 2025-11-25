import { ComponentType } from 'react';
import { Tab } from './types';
import Dashboard from '../Dashboard';
import RadioList from '../RadioList';
import RadioConfigPage from '../RadioConfigPage';
import NodeList from '../NodeList';
import MessageMonitor from '../MessageMonitor';
import { MapView } from '../MapView';
import TacticalView from '../TacticalView';
import SitePlanner from '../SitePlanner';
import NetworkHealth from '../NetworkHealth';
import EmergencyResponse from '../EmergencyResponse';
import NWSWeatherAlerts from '../NWSWeatherAlerts';
import BridgeConfiguration from '../BridgeConfiguration';
import { BridgeServerSettings } from '../BridgeServerSettings';
import { SystemUpdate } from '../SystemUpdate';
import { PortExclusion } from '../PortExclusion';
import AISettings from '../AISettings';
import CommunicationSettings from '../CommunicationSettings';
import MQTTSettings from '../MQTTSettings';
import AdvertisementBotSettings from '../AdvertisementBotSettings';
import LogViewer from '../LogViewer';

interface TabRoute {
  component: ComponentType<any>;
  fullHeight?: boolean;
}

export const TAB_ROUTES: Record<Tab, TabRoute> = {
  dashboard: {
    component: Dashboard,
  },
  radios: {
    component: RadioList,
  },
  radioconfig: {
    component: RadioConfigPage,
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
    component: EmergencyResponse,
  },
  weather: {
    component: NWSWeatherAlerts,
  },
  configuration: {
    component: BridgeConfiguration,
  },
  server: {
    component: BridgeServerSettings,
  },
  update: {
    component: SystemUpdate,
  },
  portexclusion: {
    component: PortExclusion,
  },
  ai: {
    component: AISettings,
  },
  communication: {
    component: CommunicationSettings,
  },
  mqtt: {
    component: MQTTSettings,
  },
  adbot: {
    component: AdvertisementBotSettings,
  },
  logs: {
    component: LogViewer,
  },
};
