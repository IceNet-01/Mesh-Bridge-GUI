export interface Radio {
  id: string;
  port: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  nodeInfo?: {
    nodeId: string;
    longName: string;
    shortName: string;
    hwModel: string;
  };
  lastSeen?: Date;
  signalStrength?: number;
  batteryLevel?: number;
  voltage?: number;
  channelUtilization?: number;
  airUtilTx?: number;
  messagesReceived: number;
  messagesSent: number;
  errors: number;
}

export interface BridgeConfig {
  enabled: boolean;
  bridges: BridgeRoute[];
  deduplicationWindow: number;
  autoReconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

export interface BridgeRoute {
  id: string;
  sourceRadios: string[];
  targetRadios: string[];
  enabled: boolean;
}

export interface Message {
  id: string;
  timestamp: Date;
  fromRadio: string;
  toRadio?: string;
  from: number;
  to: number;
  channel: number;
  portnum: number;
  payload: any;
  forwarded: boolean;
  duplicate: boolean;
}

export interface Statistics {
  uptime: number;
  totalMessagesReceived: number;
  totalMessagesForwarded: number;
  totalMessagesDuplicate: number;
  totalErrors: number;
  messageRatePerMinute: number;
  radioStats: {
    [radioId: string]: {
      received: number;
      sent: number;
      errors: number;
    };
  };
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  radioId?: string;
  data?: any;
}

export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}

declare global {
  interface Window {
    electronAPI: {
      scanRadios: () => Promise<PortInfo[]>;
      connectRadio: (port: string) => Promise<{ success: boolean; radioId?: string; error?: string }>;
      disconnectRadio: (radioId: string) => Promise<{ success: boolean }>;
      getRadios: () => Promise<Radio[]>;
      getBridgeConfig: () => Promise<BridgeConfig>;
      updateBridgeConfig: (config: Partial<BridgeConfig>) => Promise<BridgeConfig>;
      getStatistics: () => Promise<Statistics>;
      getLogs: () => Promise<LogEntry[]>;
      clearLogs: () => Promise<void>;
      onRadioStatusChange: (callback: (radios: Radio[]) => void) => void;
      onMessageReceived: (callback: (data: { radioId: string; message: Message }) => void) => void;
      onMessageForwarded: (callback: (data: { sourceRadioId: string; targetRadioId: string; message: Message }) => void) => void;
      onLogMessage: (callback: (log: LogEntry) => void) => void;
      onStatisticsUpdate: (callback: (stats: Statistics) => void) => void;
    };
  }
}
