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
  private receiveBuffers: Map<string, Uint8Array> = new Map();

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
      // First, try to get already authorized ports and close them if open
      const existingPorts = await navigator.serial.getPorts();
      this.log('info', `Found ${existingPorts.length} previously authorized ports`);

      for (const existingPort of existingPorts) {
        try {
          // Try to close any port that might be open from a previous session
          if (existingPort.readable || existingPort.writable) {
            this.log('warn', 'Closing previously open port...');
            await existingPort.close();
            this.log('info', 'Successfully closed stale port connection');
          }
        } catch (e) {
          // Port wasn't open, that's fine
          this.log('debug', 'Port was not open');
        }
      }

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

      this.log('info', `Attempting to connect to radio (VID:${portInfo.usbVendorId} PID:${portInfo.usbProductId})`);

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

      // Try to close the port first if it's already open
      try {
        if (port.readable || port.writable) {
          this.log('warn', 'Port appears to be open, attempting to close first...');
          await port.close();
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait a bit
        }
      } catch (e) {
        this.log('debug', 'Port was not previously open');
      }

      // Open the serial port with common Meshtastic baud rate
      this.log('info', 'Opening serial port at 115200 baud...');
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
    this.log('info', 'Started reading loop for radio', radioId);
    let bytesReadTotal = 0;
    let chunksRead = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          this.log('warn', 'Reader stream ended (done=true)', radioId);
          break;
        }
        if (value) {
          bytesReadTotal += value.length;
          chunksRead++;

          if (chunksRead % 10 === 0) {
            this.log('info', `Read ${chunksRead} chunks, ${bytesReadTotal} bytes total so far`, radioId);
          }

          this.handleIncomingData(radioId, value);
        }
      }
    } catch (error) {
      this.log('error', `Error reading from radio ${radioId}: ${(error as Error).message}`, radioId, error);
      const radio = this.radios.get(radioId);
      if (radio) {
        radio.status = 'error';
        radio.errors++;
        this.emit('radio-status-change', Array.from(this.radios.values()));
      }
    } finally {
      this.log('info', `Exiting read loop. Total: ${bytesReadTotal} bytes in ${chunksRead} chunks`, radioId);
      reader.releaseLock();
    }
  }

  private handleIncomingData(radioId: string, data: Uint8Array) {
    const radio = this.radios.get(radioId);
    if (!radio) return;

    // Update last seen timestamp
    radio.lastSeen = new Date();

    // Log ALL incoming data for debugging
    const hexPreview = Array.from(data.slice(0, Math.min(64, data.length)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    this.log('debug', `RAW DATA (${data.length} bytes): ${hexPreview}${data.length > 64 ? '...' : ''}`, radioId);

    // Check for any magic bytes in the data
    let magicByteFound = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0x94) {
        magicByteFound = true;
        this.log('info', `Found magic byte 0x94 at offset ${i}`, radioId);
      }
    }

    if (!magicByteFound && data.length > 0) {
      this.log('warn', `No magic bytes found in ${data.length} byte chunk`, radioId);
    }

    // Append to buffer for this radio
    const existingBuffer = this.receiveBuffers.get(radioId) || new Uint8Array(0);
    const newBuffer = new Uint8Array(existingBuffer.length + data.length);
    newBuffer.set(existingBuffer);
    newBuffer.set(data, existingBuffer.length);
    this.receiveBuffers.set(radioId, newBuffer);

    this.log('debug', `Buffer now contains ${newBuffer.length} bytes total`, radioId);

    // Try to parse packets from buffer
    this.parsePackets(radioId);
  }

  private parsePackets(radioId: string) {
    const radio = this.radios.get(radioId);
    if (!radio) return;

    let buffer = this.receiveBuffers.get(radioId);
    if (!buffer || buffer.length === 0) return;

    let offset = 0;
    let packetsProcessed = 0;

    while (offset < buffer.length) {
      // Look for Meshtastic packet start (0x94 for binary mode)
      if (buffer[offset] === 0x94) {
        // Need at least 4 bytes for header (magic + msb + lsb + index)
        if (offset + 4 > buffer.length) {
          break; // Wait for more data
        }

        // Get packet length (16-bit big-endian)
        const lengthMsb = buffer[offset + 1];
        const lengthLsb = buffer[offset + 2];
        const payloadLength = (lengthMsb << 8) | lengthLsb;

        // Total packet size: magic (1) + length (2) + index (1) + payload + checksum (optional)
        const totalPacketLength = 4 + payloadLength;

        if (offset + totalPacketLength > buffer.length) {
          break; // Wait for more data
        }

        // Extract packet
        const packet = buffer.slice(offset, offset + totalPacketLength);
        const packetIndex = buffer[offset + 3];
        const payload = packet.slice(4);

        this.log('info', `Parsed Meshtastic packet: index=${packetIndex}, length=${payloadLength}`, radioId);

        // Log hex dump of payload
        const hexDump = Array.from(payload.slice(0, Math.min(32, payload.length)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        this.log('debug', `Payload: ${hexDump}${payload.length > 32 ? '...' : ''}`, radioId);

        // Try to parse as a mesh packet
        this.parseMeshPacket(radioId, payload, packet);

        offset += totalPacketLength;
        packetsProcessed++;

        // Update statistics
        radio.messagesReceived++;
        this.statistics.totalMessagesReceived++;
        this.statistics.radioStats[radioId].received++;
        this.messageTimestamps.push(new Date());

      } else {
        // Not a valid packet start, skip this byte
        offset++;
      }
    }

    // Update buffer to remove processed data
    if (offset > 0) {
      this.receiveBuffers.set(radioId, buffer.slice(offset));
    }

    if (packetsProcessed > 0) {
      this.emit('radio-status-change', Array.from(this.radios.values()));
    }
  }

  private parseMeshPacket(radioId: string, payload: Uint8Array, rawPacket: Uint8Array) {
    // Create a basic message structure
    // Note: Full protobuf decoding would extract actual fields
    // For now, we'll create a message with what we can determine

    const message: Message = {
      id: `${Date.now()}-${radioId}-${Math.random()}`,
      timestamp: new Date(),
      fromRadio: radioId,
      from: 0, // Would be extracted from protobuf
      to: 0,   // Would be extracted from protobuf
      channel: 0, // Would be extracted from protobuf
      portnum: 1, // TEXT_MESSAGE_APP
      payload: {
        raw: Array.from(payload)
      },
      forwarded: false,
      duplicate: false,
    };

    // Try to extract text if it looks like a text message
    // Text messages in protobuf often have readable strings
    const textMatch = this.extractPossibleText(payload);
    if (textMatch) {
      message.payload.text = textMatch;
      this.log('info', `Possible message text: "${textMatch}"`, radioId);
    }

    // Check for duplicate
    const isDuplicate = this.isDuplicateMessage(message);
    message.duplicate = isDuplicate;

    if (isDuplicate) {
      this.statistics.totalMessagesDuplicate++;
      this.log('debug', 'Duplicate message detected', radioId);
    } else {
      this.messages.set(message.id, message);

      // Forward if bridge is enabled
      if (this.bridgeConfig.enabled) {
        this.forwardMessage(radioId, message, rawPacket);
      }
    }

    // Emit message event
    this.emit('message-received', { radioId, message });
  }

  private extractPossibleText(data: Uint8Array): string | null {
    // Look for printable ASCII sequences
    let text = '';
    let consecutivePrintable = 0;

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      // Printable ASCII (space through ~)
      if (byte >= 0x20 && byte <= 0x7E) {
        text += String.fromCharCode(byte);
        consecutivePrintable++;
      } else if (byte === 0x00 || byte === 0x0A || byte === 0x0D) {
        // Null terminator or newline - might end a string
        if (consecutivePrintable >= 3) {
          break;
        }
      } else {
        // Non-printable byte
        if (consecutivePrintable >= 3) {
          // We found a string, return it
          break;
        }
        text = '';
        consecutivePrintable = 0;
      }
    }

    // Return text if we found a reasonable string
    if (consecutivePrintable >= 3) {
      return text.trim();
    }

    return null;
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

  async forceCloseAllPorts(): Promise<void> {
    this.log('info', 'Force closing all serial ports...');

    try {
      const ports = await navigator.serial.getPorts();
      this.log('info', `Found ${ports.length} authorized ports to close`);

      for (const port of ports) {
        try {
          if (port.readable || port.writable) {
            this.log('info', 'Closing port...');
            await port.close();
            this.log('info', 'Port closed successfully');
          }
        } catch (error) {
          this.log('warn', `Failed to close port: ${(error as Error).message}`);
        }
      }

      // Also disconnect all radios in our internal state
      for (const radioId of this.radios.keys()) {
        await this.disconnectRadio(radioId);
      }

      this.log('info', 'All ports closed');
    } catch (error) {
      this.log('error', 'Error during force close', undefined, error);
    }
  }
}
