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
  connection?: any; // Meshtastic connection object
}

export interface BridgeConfig {
  enabled: boolean;
  bridges: BridgeRoute[];
  deduplicationWindow: number; // seconds
  autoReconnect: boolean;
  reconnectDelay: number; // milliseconds
  maxReconnectAttempts: number;
}

export interface BridgeRoute {
  id: string;
  sourceRadios: string[]; // Radio IDs
  targetRadios: string[]; // Radio IDs
  enabled: boolean;
  filters?: MessageFilter[];
}

export interface MessageFilter {
  type: 'channel' | 'sender' | 'portnum';
  value: string | number;
  action: 'allow' | 'deny';
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
