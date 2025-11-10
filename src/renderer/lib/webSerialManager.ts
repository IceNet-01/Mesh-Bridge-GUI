import { ISerialConnection } from '@meshtastic/js';
import type { Radio, Message, Statistics, LogEntry, BridgeConfig } from '../types';

export class WebSerialRadioManager {
  private radios: Map<string, Radio> = new Map();
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
      // Request user to select a serial port
      const port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x10C4 }, // Silicon Labs
          { usbVendorId: 0x1A86 }, // CH340
        ]
      });

      this.log('info', 'Serial port selected by user');
      return [port];
    } catch (error) {
      this.log('error', 'Failed to scan for radios', undefined, error);
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

      // Initialize Meshtastic connection with Web Serial
      const connection = new ISerialConnection();

      connection.addEventListener('fromRadio', (event: any) => {
        this.handleRadioMessage(radioId, event.data);
      });

      connection.addEventListener('deviceStatus', (event: any) => {
        this.handleDeviceStatus(radioId, event.data);
      });

      // Connect using the Web Serial port
      await connection.connect({
        port: port as any,
        baudRate: 115200,
        concurrentLogOutput: false,
      });

      radio.connection = connection;
      radio.status = 'connected';
      radio.lastSeen = new Date();

      this.log('info', `Successfully connected to radio`, radioId);
      this.statistics.radioStats[radioId] = { received: 0, sent: 0, errors: 0 };
      this.emit('radio-status-change', Array.from(this.radios.values()));

      return { success: true, radioId };
    } catch (error) {
      this.log('error', `Failed to connect to radio`, undefined, error);
      return { success: false, error: (error as Error).message };
    }
  }

  async disconnectRadio(radioId: string): Promise<{ success: boolean }> {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        return { success: false };
      }

      if (radio.connection) {
        await radio.connection.disconnect();
      }

      this.radios.delete(radioId);
      delete this.statistics.radioStats[radioId];

      this.log('info', `Disconnected radio ${radio.name}`, radioId);
      this.emit('radio-status-change', Array.from(this.radios.values()));

      return { success: true };
    } catch (error) {
      this.log('error', `Failed to disconnect radio`, radioId, error);
      return { success: false };
    }
  }

  private handleRadioMessage(radioId: string, messageData: any) {
    const radio = this.radios.get(radioId);
    if (!radio) return;

    radio.messagesReceived++;
    radio.lastSeen = new Date();
    this.statistics.totalMessagesReceived++;
    this.statistics.radioStats[radioId].received++;

    this.messageTimestamps.push(new Date());

    const message: Message = {
      id: `${messageData.from}-${messageData.id || Date.now()}`,
      timestamp: new Date(),
      fromRadio: radioId,
      from: messageData.from,
      to: messageData.to,
      channel: messageData.channel || 0,
      portnum: messageData.decoded?.portnum || 0,
      payload: messageData.decoded?.payload,
      forwarded: false,
      duplicate: false,
    };

    const isDuplicate = this.isDuplicateMessage(message);
    message.duplicate = isDuplicate;

    if (isDuplicate) {
      this.statistics.totalMessagesDuplicate++;
      this.log('debug', `Duplicate message detected from ${message.from}`, radioId);
    } else {
      this.messages.set(message.id, message);

      if (this.bridgeConfig.enabled) {
        this.forwardMessage(radioId, message, messageData);
      }
    }

    this.emit('message-received', { radioId, message });
  }

  private handleDeviceStatus(radioId: string, statusData: any) {
    const radio = this.radios.get(radioId);
    if (!radio) return;

    if (statusData.batteryLevel !== undefined) {
      radio.batteryLevel = statusData.batteryLevel;
    }
    if (statusData.voltage !== undefined) {
      radio.voltage = statusData.voltage;
    }
    if (statusData.channelUtilization !== undefined) {
      radio.channelUtilization = statusData.channelUtilization;
    }
    if (statusData.airUtilTx !== undefined) {
      radio.airUtilTx = statusData.airUtilTx;
    }

    this.emit('radio-status-change', Array.from(this.radios.values()));
  }

  private forwardMessage(sourceRadioId: string, message: Message, rawData: any) {
    const targetRadios = this.getTargetRadios(sourceRadioId);

    for (const targetRadio of targetRadios) {
      if (targetRadio.status !== 'connected' || !targetRadio.connection) {
        continue;
      }

      try {
        targetRadio.connection.sendPacket(rawData);

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
    return Array.from(this.radios.values()).map(radio => ({
      ...radio,
      connection: undefined,
    }));
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
