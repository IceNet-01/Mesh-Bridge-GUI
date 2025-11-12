/**
 * Meshtastic Protocol Handler
 *
 * Implements BaseProtocol for Meshtastic radios using official @meshtastic libraries
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';

export class MeshtasticProtocol extends BaseProtocol {
  constructor(radioId, portPath, options = {}) {
    super(radioId, portPath, options);
    this.transport = null;
    this.device = null;
  }

  getProtocolName() {
    return 'meshtastic';
  }

  async connect() {
    try {
      console.log(`[Meshtastic] Connecting to ${this.portPath}...`);

      // Create serial transport
      this.transport = await TransportNodeSerial.create(this.portPath, 115200);

      // Create device
      this.device = new MeshDevice(this.transport);

      // Subscribe to events BEFORE configuring
      this.setupEventHandlers();

      // Configure device and wait for connection
      await this.device.configure();

      console.log(`[Meshtastic] Device configured, waiting for node info...`);

      // Wait for node info (with timeout)
      await this.waitForNodeInfo();

      this.connected = true;
      console.log(`[Meshtastic] Connected successfully to ${this.portPath}`);

      return true;
    } catch (error) {
      console.error(`[Meshtastic] Connection failed:`, error);
      this.handleError(error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Subscribe to message packets
    this.device.events.onMessagePacket.subscribe((packet) => {
      try {
        const normalized = this.normalizeMessagePacket(packet);
        this.emitMessage(normalized);
      } catch (error) {
        console.error('[Meshtastic] Error handling message packet:', error);
        this.handleError(error);
      }
    });

    // Subscribe to node info updates
    this.device.events.onMyNodeInfo.subscribe((info) => {
      try {
        const nodeInfo = {
          nodeId: info.myNodeNum?.toString() || 'unknown',
          longName: info.user?.longName || 'Unknown',
          shortName: info.user?.shortName || '????',
          hwModel: info.user?.hwModel || 'Unknown'
        };
        this.updateNodeInfo(nodeInfo);
        console.log(`[Meshtastic] Node info updated:`, nodeInfo);
      } catch (error) {
        console.error('[Meshtastic] Error handling node info:', error);
        this.handleError(error);
      }
    });

    // Subscribe to channel updates
    this.device.events.onChannelPacket.subscribe((channels) => {
      try {
        this.updateChannels(channels);
        console.log(`[Meshtastic] Channels updated: ${channels.length} channels`);
      } catch (error) {
        console.error('[Meshtastic] Error handling channels:', error);
        this.handleError(error);
      }
    });

    // Subscribe to device metrics/telemetry
    this.device.events.onDeviceMetricsPacket.subscribe((metrics) => {
      try {
        const telemetry = {
          batteryLevel: metrics.batteryLevel,
          voltage: metrics.voltage,
          channelUtilization: metrics.channelUtilization,
          airUtilTx: metrics.airUtilTx
        };
        this.updateTelemetry(telemetry);
      } catch (error) {
        console.error('[Meshtastic] Error handling telemetry:', error);
        this.handleError(error);
      }
    });
  }

  async waitForNodeInfo(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for node info'));
      }, timeout);

      const checkNodeInfo = () => {
        if (this.nodeInfo && this.nodeInfo.nodeId !== 'unknown') {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(checkNodeInfo, 100);
        }
      };

      checkNodeInfo();
    });
  }

  async disconnect() {
    try {
      console.log(`[Meshtastic] Disconnecting from ${this.portPath}...`);

      if (this.device) {
        await this.device.disconnect();
        this.device = null;
      }

      if (this.transport) {
        this.transport = null;
      }

      this.connected = false;
      console.log(`[Meshtastic] Disconnected successfully`);
    } catch (error) {
      console.error('[Meshtastic] Error during disconnect:', error);
      this.handleError(error);
      throw error;
    }
  }

  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      const { wantAck = false } = options;

      // Send message using Meshtastic device
      const result = await this.device.sendText(text, channel, wantAck);

      this.stats.messagesSent++;
      console.log(`[Meshtastic] Message sent to channel ${channel}: ${text.substring(0, 50)}...`);

      return result;
    } catch (error) {
      console.error('[Meshtastic] Error sending message:', error);
      this.handleError(error);
      throw error;
    }
  }

  normalizeMessagePacket(packet) {
    return {
      id: packet.id || Date.now().toString(),
      timestamp: packet.rxTime ? new Date(packet.rxTime * 1000) : new Date(),
      from: packet.from,
      to: packet.to,
      channel: packet.channel || 0,
      portnum: packet.portnum || 1,
      text: packet.text || this.extractText(packet),
      rssi: packet.rssi,
      snr: packet.snr,
      hopLimit: packet.hopLimit,
      payload: packet
    };
  }

  extractText(packet) {
    // Try to extract text from different packet formats
    if (packet.decoded && packet.decoded.text) {
      return packet.decoded.text;
    }
    if (packet.data && typeof packet.data === 'string') {
      return packet.data;
    }
    return '';
  }

  channelsMatch(channel1, channel2) {
    // Meshtastic channels match if PSK and name are the same
    return channel1.psk === channel2.psk && channel1.name === channel2.name;
  }

  getProtocolMetadata() {
    return {
      firmware: this.device?.deviceStatus?.firmware || 'unknown',
      hardware: this.nodeInfo?.hwModel || 'unknown'
    };
  }
}
