/**
 * RNode Protocol Handler
 *
 * Implements BaseProtocol for RNode devices
 * RNode is a simple LoRa packet radio with serial protocol
 *
 * Protocol reference: https://github.com/markqvist/RNode_Firmware
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { SerialPort } from 'serialport';
import { createHash } from 'crypto';

// RNode command constants
const CMD_FREQUENCY = 0x01;
const CMD_BANDWIDTH = 0x02;
const CMD_TXPOWER = 0x03;
const CMD_SF = 0x04;
const CMD_CR = 0x05;
const CMD_RADIO_STATE = 0x06;
const CMD_DETECT = 0x08;
const CMD_READY = 0x0F;
const CMD_DATA = 0x10;
const CMD_DETECT_RESPONSE = 0x4B; // 'K'

const FEND = 0xC0;
const FESC = 0xDB;
const TFEND = 0xDC;
const TFESC = 0xDD;

export class RNodeProtocol extends BaseProtocol {
  constructor(radioId, portPath, options = {}) {
    super(radioId, portPath, options);
    this.serialPort = null;
    this.buffer = Buffer.alloc(0);
    this.deviceReady = false;
    this.config = {
      frequency: options.frequency || 915000000, // 915 MHz
      bandwidth: options.bandwidth || 125000, // 125 kHz
      spreadingFactor: options.spreadingFactor || 7,
      codingRate: options.codingRate || 5,
      txPower: options.txPower || 17 // dBm
    };
  }

  getProtocolName() {
    return 'rnode';
  }

  async connect() {
    try {
      console.log(`[RNode] Connecting to ${this.portPath}...`);

      this.serialPort = new SerialPort({
        path: this.portPath,
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      await new Promise((resolve, reject) => {
        this.serialPort.on('open', resolve);
        this.serialPort.on('error', reject);
      });

      console.log('[RNode] Serial port opened');
      this.setupSerialHandlers();

      // Detect RNode device
      await this.detectDevice();

      // Configure radio parameters
      await this.configureRadio();

      // Set up node info
      this.updateNodeInfo({
        nodeId: this.generateNodeId(),
        longName: `RNode ${this.portPath.split('/').pop()}`,
        shortName: 'RNode',
        hwModel: 'RNode'
      });

      // RNode uses a single "channel" (frequency/bandwidth combination)
      this.updateChannels([{
        index: 0,
        name: `${this.config.frequency / 1000000} MHz`,
        psk: this.generateChannelPsk(),
        frequency: this.config.frequency,
        bandwidth: this.config.bandwidth
      }]);

      this.connected = true;
      console.log(`[RNode] Connected successfully to ${this.portPath}`);

      return true;
    } catch (error) {
      console.error(`[RNode] Connection failed:`, error);
      this.handleError(error);
      throw error;
    }
  }

  setupSerialHandlers() {
    this.serialPort.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });

    this.serialPort.on('error', (error) => {
      console.error('[RNode] Serial error:', error);
      this.handleError(error);
    });

    this.serialPort.on('close', () => {
      console.log('[RNode] Serial port closed');
      this.connected = false;
    });
  }

  processBuffer() {
    while (this.buffer.length > 0) {
      // Look for FEND-framed packet
      if (this.buffer[0] !== FEND) {
        this.buffer = this.buffer.slice(1);
        continue;
      }

      // Find end of packet
      const endIndex = this.buffer.indexOf(FEND, 1);
      if (endIndex === -1) break;

      // Extract and decode packet
      const escapedData = this.buffer.slice(1, endIndex);
      this.buffer = this.buffer.slice(endIndex + 1);

      const decodedData = this.unescapeKISS(escapedData);
      if (decodedData.length > 0) {
        this.processPacket(decodedData);
      }
    }
  }

  unescapeKISS(data) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] === FESC) {
        if (i + 1 < data.length) {
          if (data[i + 1] === TFEND) {
            result.push(FEND);
          } else if (data[i + 1] === TFESC) {
            result.push(FESC);
          }
          i++;
        }
      } else {
        result.push(data[i]);
      }
    }
    return Buffer.from(result);
  }

  escapeKISS(data) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] === FEND) {
        result.push(FESC, TFEND);
      } else if (data[i] === FESC) {
        result.push(FESC, TFESC);
      } else {
        result.push(data[i]);
      }
    }
    return Buffer.from(result);
  }

  processPacket(data) {
    if (data.length === 0) return;

    const command = data[0];

    switch (command) {
      case CMD_DETECT_RESPONSE:
        this.deviceReady = true;
        console.log('[RNode] Device detected and ready');
        break;

      case CMD_DATA:
        // Received data packet
        this.handleDataPacket(data.slice(1));
        break;

      case CMD_READY:
        this.deviceReady = true;
        console.log('[RNode] Device ready');
        break;

      default:
        // Other command responses
        console.log(`[RNode] Received command response: 0x${command.toString(16)}`);
    }
  }

  handleDataPacket(data) {
    try {
      // RNode sends raw packet data
      // We'll use a simple format: first byte is "from" address, second is "to", rest is message
      if (data.length < 3) return;

      const from = data[0];
      const to = data[1];
      const messageData = data.slice(2);

      // Try to decode as UTF-8 text
      let text = '';
      try {
        text = messageData.toString('utf8');
      } catch (e) {
        text = `[Binary data: ${messageData.length} bytes]`;
      }

      const packet = {
        id: createHash('sha256').update(data).digest('hex').substring(0, 16),
        timestamp: new Date(),
        from: from,
        to: to,
        channel: 0, // RNode has single channel
        portnum: 1,
        text: text,
        rawData: data
      };

      this.emitMessage(packet);
    } catch (error) {
      console.error('[RNode] Error handling data packet:', error);
      this.handleError(error);
    }
  }

  async detectDevice() {
    console.log('[RNode] Detecting device...');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Device detection timeout'));
      }, 5000);

      const checkReady = () => {
        if (this.deviceReady) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      // Send detect command
      this.sendCommand(CMD_DETECT);
      checkReady();
    });
  }

  async configureRadio() {
    console.log('[RNode] Configuring radio parameters...');

    // Set frequency
    await this.setFrequency(this.config.frequency);

    // Set bandwidth
    await this.setBandwidth(this.config.bandwidth);

    // Set spreading factor
    await this.setSpreadingFactor(this.config.spreadingFactor);

    // Set coding rate
    await this.setCodingRate(this.config.codingRate);

    // Set TX power
    await this.setTxPower(this.config.txPower);

    // Turn radio on
    await this.setRadioState(1);

    console.log('[RNode] Radio configured successfully');
  }

  async sendCommand(command, value = null) {
    let payload;

    if (value === null) {
      payload = Buffer.from([command]);
    } else if (typeof value === 'number') {
      // Pack number as big-endian bytes based on command
      const valueBytes = [];
      if (command === CMD_FREQUENCY) {
        // 4 bytes for frequency
        valueBytes.push((value >> 24) & 0xFF);
        valueBytes.push((value >> 16) & 0xFF);
        valueBytes.push((value >> 8) & 0xFF);
        valueBytes.push(value & 0xFF);
      } else if (command === CMD_BANDWIDTH) {
        // 4 bytes for bandwidth
        valueBytes.push((value >> 24) & 0xFF);
        valueBytes.push((value >> 16) & 0xFF);
        valueBytes.push((value >> 8) & 0xFF);
        valueBytes.push(value & 0xFF);
      } else {
        // 1 byte for others
        valueBytes.push(value & 0xFF);
      }
      payload = Buffer.from([command, ...valueBytes]);
    } else {
      payload = Buffer.concat([Buffer.from([command]), value]);
    }

    const escaped = this.escapeKISS(payload);
    const frame = Buffer.concat([Buffer.from([FEND]), escaped, Buffer.from([FEND])]);

    return new Promise((resolve) => {
      this.serialPort.write(frame, () => {
        resolve();
      });
    });
  }

  async setFrequency(freq) {
    await this.sendCommand(CMD_FREQUENCY, freq);
    this.config.frequency = freq;
  }

  async setBandwidth(bw) {
    await this.sendCommand(CMD_BANDWIDTH, bw);
    this.config.bandwidth = bw;
  }

  async setSpreadingFactor(sf) {
    await this.sendCommand(CMD_SF, sf);
    this.config.spreadingFactor = sf;
  }

  async setCodingRate(cr) {
    await this.sendCommand(CMD_CR, cr);
    this.config.codingRate = cr;
  }

  async setTxPower(power) {
    await this.sendCommand(CMD_TXPOWER, power);
    this.config.txPower = power;
  }

  async setRadioState(state) {
    await this.sendCommand(CMD_RADIO_STATE, state);
  }

  async disconnect() {
    try {
      console.log(`[RNode] Disconnecting from ${this.portPath}...`);

      // Turn radio off
      if (this.deviceReady) {
        await this.setRadioState(0);
      }

      if (this.serialPort && this.serialPort.isOpen) {
        await new Promise((resolve) => {
          this.serialPort.close(() => resolve());
        });
        this.serialPort = null;
      }

      this.connected = false;
      console.log(`[RNode] Disconnected successfully`);
    } catch (error) {
      console.error('[RNode] Error during disconnect:', error);
      this.handleError(error);
      throw error;
    }
  }

  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected || !this.deviceReady) {
        throw new Error('Device not connected or not ready');
      }

      // Build packet: [from][to][message]
      const from = options.from || 0xFF; // Broadcast from
      const to = options.to || 0xFF; // Broadcast to
      const messageBytes = Buffer.from(text, 'utf8');

      const packet = Buffer.concat([
        Buffer.from([from, to]),
        messageBytes
      ]);

      // Send as data command
      await this.sendCommand(CMD_DATA, packet);

      this.stats.messagesSent++;
      console.log(`[RNode] Message sent: ${text.substring(0, 50)}...`);

      return true;
    } catch (error) {
      console.error('[RNode] Error sending message:', error);
      this.handleError(error);
      throw error;
    }
  }

  generateNodeId() {
    return createHash('sha256')
      .update(this.portPath)
      .digest('hex')
      .substring(0, 16);
  }

  generateChannelPsk() {
    // Generate PSK based on frequency/bandwidth combo
    return createHash('sha256')
      .update(`${this.config.frequency}-${this.config.bandwidth}`)
      .digest('hex')
      .substring(0, 32);
  }

  channelsMatch(channel1, channel2) {
    // RNode channels match if frequency and bandwidth match
    return channel1.frequency === channel2.frequency &&
           channel1.bandwidth === channel2.bandwidth;
  }

  getProtocolMetadata() {
    return {
      frequency: this.config.frequency,
      bandwidth: this.config.bandwidth,
      spreadingFactor: this.config.spreadingFactor,
      codingRate: this.config.codingRate,
      txPower: this.config.txPower
    };
  }
}
