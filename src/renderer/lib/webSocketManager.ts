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
  private consoleLines: Array<{ timestamp: string; level: string; message: string }> = []; // Raw console output
  private statistics: Statistics;
  private bridgeConfig: BridgeConfig;
  private startTime: Date;
  private messageTimestamps: Date[] = [];
  private listeners: Map<string, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private bridgeUrl: string;
  private readonly MESSAGE_STORAGE_KEY = 'mesh-bridge-messages';
  private readonly NODE_STORAGE_KEY = 'mesh-bridge-nodes';
  private readonly MESSAGE_RETENTION_DAYS = 7;
  private readonly NODE_RETENTION_DAYS = 180; // Keep node database for 6 months

  constructor(bridgeUrl?: string) {
    // Use provided URL, or check localStorage, or fall back to smart default
    this.bridgeUrl = bridgeUrl || this.getBridgeUrl();
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

    // Load persisted messages and nodes from localStorage
    this.loadMessagesFromStorage();
    this.loadNodesFromStorage();

    // Update statistics every second
    setInterval(() => this.updateStatistics(), 1000);

    // Clean up old messages and nodes every hour
    setInterval(() => this.cleanupOldMessages(), 60 * 60 * 1000);
    setInterval(() => this.cleanupOldNodes(), 60 * 60 * 1000);
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
   * Get bridge URL from localStorage or determine smart default
   */
  private getBridgeUrl(): string {
    // Check localStorage first
    const stored = localStorage.getItem('bridge-server-url');
    if (stored) {
      console.log(`[WebSocketManager] Using configured bridge URL: ${stored}`);
      return stored;
    }

    // Smart default: If accessing via LAN IP, use that IP. Otherwise use localhost.
    const hostname = window.location.hostname;

    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
      const url = `ws://${hostname}:8080`;
      console.log(`[WebSocketManager] Auto-detected bridge URL: ${url}`);
      return url;
    }

    // Default to localhost
    console.log(`[WebSocketManager] Using default bridge URL: ws://localhost:8080`);
    return 'ws://localhost:8080';
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

      case 'console-history':
        // Load console output history from bridge
        this.consoleLines = data.lines || [];
        this.emit('console-update', this.consoleLines);
        break;

      case 'console-output':
        // New console output line from bridge
        if (data.line) {
          this.consoleLines.push(data.line);
          // Keep last 2000 lines
          if (this.consoleLines.length > 2000) {
            this.consoleLines = this.consoleLines.slice(-2000);
          }
          this.emit('console-update', this.consoleLines);
        }
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
        console.log('[WebSocket] 📻 Radio connecting:', data.radio.id, 'port:', data.radio.port);
        console.log('[WebSocket] Current radios before adding:', Array.from(this.radios.keys()));
        this.radios.set(data.radio.id, data.radio);
        this.statistics.radioStats[data.radio.id] = { received: 0, sent: 0, errors: 0 };
        console.log('[WebSocket] Current radios after adding:', Array.from(this.radios.keys()));
        this.emit('radio-status-change', Array.from(this.radios.values()));
        this.log('info', `Radio connecting: ${data.radio.id} on ${data.radio.port}...`);
        break;

      case 'radio-connected':
        // Radio fully connected (after configuration completes)
        console.log('[WebSocket] ✅ Radio connected:', data.radio.id, 'port:', data.radio.port);
        console.log('[WebSocket] Current radios before setting:', Array.from(this.radios.keys()));
        this.radios.set(data.radio.id, data.radio);
        console.log('[WebSocket] Current radios after setting:', Array.from(this.radios.keys()));
        this.emit('radio-status-change', Array.from(this.radios.values()));
        this.log('info', `Radio connected: ${data.radio.id} on ${data.radio.port}`);
        break;

      case 'radio-disconnected':
        // Radio disconnected
        console.log('[WebSocket] 🔌 Radio disconnected:', data.radioId);
        console.log('[WebSocket] Current radios before deleting:', Array.from(this.radios.keys()));
        this.radios.delete(data.radioId);
        delete this.statistics.radioStats[data.radioId];
        console.log('[WebSocket] Current radios after deleting:', Array.from(this.radios.keys()));
        this.emit('radio-status-change', Array.from(this.radios.values()));
        this.log('warn', `Radio disconnected: ${data.radioId}`);
        break;

      case 'radio-updated':
        // Radio information updated (nodeInfo, channels, config, stats)
        if (data.radio) {
          console.log('[WebSocket] 🔄 Radio updated:', {
            id: data.radio.id,
            name: data.radio.name,
            hasNodeInfo: !!data.radio.nodeInfo,
            nodeInfo: data.radio.nodeInfo,
            hasProtocolMetadata: !!data.radio.protocolMetadata,
            protocolMetadata: data.radio.protocolMetadata
          });
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
          // DEDUPLICATION: Find existing node by numeric 'num' field (not nodeId string)
          // This prevents duplicates when same node has different ID formats (hex vs decimal)
          let existingNode = this.nodes.get(data.node.nodeId);
          let oldNodeId: string | null = null;

          if (!existingNode && data.node.num) {
            // Check if node with same 'num' exists under different nodeId
            for (const [key, node] of this.nodes.entries()) {
              if (node.num === data.node.num) {
                existingNode = node;
                oldNodeId = key; // Track old key for cleanup
                console.log(`[WebSocket] Found duplicate node: ${key} → ${data.node.nodeId} (num: ${data.node.num})`);
                break;
              }
            }
          }

          const node: MeshNode = {
            // Start with existing node data (if any)
            ...existingNode,
            // Overlay with new data
            ...data.node,
            lastHeard: new Date(data.node.lastHeard),
            // PRESERVE USER IDENTIFICATION: Don't overwrite valid names with "Unknown"
            longName: (data.node.longName && data.node.longName !== 'Unknown')
              ? data.node.longName
              : (existingNode?.longName || data.node.longName),
            shortName: (data.node.shortName && data.node.shortName !== '????')
              ? data.node.shortName
              : (existingNode?.shortName || data.node.shortName),
            hwModel: (data.node.hwModel && data.node.hwModel !== 'Unknown')
              ? data.node.hwModel
              : (existingNode?.hwModel || data.node.hwModel),
            position: data.node.position ? {
              ...data.node.position,
              time: data.node.position.time ? new Date(data.node.position.time) : undefined
            } : existingNode?.position, // Keep existing position if new one is undefined
            // Explicitly preserve environmental data - only update if new value is defined
            temperature: data.node.temperature !== undefined && data.node.temperature !== null
              ? data.node.temperature
              : existingNode?.temperature,
            humidity: data.node.humidity !== undefined && data.node.humidity !== null
              ? data.node.humidity
              : existingNode?.humidity,
            pressure: data.node.pressure !== undefined && data.node.pressure !== null
              ? data.node.pressure
              : existingNode?.pressure,
          };

          // Remove old duplicate entry if nodeId format changed
          if (oldNodeId && oldNodeId !== data.node.nodeId) {
            this.nodes.delete(oldNodeId);
            console.log(`[WebSocket] Removed duplicate node entry: ${oldNodeId}`);
          }

          this.nodes.set(node.nodeId, node);
          this.saveNodesToStorage(); // Persist to localStorage
          this.emit('node-update', node);

          // Enhanced logging for environmental data
          if (node.temperature !== undefined || node.humidity !== undefined || node.pressure !== undefined) {
            const envData = [];
            if (node.temperature !== undefined) envData.push(`temp: ${node.temperature.toFixed(1)}°C`);
            if (node.humidity !== undefined) envData.push(`humidity: ${node.humidity.toFixed(0)}%`);
            if (node.pressure !== undefined) envData.push(`pressure: ${node.pressure.toFixed(1)}hPa`);
            this.log('info', `🌡️ Node ${node.shortName} (${node.nodeId}) environmental: ${envData.join(', ')}`, 'node');
          }

          // Enhanced logging to help debug map issues
          if (node.position) {
            this.log('info', `📍 Node ${node.shortName} (${node.nodeId}) @ ${node.position.latitude.toFixed(6)}, ${node.position.longitude.toFixed(6)}`, 'node');
            console.log('[WebSocketManager] Node with position:', {
              nodeId: node.nodeId,
              shortName: node.shortName,
              lat: node.position.latitude,
              lon: node.position.longitude,
              totalNodes: this.nodes.size,
              nodesWithPosition: Array.from(this.nodes.values()).filter(n => n.position).length
            });
          } else {
            this.log('debug', `📍 Node ${node.shortName} (${node.nodeId}) no location`, 'node');
          }
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
        this.saveMessagesToStorage(); // Persist to localStorage
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
        // Note: totalMessagesForwarded is now incremented by 'message-forwarded' event
        break;

      case 'message-forwarded':
        // Message successfully forwarded by bridge to other radios
        this.log('debug', `🔁 Message forwarded (count: ${data.count})`, 'forward');
        this.statistics.totalMessagesForwarded += (data.count || 1);
        break;

      case 'message-duplicate':
        // Duplicate message detected by bridge
        this.log('debug', `🔁 Duplicate message detected: ${data.messageId}`, 'duplicate');
        this.statistics.totalMessagesDuplicate++;
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

      case 'mqtt-config':
        // MQTT configuration
        this.emit('mqtt-config-update', data.config);
        break;

      case 'mqtt-config-changed':
        // MQTT configuration changed (broadcast from server)
        this.emit('mqtt-config-changed', data.config);
        this.log('info', 'MQTT configuration updated');
        break;

      case 'mqtt-config-updated':
        this.log('info', data.success ? 'MQTT configuration saved' : `MQTT config error: ${data.error}`);
        break;

      case 'mqtt-test-result':
        // Test result for MQTT
        if (data.success) {
          this.log('info', '✅ MQTT test successful');
        } else {
          this.log('error', `❌ MQTT test failed: ${data.error}`);
        }
        break;

      case 'mqtt-status':
        // MQTT connection status
        this.log('info', `MQTT ${data.connected ? 'connected' : 'disconnected'}`);
        break;

      case 'mqtt-error':
        // MQTT error
        this.log('error', `MQTT error: ${data.error}`);
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
   * Delete a specific node from the database
   */
  deleteNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.saveNodesToStorage();
    this.log('info', `🗑️ Deleted node: ${nodeId}`);
  }

  /**
   * Clear all nodes from the database
   */
  clearAllNodes(): void {
    const count = this.nodes.size;
    this.nodes.clear();
    this.saveNodesToStorage();
    this.log('info', `🗑️ Cleared all ${count} nodes from database`);
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
   * Load messages from localStorage
   */
  private loadMessagesFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.MESSAGE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.forEach((msg: any) => {
          // Restore Date objects from ISO strings
          this.messages.set(msg.id, {
            ...msg,
            timestamp: new Date(msg.timestamp)
          });
        });
        this.log('info', `📦 Loaded ${this.messages.size} messages from storage`);
      }
    } catch (error) {
      this.log('error', 'Failed to load messages from storage', undefined, error);
    }
  }

  /**
   * Save messages to localStorage
   */
  private saveMessagesToStorage(): void {
    try {
      const messages = Array.from(this.messages.values());
      localStorage.setItem(this.MESSAGE_STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      this.log('error', 'Failed to save messages to storage', undefined, error);
    }
  }

  /**
   * Clean up old messages (older than MESSAGE_RETENTION_DAYS)
   */
  private cleanupOldMessages(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.MESSAGE_RETENTION_DAYS);

    let removedCount = 0;
    for (const [id, message] of this.messages.entries()) {
      if (message.timestamp < cutoffDate) {
        this.messages.delete(id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.log('info', `🗑️ Cleaned up ${removedCount} old messages (older than ${this.MESSAGE_RETENTION_DAYS} days)`);
      this.saveMessagesToStorage();
    }
  }

  /**
   * Load nodes from localStorage
   */
  private loadNodesFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.NODE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.forEach((node: any) => {
          // Restore Date objects from ISO strings
          this.nodes.set(node.nodeId, {
            ...node,
            lastHeard: new Date(node.lastHeard),
            position: node.position ? {
              ...node.position,
              time: node.position.time ? new Date(node.position.time) : undefined
            } : undefined
          });
        });
        this.log('info', `📦 Loaded ${this.nodes.size} nodes from storage (${Array.from(this.nodes.values()).filter(n => n.position).length} with positions)`);
      }
    } catch (error) {
      this.log('error', 'Failed to load nodes from storage', undefined, error);
    }
  }

  /**
   * Save nodes to localStorage
   */
  private saveNodesToStorage(): void {
    try {
      const nodes = Array.from(this.nodes.values());
      localStorage.setItem(this.NODE_STORAGE_KEY, JSON.stringify(nodes));
    } catch (error) {
      this.log('error', 'Failed to save nodes to storage', undefined, error);
    }
  }

  /**
   * Clean up old nodes (older than NODE_RETENTION_DAYS)
   */
  private cleanupOldNodes(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.NODE_RETENTION_DAYS);

    let removedCount = 0;
    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.lastHeard < cutoffDate) {
        this.nodes.delete(nodeId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.log('info', `🗑️ Cleaned up ${removedCount} old nodes (older than ${this.NODE_RETENTION_DAYS} days)`);
      this.saveNodesToStorage();
    }
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
   * Get MQTT configuration
   */
  async getMQTTConfig(): Promise<any | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return null;
    }

    return new Promise((resolve) => {
      const handler = (config: any) => {
        this.off('mqtt-config-update', handler);
        resolve(config);
      };

      this.on('mqtt-config-update', handler);
      this.ws!.send(JSON.stringify({ type: 'mqtt-get-config' }));

      setTimeout(() => {
        this.off('mqtt-config-update', handler);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Set MQTT configuration
   */
  async setMQTTConfig(config: any): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'mqtt-set-config',
      config
    }));
  }

  /**
   * Enable/disable MQTT
   */
  async setMQTTEnabled(enabled: boolean): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'mqtt-enable',
      enabled
    }));
  }

  /**
   * Test MQTT connection
   */
  async testMQTT(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('error', 'Not connected to bridge server');
      return;
    }

    this.ws.send(JSON.stringify({ type: 'mqtt-test' }));
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
