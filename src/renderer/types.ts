// Radio protocol types
export type RadioProtocol = 'meshtastic' | 'reticulum' | 'rnode' | 'meshcore';

export interface Radio {
  id: string;
  port: string;
  name: string;
  protocol: RadioProtocol;
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
  // Protocol-specific metadata
  protocolMetadata?: {
    // Reticulum-specific
    destinationHash?: string;
    identityHash?: string;
    // RNode-specific
    frequency?: number;
    bandwidth?: number;
    spreadingFactor?: number;
    codingRate?: number;
    txPower?: number;
    // Mesh Core-specific
    activeProtocols?: string[];
    routingTable?: any;
  };
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
  protocol: RadioProtocol;
  from: number;
  to: number;
  channel: number;
  portnum: number;
  payload: any;
  forwarded: boolean;
  duplicate: boolean;
  rssi?: number;
  snr?: number;
  hopLimit?: number;
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
  id?: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: string;
  radioId?: string;
  data?: any;
  error?: string;
}

export interface AIConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  maxTokens: number;
  maxResponseLength: number;
  timeout: number;
  rateLimit: number;
  systemPrompt: string;
}

export interface AIModel {
  name: string;
  size: number;
  digest?: string;
  modified_at?: string;
}

export interface AIStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface AIModelPullProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
}

export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from: string;
  to: string;
  subjectPrefix: string;
}

export interface DiscordConfig {
  enabled: boolean;
  webhook: string;
  username: string;
  avatarUrl: string;
}

export interface CommunicationConfig {
  email: EmailConfig;
  discord: DiscordConfig;
}

// Web Serial API Type Extensions
declare global {
  interface Navigator {
    serial: Serial;
  }

  interface Serial extends EventTarget {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }

  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }
}
