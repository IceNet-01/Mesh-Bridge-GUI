import type { Radio, Message, Statistics, LogEntry, BridgeConfig, AIConfig, AIModel, AIStatus, CommunicationConfig, EmailConfig, DiscordConfig, RadioProtocol, MeshNode } from '../types';

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
  private nodes: Map<string, MeshNode> = new Map(); // Track all mesh nodes
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

      case 'radio-connecting':
        // Radio is connecting (before configuration completes)
        this.radios.set(data.radio.id, data.radio);
        this.statistics.radioStats[data.radio.id] = { received: 0, sent: 0, errors: 0 };
        this.emit('radio-status-change', Array.from(this.radios.values()));
        this.log('info', `Radio connecting: ${data.radio.id} on ${data.radio.port}...`);
        break;

      case 'radio-connected':
        // Radio fully connected (after configuration completes)
        this.radios.set(data.radio.id, data.radio);
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

      case 'radio-updated':
        // Radio information updated (nodeInfo, channels, config, stats)
        if (data.radio) {
          this.radios.set(data.radio.id, data.radio);
          this.emit('radio-status-change', Array.from(this.radios.values()));
          this.log('debug', `Radio updated: ${data.radio.id}`, 'radio-update');
        }
        break;

      case 'radio-telemetry':
        // Radio telemetry data updated
        const radio = this.radios.get(data.radioId);
        if (radio && data.telemetry) {
          // Merge telemetry data into radio object
          Object.assign(radio, data.telemetry);
          this.radios.set(data.radioId, radio);
          this.emit('radio-status-change', Array.from(this.radios.values()));
          this.log('debug', `Radio telemetry updated: ${data.radioId}`, 'telemetry');
        }
        break;

      case 'node-info':
        // Node information from mesh network
        if (data.node) {
          const node: MeshNode = {
            ...data.node,
            lastHeard: new Date(data.node.lastHeard),
            position: data.node.position ? {
              ...data.node.position,
              time: data.node.position.time ? new Date(data.node.position.time) : undefined
            } : undefined
          };

          this.nodes.set(node.nodeId, node);
          this.emit('node-update', node);
          this.log('debug', `📍 Node ${node.shortName} (${node.nodeId}) ${node.position ? 'with location' : 'no location'}`, 'node');
        }
        break;

      case 'message':
        // New message received (or sent by us)
        const message: Message = {
          id: data.message.id,
          timestamp: new Date(data.message.timestamp),
          fromRadio: data.message.radioId,
          protocol: data.message.protocol || 'meshtastic',
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
          sent: data.message.sent || false,
          rssi: data.message.rssi,
          snr: data.message.snr
        };

        this.messages.set(message.id, message);
        this.messageTimestamps.push(message.timestamp);

        // Only increment received count if not a sent message
        if (!message.sent) {
          this.statistics.totalMessagesReceived++;
        }

        if (this.statistics.radioStats[message.fromRadio]) {
          if (message.sent) {
            this.statistics.radioStats[message.fromRadio].sent++;
          } else {
            this.statistics.radioStats[message.fromRadio].received++;
          }
        }

        this.emit('message-received', { radioId: message.fromRadio, message });

        if (message.sent) {
          this.log('info', `📤 Sent: "${message.payload.text}"`);
        } else {
          this.log('info', `💬 Message from ${message.from}: "${message.payload.text}"`);
        }
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

      case 'ai-config':
        // AI configuration update
        this.emit('ai-config-update', data.config);
        break;

      case 'ai-config-changed':
        // AI configuration changed (broadcast from server)
        this.emit('ai-config-update', data.config);
        this.log('info', `AI configuration updated: ${data.config.enabled ? 'enabled' : 'disabled'}`);
        break;

      case 'ai-models':
        // List of installed AI models
        this.emit('ai-models-list', data.models);
        break;

      case 'ai-status':
        // AI service status
        this.emit('ai-status-update', data.status);
        break;

      case 'ai-pull-started':
        // Model download started
        this.log('info', `📥 Downloading model: ${data.model}...`);
        this.emit('ai-pull-started', { model: data.model });
        break;

      case 'ai-pull-progress':
        // Model download progress
        this.emit('ai-pull-progress', {
          model: data.model,
          status: data.status,
          completed: data.completed,
          total: data.total
        });
        break;

      case 'ai-pull-complete':
        // Model download complete
        this.log('info', `✅ Model downloaded: ${data.model}`);
        this.emit('ai-pull-complete', { model: data.model });
        break;

      case 'comm-config':
        // Communication configuration
        this.emit('comm-config-update', data.config);
        break;

      case 'comm-config-changed':
        // Communication configuration changed (broadcast from server)
        this.emit('comm-config-update', data.config);
        this.log('info', 'Communication configuration updated');
        break;

      case 'comm-email-updated':
        this.log('info', 'Email configuration saved');
        break;

      case 'comm-discord-updated':
        this.log('info', 'Discord configuration saved');
        break;

      case 'comm-test-result':
        // Test result for email/Discord
        this.emit('comm-test-result', {
          service: data.service,
          success: data.success,
          error: data.error
        });
        if (data.success) {
          this.log('info', `✅ ${data.service} test successful`);
        } else {
          this.log('error', `❌ ${data.service} test failed: ${data.error}`);
        }
        break;

      case 'reticulum-status':
        // Reticulum Network Stack status update
        this.emit('reticulum-status-update', data.status);
        if (data.status.running) {
          this.log('info', `🌐 Reticulum Network Stack running (Identity: ${data.status.identity?.hash?.substring(0, 16) || 'pending'}...)`);
        } else {
          this.log('warn', '🌐 Reticulum Network Stack offline');
        }
        break;

      case 'reticulum-transports-updated':
        // Reticulum transports updated (RNode devices added/removed)
        this.emit('reticulum-transports-updated', data.transports);
        this.log('info', `🌐 Reticulum transports updated: ${data.transports.length} transport(s)`);
        break;

      case 'reticulum-transport-error':
        // Reticulum transport error
        this.log('error', `🌐 Reticulum transport error on ${data.port}: ${data.error}`);
        break;

      case 'reticulum-error':
        // Reticulum general error
        this.log('error', `🌐 Reticulum error: ${data.error}`);
        break;

      case 'rnode-added-to-reticulum':
        // RNode device was detected and added to Reticulum as transport
        this.log('info', `🔷 RNode device on ${data.port} added to Reticulum as transport`);
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
  async connectRadio(portPath: string, protocol: RadioProtocol = 'meshtastic'): Promise<{ success: boolean; radioId?: string; error?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Not connected to bridge server' };
    }

    this.log('info', `Requesting radio connection to ${portPath} using ${protocol} protocol...`);

    // Set up listener BEFORE sending request to avoid race condition
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.off('radio-status-change', handler);
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

      // Send request AFTER listener is set up
      this.ws!.send(JSON.stringify({
        type: 'connect',
        port: portPath,
        protocol: protocol
      }));
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
   * Get all mesh nodes
   */
  getNodes(): MeshNode[] {
    return Array.from(this.nodes.values())
      .sort((a, b) => b.lastHeard.getTime() - a.lastHeard.getTime());
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
   * Get AI configuration
   */
  async getAIConfig(): Promise<AIConfig | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return null;
    }

    return new Promise((resolve) => {
      const handler = (config: AIConfig) => {
        this.off('ai-config-update', handler);
        resolve(config);
      };

      this.on('ai-config-update', handler);
      this.ws!.send(JSON.stringify({ type: 'ai-get-config' }));

      setTimeout(() => {
        this.off('ai-config-update', handler);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Set AI enabled/disabled
   */
  async setAIEnabled(enabled: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'ai-set-enabled',
      enabled
    }));
  }

  /**
   * List installed AI models
   */
  async listAIModels(): Promise<AIModel[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return [];
    }

    return new Promise((resolve) => {
      const handler = (models: AIModel[]) => {
        this.off('ai-models-list', handler);
        resolve(models);
      };

      this.on('ai-models-list', handler);
      this.ws!.send(JSON.stringify({ type: 'ai-list-models' }));

      setTimeout(() => {
        this.off('ai-models-list', handler);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * Set active AI model
   */
  async setAIModel(model: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'ai-set-model',
      model
    }));
  }

  /**
   * Pull/download AI model
   */
  async pullAIModel(model: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'ai-pull-model',
      model
    }));
  }

  /**
   * Check AI service status
   */
  async checkAIStatus(): Promise<AIStatus | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return null;
    }

    return new Promise((resolve) => {
      const handler = (status: AIStatus) => {
        this.off('ai-status-update', handler);
        resolve(status);
      };

      this.on('ai-status-update', handler);
      this.ws!.send(JSON.stringify({ type: 'ai-check-status' }));

      setTimeout(() => {
        this.off('ai-status-update', handler);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Get communication configuration
   */
  async getCommConfig(): Promise<CommunicationConfig | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return null;
    }

    return new Promise((resolve) => {
      const handler = (config: CommunicationConfig) => {
        this.off('comm-config-update', handler);
        resolve(config);
      };

      this.on('comm-config-update', handler);
      this.ws!.send(JSON.stringify({ type: 'comm-get-config' }));

      setTimeout(() => {
        this.off('comm-config-update', handler);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Set email configuration
   */
  async setEmailConfig(config: EmailConfig): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'comm-set-email',
      config
    }));
  }

  /**
   * Set Discord configuration
   */
  async setDiscordConfig(config: DiscordConfig): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'comm-set-discord',
      config
    }));
  }

  /**
   * Test email configuration
   */
  async testEmail(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({ type: 'comm-test-email' }));
  }

  /**
   * Test Discord configuration
   */
  async testDiscord(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({ type: 'comm-test-discord' }));
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
