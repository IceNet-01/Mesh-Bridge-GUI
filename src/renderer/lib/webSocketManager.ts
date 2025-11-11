import type { Radio, Message, Statistics, LogEntry, BridgeConfig } from '../types';

/**
 * WebSocketRadioManager
 *
 * Connects to the local Node.js bridge server (port 8080) which handles
 * all Meshtastic serial communication using the official @meshtastic libraries.
 *
 * This replaces the manual Web Serial API implementation with a clean
 * WebSocket interface to the bridge server.
 */
export class WebSocketRadioManager {
  private ws: WebSocket | null = null;
  private radios: Map<string, Radio> = new Map();
  private messages: Map<string, Message> = new Map();
  private logs: LogEntry[] = [];
  private statistics: Statistics;
  private bridgeConfig: BridgeConfig;
  private startTime: Date;
  private messageTimestamps: Date[] = [];
  private listeners: Map<string, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private bridgeUrl: string;

  constructor(bridgeUrl: string = 'ws://localhost:8080') {
    this.bridgeUrl = bridgeUrl;
    this.startTime = new Date();
    this.statistics = {
      uptime: 0,
      totalMessagesReceived: 0,
      totalMessagesForwarded: 0,
      totalMessagesDuplicate: 0,
      totalErrors: 0,
      messageRatePerMinute: 0,
      radioStats: {},
    };

    this.bridgeConfig = {
      enabled: true,
      bridges: [],
      deduplicationWindow: 60,
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
    };

    // Update statistics every second
    setInterval(() => this.updateStatistics(), 1000);
  }

  // Event emitter pattern
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, context?: string, error?: any) {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      level,
      message: context ? `[${context}] ${message}` : message,
      context,
      error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
    };

    this.logs.unshift(entry);
    if (this.logs.length > 1000) {
      this.logs.pop();
    }

    this.emit('logs-update', this.logs);

    // Also log to console
    const consoleMsg = `[${level.toUpperCase()}] ${entry.message}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg, error || '');
        break;
      case 'warn':
        console.warn(consoleMsg);
        break;
      case 'debug':
        console.debug(consoleMsg);
        break;
      default:
        console.log(consoleMsg);
    }
  }

  /**
   * Connect to the bridge server
   */
  async connectToBridge(): Promise<{ success: boolean; error?: string }> {
    try {
      this.log('info', `Connecting to bridge server at ${this.bridgeUrl}...`);

      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.bridgeUrl);

        this.ws.onopen = () => {
          this.log('info', '✅ Connected to bridge server');
          this.reconnectAttempts = 0;
          resolve({ success: true });
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleBridgeMessage(data);
          } catch (error) {
            this.log('error', 'Failed to parse bridge message', undefined, error);
          }
        };

        this.ws.onerror = (error) => {
          this.log('error', 'WebSocket error', undefined, error);
          resolve({ success: false, error: 'WebSocket connection error' });
        };

        this.ws.onclose = () => {
          this.log('warn', 'Bridge server connection closed');
          this.emit('bridge-disconnected');

          // Attempt reconnect if configured
          if (this.bridgeConfig.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            this.log('info', `Reconnecting to bridge in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
              this.connectToBridge();
            }, delay);
          }
        };

        // Set timeout for connection
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject({ success: false, error: 'Connection timeout' });
          }
        }, 10000);
      });
    } catch (error) {
      this.log('error', 'Failed to connect to bridge', undefined, error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Handle messages from bridge server
   */
  private handleBridgeMessage(data: any) {
    switch (data.type) {
      case 'history':
        // Load message history
        data.messages.forEach((msg: Message) => {
          this.messages.set(msg.id, msg);
        });
        this.emit('messages-update', Array.from(this.messages.values()));
        this.log('info', `Loaded ${data.messages.length} messages from history`);
        break;

      case 'radios':
        // Update radios list
        data.radios.forEach((radio: Radio) => {
          this.radios.set(radio.id, radio);
        });
        this.emit('radio-status-change', Array.from(this.radios.values()));
        break;

      case 'radio-connected':
        // New radio connected
        this.radios.set(data.radio.id, data.radio);
        this.statistics.radioStats[data.radio.id] = { received: 0, sent: 0, errors: 0 };
        this.emit('radio-status-change', Array.from(this.radios.values()));
        this.log('info', `Radio connected: ${data.radio.id} on ${data.radio.port}`);
        break;

      case 'radio-disconnected':
        // Radio disconnected
        this.radios.delete(data.radioId);
        delete this.statistics.radioStats[data.radioId];
        this.emit('radio-status-change', Array.from(this.radios.values()));
        this.log('warn', `Radio disconnected: ${data.radioId}`);
        break;

      case 'message':
        // New message received
        const message: Message = {
          id: data.message.id,
          timestamp: new Date(data.message.timestamp),
          fromRadio: data.message.radioId,
          from: data.message.from,
          to: data.message.to,
          channel: data.message.channel,
          portnum: data.message.portnum || 1,
          payload: {
            text: data.message.text,
            raw: []
          },
          forwarded: false,
          duplicate: false,
          rssi: data.message.rssi,
          snr: data.message.snr
        };

        this.messages.set(message.id, message);
        this.messageTimestamps.push(message.timestamp);
        this.statistics.totalMessagesReceived++;

        if (this.statistics.radioStats[message.fromRadio]) {
          this.statistics.radioStats[message.fromRadio].received++;
        }

        this.emit('message-received', { radioId: message.fromRadio, message });
        this.log('info', `💬 Message from ${message.from}: "${message.payload.text}"`);
        break;

      case 'ports-list':
        // List of available serial ports
        this.emit('ports-available', data.ports);
        break;

      case 'send-success':
        this.log('info', `✅ Message sent successfully via ${data.radioId}`);
        if (this.statistics.radioStats[data.radioId]) {
          this.statistics.radioStats[data.radioId].sent++;
        }
        this.statistics.totalMessagesForwarded++;
        break;

      case 'error':
        this.log('error', `Bridge error: ${data.error}`);
        this.statistics.totalErrors++;
        break;

      case 'pong':
        // Ping response
        break;

      default:
        this.log('debug', `Unknown message type: ${data.type}`);
    }
  }

  /**
   * Request list of available serial ports from bridge
   */
  async scanForRadios(): Promise<any[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return [];
    }

    return new Promise((resolve) => {
      const handler = (ports: any[]) => {
        this.off('ports-available', handler);
        resolve(ports);
      };

      this.on('ports-available', handler);

      this.ws!.send(JSON.stringify({ type: 'list-ports' }));

      // Timeout after 5 seconds
      setTimeout(() => {
        this.off('ports-available', handler);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * Connect to a radio via bridge server
   */
  async connectRadio(portPath: string): Promise<{ success: boolean; radioId?: string; error?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Not connected to bridge server' };
    }

    this.log('info', `Requesting radio connection to ${portPath}...`);
    this.ws.send(JSON.stringify({
      type: 'connect',
      port: portPath
    }));

    // Wait for connection confirmation
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Connection timeout' });
      }, 30000);

      const handler = (radios: Radio[]) => {
        const newRadio = radios.find(r => r.port === portPath);
        if (newRadio) {
          clearTimeout(timeout);
          this.off('radio-status-change', handler);
          resolve({ success: true, radioId: newRadio.id });
        }
      };

      this.on('radio-status-change', handler);
    });
  }

  /**
   * Disconnect a radio
   */
  async disconnectRadio(radioId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'disconnect',
      radioId
    }));
  }

  /**
   * Send text message via a radio
   */
  async sendText(radioId: string, text: string, channel: number = 0): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to bridge server');
    }

    this.ws.send(JSON.stringify({
      type: 'send-text',
      radioId,
      text,
      channel
    }));
  }

  /**
   * Get all radios
   */
  getRadios(): Radio[] {
    return Array.from(this.radios.values());
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return Array.from(this.messages.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get logs
   */
  getLogs(): LogEntry[] {
    return this.logs;
  }

  /**
   * Get statistics
   */
  getStatistics(): Statistics {
    return this.statistics;
  }

  /**
   * Get bridge configuration
   */
  getBridgeConfig(): BridgeConfig {
    return this.bridgeConfig;
  }

  /**
   * Update bridge configuration
   */
  updateBridgeConfig(config: Partial<BridgeConfig>): void {
    this.bridgeConfig = { ...this.bridgeConfig, ...config };
    this.emit('bridge-config-change', this.bridgeConfig);
  }

  private updateStatistics() {
    this.statistics.uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    const oneMinuteAgo = new Date(Date.now() - 60000);
    this.messageTimestamps = this.messageTimestamps.filter(t => t > oneMinuteAgo);
    this.statistics.messageRatePerMinute = this.messageTimestamps.length;

    this.emit('statistics-update', this.statistics);
  }

  /**
   * Close connection to bridge
   */
  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
