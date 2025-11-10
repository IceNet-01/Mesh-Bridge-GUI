import { BrowserWindow } from 'electron';
import { SerialPort } from 'serialport';
import { ISerialConnection } from '@meshtastic/js';
import { Radio, BridgeConfig, Message, Statistics, LogEntry, PortInfo, BridgeRoute } from './types';

export class RadioManager {
  private radios: Map<string, Radio> = new Map();
  private messages: Map<string, Message> = new Map(); // For deduplication
  private logs: LogEntry[] = [];
  private statistics: Statistics;
  private bridgeConfig: BridgeConfig;
  private startTime: Date;
  private messageTimestamps: Date[] = [];
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private mainWindow: BrowserWindow | null) {
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
      deduplicationWindow: 60, // 60 seconds
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
    };

    // Update statistics every second
    setInterval(() => this.updateStatistics(), 1000);
  }

  async scanForRadios(): Promise<PortInfo[]> {
    try {
      const ports = await SerialPort.list();
      this.log('info', `Found ${ports.length} serial ports`);

      // Filter for likely Meshtastic devices
      const meshtasticPorts = ports.filter(port => {
        const manufacturer = port.manufacturer?.toLowerCase() || '';
        const pnpId = port.pnpId?.toLowerCase() || '';
        return manufacturer.includes('silicon labs') ||
               manufacturer.includes('cp210') ||
               manufacturer.includes('ch340') ||
               pnpId.includes('usb');
      });

      this.log('info', `Found ${meshtasticPorts.length} potential Meshtastic devices`);
      return meshtasticPorts;
    } catch (error) {
      this.log('error', 'Failed to scan for radios', undefined, error);
      return [];
    }
  }

  async connectRadio(port: string): Promise<{ success: boolean; radioId?: string; error?: string }> {
    try {
      this.log('info', `Attempting to connect to radio on ${port}`);

      const radioId = `radio-${Date.now()}`;
      const radio: Radio = {
        id: radioId,
        port,
        name: `Radio ${port}`,
        status: 'connecting',
        messagesReceived: 0,
        messagesSent: 0,
        errors: 0,
      };

      this.radios.set(radioId, radio);
      this.notifyStatusChange();

      // Initialize Meshtastic connection
      const connection = new ISerialConnection();

      connection.addEventListener('fromRadio', (event: any) => {
        this.handleRadioMessage(radioId, event.data);
      });

      connection.addEventListener('deviceStatus', (event: any) => {
        this.handleDeviceStatus(radioId, event.data);
      });

      await connection.connect({
        port,
        baudRate: 115200,
        concurrentLogOutput: false,
      });

      radio.connection = connection;
      radio.status = 'connected';
      radio.lastSeen = new Date();

      this.log('info', `Successfully connected to radio on ${port}`, radioId);
      this.statistics.radioStats[radioId] = { received: 0, sent: 0, errors: 0 };
      this.notifyStatusChange();

      return { success: true, radioId };
    } catch (error) {
      this.log('error', `Failed to connect to radio on ${port}`, undefined, error);
      return { success: false, error: (error as Error).message };
    }
  }

  async disconnectRadio(radioId: string): Promise<{ success: boolean }> {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        return { success: false };
      }

      // Clear reconnect timer if any
      const timer = this.reconnectTimers.get(radioId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(radioId);
      }

      if (radio.connection) {
        await radio.connection.disconnect();
      }

      this.radios.delete(radioId);
      delete this.statistics.radioStats[radioId];

      this.log('info', `Disconnected radio ${radio.name}`, radioId);
      this.notifyStatusChange();

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

    // Track message rate
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

    // Check for duplicates
    const isDuplicate = this.isDuplicateMessage(message);
    message.duplicate = isDuplicate;

    if (isDuplicate) {
      this.statistics.totalMessagesDuplicate++;
      this.log('debug', `Duplicate message detected from ${message.from}`, radioId);
    } else {
      // Store for deduplication
      this.messages.set(message.id, message);

      // Forward message if bridging is enabled
      if (this.bridgeConfig.enabled) {
        this.forwardMessage(radioId, message, messageData);
      }
    }

    // Notify renderer
    this.send('message-received', { radioId, message });
  }

  private handleDeviceStatus(radioId: string, statusData: any) {
    const radio = this.radios.get(radioId);
    if (!radio) return;

    // Update radio info
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

    this.notifyStatusChange();
  }

  private forwardMessage(sourceRadioId: string, message: Message, rawData: any) {
    const targetRadios = this.getTargetRadios(sourceRadioId);

    for (const targetRadio of targetRadios) {
      if (targetRadio.status !== 'connected' || !targetRadio.connection) {
        continue;
      }

      try {
        // Forward the message
        targetRadio.connection.sendPacket(rawData);

        targetRadio.messagesSent++;
        this.statistics.radioStats[targetRadio.id].sent++;
        this.statistics.totalMessagesForwarded++;

        message.forwarded = true;
        message.toRadio = targetRadio.id;

        this.log('debug', `Forwarded message from ${sourceRadioId} to ${targetRadio.id}`);
        this.send('message-forwarded', { sourceRadioId, targetRadioId: targetRadio.id, message });
      } catch (error) {
        targetRadio.errors++;
        this.statistics.radioStats[targetRadio.id].errors++;
        this.statistics.totalErrors++;
        this.log('error', `Failed to forward message to ${targetRadio.id}`, targetRadio.id, error);

        // Auto-reconnect if enabled
        if (this.bridgeConfig.autoReconnect) {
          this.scheduleReconnect(targetRadio.id);
        }
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

  private scheduleReconnect(radioId: string, attempt: number = 1) {
    if (attempt > this.bridgeConfig.maxReconnectAttempts) {
      this.log('error', `Max reconnection attempts reached for ${radioId}`, radioId);
      return;
    }

    const radio = this.radios.get(radioId);
    if (!radio) return;

    const delay = this.bridgeConfig.reconnectDelay * Math.pow(2, attempt - 1);
    this.log('info', `Scheduling reconnect for ${radioId} in ${delay}ms (attempt ${attempt})`, radioId);

    const timer = setTimeout(async () => {
      this.log('info', `Reconnecting ${radioId}...`, radioId);
      const result = await this.connectRadio(radio.port);

      if (!result.success) {
        this.scheduleReconnect(radioId, attempt + 1);
      }
    }, delay);

    this.reconnectTimers.set(radioId, timer);
  }

  private updateStatistics() {
    this.statistics.uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    // Calculate message rate (messages per minute)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    this.messageTimestamps = this.messageTimestamps.filter(t => t > oneMinuteAgo);
    this.statistics.messageRatePerMinute = this.messageTimestamps.length;

    // Clean old messages for deduplication
    const cutoff = Date.now() - this.bridgeConfig.deduplicationWindow * 1000;
    for (const [id, msg] of this.messages.entries()) {
      if (msg.timestamp.getTime() < cutoff) {
        this.messages.delete(id);
      }
    }

    this.send('statistics-update', this.statistics);
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

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }

    console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`, data);
    this.send('log-message', entry);
  }

  private notifyStatusChange() {
    this.send('radio-status-change', this.getRadios());
  }

  private send(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // Public API methods
  getRadios(): Radio[] {
    return Array.from(this.radios.values()).map(radio => ({
      ...radio,
      connection: undefined, // Don't send connection object to renderer
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
