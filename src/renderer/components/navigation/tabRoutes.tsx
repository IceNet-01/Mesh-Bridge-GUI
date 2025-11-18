import { ComponentType } from 'react';
import { Tab } from './types';
import Dashboard from '../Dashboard';
import RadioList from '../RadioList';
import NodeList from '../NodeList';
import MessageMonitor from '../MessageMonitor';
import { MapView } from '../MapView';
import TacticalView from '../TacticalView';
import SitePlanner from '../SitePlanner';
import NetworkHealth from '../NetworkHealth';
import EmergencyResponse from '../EmergencyResponse';
import BridgeConfiguration from '../BridgeConfiguration';
import { BridgeServerSettings } from '../BridgeServerSettings';
import AISettings from '../AISettings';
import CommunicationSettings from '../CommunicationSettings';
import MQTTSettings from '../MQTTSettings';
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
  configuration: {
    component: BridgeConfiguration,
  },
  server: {
    component: BridgeServerSettings,
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
  logs: {
    component: LogViewer,
  },
};
