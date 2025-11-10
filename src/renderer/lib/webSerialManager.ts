import type { Radio, Message, Statistics, LogEntry, BridgeConfig } from '../types';

interface SerialConnection {
  port: SerialPort;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  writer: WritableStreamDefaultWriter<Uint8Array> | null;
}

export class WebSerialRadioManager {
  private radios: Map<string, Radio> = new Map();
  private connections: Map<string, SerialConnection> = new Map();
  private messages: Map<string, Message> = new Map();
  private logs: LogEntry[] = [];
  private statistics: Statistics;
  private bridgeConfig: BridgeConfig;
  private startTime: Date;
  private messageTimestamps: Date[] = [];
  private listeners: Map<string, Set<Function>> = new Map();

  constructor() {
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

  async scanForRadios(): Promise<SerialPort[]> {
    try {
      // Request user to select a serial port (no filters - allow any device)
      const port = await navigator.serial.requestPort();

      this.log('info', 'Serial port selected by user');
      return [port];
    } catch (error) {
      // User likely canceled the dialog or no permission
      if ((error as Error).name === 'NotFoundError') {
        this.log('warn', 'No serial port selected - user canceled');
      } else {
        this.log('error', 'Failed to scan for radios', undefined, error);
      }
      return [];
    }
  }

  async connectRadio(port: SerialPort): Promise<{ success: boolean; radioId?: string; error?: string }> {
    try {
      const radioId = `radio-${Date.now()}`;
      const portInfo = port.getInfo();

      this.log('info', `Attempting to connect to radio`);

      const radio: Radio = {
        id: radioId,
        port: `USB:${portInfo.usbVendorId}:${portInfo.usbProductId}`,
        name: `Radio ${this.radios.size + 1}`,
        status: 'connecting',
        messagesReceived: 0,
        messagesSent: 0,
        errors: 0,
      };

      this.radios.set(radioId, radio);
      this.emit('radio-status-change', Array.from(this.radios.values()));

      // Open the serial port
      await port.open({ baudRate: 115200 });

      const reader = port.readable?.getReader() || null;
      const writer = port.writable?.getWriter() || null;

      this.connections.set(radioId, { port, reader, writer });

      // Start reading from the port
      if (reader) {
        this.startReading(radioId, reader);
      }

      radio.status = 'connected';
      radio.lastSeen = new Date();

      this.log('info', `Successfully connected to radio`, radioId);
      this.statistics.radioStats[radioId] = { received: 0, sent: 0, errors: 0 };
      this.emit('radio-status-change', Array.from(this.radios.values()));

      // TODO: Request node info from the device via serial commands
      // For Meshtastic, we would send a request for device info here
      // and populate radio.nodeInfo when we receive the response

      return { success: true, radioId };
    } catch (error) {
      this.log('error', `Failed to connect to radio`, undefined, error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async startReading(radioId: string, reader: ReadableStreamDefaultReader<Uint8Array>) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.handleIncomingData(radioId, value);
        }
      }
    } catch (error) {
      this.log('error', `Error reading from radio ${radioId}`, radioId, error);
      const radio = this.radios.get(radioId);
      if (radio) {
        radio.status = 'error';
        radio.errors++;
        this.emit('radio-status-change', Array.from(this.radios.values()));
      }
    } finally {
      reader.releaseLock();
    }
  }

  private handleIncomingData(radioId: string, data: Uint8Array) {
    const radio = this.radios.get(radioId);
    if (!radio) return;

    // Update last seen timestamp
    radio.lastSeen = new Date();

    // Log raw data for debugging (first 32 bytes)
    const preview = Array.from(data.slice(0, 32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    this.log('debug', `Received ${data.length} bytes: ${preview}${data.length > 32 ? '...' : ''}`, radioId);

    // TODO: Implement Meshtastic protocol parsing here
    // The Meshtastic protocol uses protobuf messages with a specific framing:
    // 1. Magic byte (0x94 or 0x95)
    // 2. Packet length (2 bytes)
    // 3. Protobuf encoded message
    //
    // For now, we just acknowledge the data without creating fake messages.
    // Real implementation would:
    // - Parse the frame header
    // - Decode the protobuf message
    // - Extract sender, recipient, channel, payload
    // - Create Message objects only for actual mesh messages
    // - Forward to other radios based on bridge configuration

    // Example: Check for potential Meshtastic packet
    if (data.length > 0 && (data[0] === 0x94 || data[0] === 0x95)) {
      this.log('debug', 'Potential Meshtastic packet detected (magic byte present)', radioId);
      // In a real implementation, we would parse this packet here
    }
  }

  async disconnectRadio(radioId: string): Promise<{ success: boolean }> {
    try {
      const connection = this.connections.get(radioId);
      if (connection) {
        if (connection.reader) {
          await connection.reader.cancel();
        }
        if (connection.writer) {
          connection.writer.releaseLock();
        }
        await connection.port.close();
        this.connections.delete(radioId);
      }

      this.radios.delete(radioId);
      delete this.statistics.radioStats[radioId];

      const radio = this.radios.get(radioId);
      this.log('info', `Disconnected radio ${radio?.name || radioId}`, radioId);
      this.emit('radio-status-change', Array.from(this.radios.values()));

      return { success: true };
    } catch (error) {
      this.log('error', `Failed to disconnect radio`, radioId, error);
      return { success: false };
    }
  }

  // Reserved for future use when Meshtastic protocol parsing is implemented
  // @ts-expect-error - Function reserved for future Meshtastic protocol implementation
  private async forwardMessage(sourceRadioId: string, message: Message, rawData: Uint8Array) {
    const targetRadios = this.getTargetRadios(sourceRadioId);

    for (const targetRadio of targetRadios) {
      if (targetRadio.status !== 'connected') {
        continue;
      }

      const connection = this.connections.get(targetRadio.id);
      if (!connection || !connection.writer) {
        continue;
      }

      try {
        await connection.writer.write(rawData);

        targetRadio.messagesSent++;
        this.statistics.radioStats[targetRadio.id].sent++;
        this.statistics.totalMessagesForwarded++;

        message.forwarded = true;
        message.toRadio = targetRadio.id;

        this.log('debug', `Forwarded message from ${sourceRadioId} to ${targetRadio.id}`);
        this.emit('message-forwarded', { sourceRadioId, targetRadioId: targetRadio.id, message });
      } catch (error) {
        targetRadio.errors++;
        this.statistics.radioStats[targetRadio.id].errors++;
        this.statistics.totalErrors++;
        this.log('error', `Failed to forward message to ${targetRadio.id}`, targetRadio.id, error);
      }
    }
  }

  private getTargetRadios(sourceRadioId: string): Radio[] {
    const targetRadios: Radio[] = [];

    for (const bridge of this.bridgeConfig.bridges) {
      if (!bridge.enabled) continue;

      if (bridge.sourceRadios.includes(sourceRadioId)) {
        for (const targetId of bridge.targetRadios) {
          const radio = this.radios.get(targetId);
          if (radio && radio.id !== sourceRadioId) {
            targetRadios.push(radio);
          }
        }
      }
    }

    return targetRadios;
  }

  // Reserved for future use when Meshtastic protocol parsing is implemented
  // @ts-expect-error - Function reserved for future Meshtastic protocol implementation
  private isDuplicateMessage(message: Message): boolean {
    const existing = this.messages.get(message.id);
    if (!existing) return false;

    const timeDiff = message.timestamp.getTime() - existing.timestamp.getTime();
    return timeDiff < this.bridgeConfig.deduplicationWindow * 1000;
  }

  private updateStatistics() {
    this.statistics.uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    const oneMinuteAgo = new Date(Date.now() - 60000);
    this.messageTimestamps = this.messageTimestamps.filter(t => t > oneMinuteAgo);
    this.statistics.messageRatePerMinute = this.messageTimestamps.length;

    const cutoff = Date.now() - this.bridgeConfig.deduplicationWindow * 1000;
    for (const [id, msg] of this.messages.entries()) {
      if (msg.timestamp.getTime() < cutoff) {
        this.messages.delete(id);
      }
    }

    this.emit('statistics-update', this.statistics);
  }

  private log(level: LogEntry['level'], message: string, radioId?: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      radioId,
      data,
    };

    this.logs.push(entry);

    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`, data);
    this.emit('log-message', entry);
  }

  // Public API
  getRadios(): Radio[] {
    return Array.from(this.radios.values());
  }

  getBridgeConfig(): BridgeConfig {
    return this.bridgeConfig;
  }

  updateBridgeConfig(config: Partial<BridgeConfig>): BridgeConfig {
    this.bridgeConfig = { ...this.bridgeConfig, ...config };
    this.log('info', 'Bridge configuration updated');
    return this.bridgeConfig;
  }

  getStatistics(): Statistics {
    return this.statistics;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
    this.log('info', 'Logs cleared');
  }
}
