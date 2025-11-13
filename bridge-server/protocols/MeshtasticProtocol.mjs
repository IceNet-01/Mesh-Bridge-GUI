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
    this.channelMap = new Map();
    this.loraConfig = null;
    this.myNodeNum = null; // Store our own node number for loop prevention
  }

  getProtocolName() {
    return 'meshtastic';
  }

  async connect() {
    try {
      console.log(`[Meshtastic] Connecting to ${this.portPath}...`);

      // Create serial transport using the static create method
      this.transport = await TransportNodeSerial.create(this.portPath, 115200);
      console.log(`[Meshtastic] Transport connected`);

      // Create Meshtastic device
      this.device = new MeshDevice(this.transport);
      console.log(`[Meshtastic] MeshDevice created, configuring...`);

      // Subscribe to events BEFORE configuring
      this.setupEventHandlers();

      // Configure the device (required for message flow)
      console.log(`[Meshtastic] Configuring radio...`);
      await this.device.configure();
      console.log(`[Meshtastic] Radio configured successfully`);

      // Set up heartbeat to keep serial connection alive (15 min timeout otherwise)
      this.device.setHeartbeatInterval(30000); // Send heartbeat every 30 seconds
      console.log(`[Meshtastic] Heartbeat enabled`);

      this.connected = true;
      console.log(`[Meshtastic] Successfully connected to ${this.portPath}`);

      return true;
    } catch (error) {
      console.error(`[Meshtastic] Connection failed:`, error);
      this.handleError(error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Subscribe to connection status events
    this.device.events.onDeviceStatus.subscribe((status) => {
      console.log(`[Meshtastic] Device status: ${status}`);

      // Handle disconnection
      if (status === 2) { // DeviceDisconnected
        console.log(`[Meshtastic] Radio disconnected, cleaning up...`);
        this.connected = false;
        this.emit('disconnected');
      }
    });

    // Subscribe to ALL mesh packets
    this.device.events.onMeshPacket.subscribe((packet) => {
      console.log(`[Meshtastic] Raw MeshPacket:`, {
        from: packet.from,
        to: packet.to,
        channel: packet.channel,
        decoded: packet.decoded ? {
          portnum: packet.decoded.portnum,
          payloadVariant: packet.decoded.payloadVariant
        } : null
      });
    });

    // Subscribe to message packets
    this.device.events.onMessagePacket.subscribe((packet) => {
      console.log(`[Meshtastic] onMessagePacket fired!`);
      try {
        // CRITICAL: Filter out our own outgoing messages to prevent forwarding loops
        // The Meshtastic library triggers onMessagePacket for BOTH incoming and outgoing messages
        // We only want to process/forward messages from OTHER nodes
        if (this.myNodeNum && packet.from === this.myNodeNum) {
          console.log(`[Meshtastic] Ignoring own outgoing message from node ${packet.from}`);
          return;
        }

        const normalized = this.normalizeMessagePacket(packet);
        this.emitMessage(normalized);
      } catch (error) {
        console.error('[Meshtastic] Error handling message packet:', error);
        this.handleError(error);
      }
    });

    // Subscribe to node info updates
    this.device.events.onMyNodeInfo.subscribe((myNodeInfo) => {
      console.log(`[Meshtastic] My node info:`, myNodeInfo);
      try {
        // Store raw node number for loop prevention
        this.myNodeNum = myNodeInfo.myNodeNum;

        const nodeInfo = {
          nodeId: myNodeInfo.myNodeNum?.toString() || 'unknown',
          longName: myNodeInfo.user?.longName || 'Unknown',
          shortName: myNodeInfo.user?.shortName || '????',
          hwModel: myNodeInfo.user?.hwModel || 'Unknown'
        };
        this.updateNodeInfo(nodeInfo);
        console.log(`[Meshtastic] Node number set to ${myNodeInfo.myNodeNum}`);
      } catch (error) {
        console.error('[Meshtastic] Error handling node info:', error);
        this.handleError(error);
      }
    });

    // Subscribe to other node info
    this.device.events.onNodeInfoPacket.subscribe((node) => {
      console.log(`[Meshtastic] Node info packet:`, node);
    });

    // Subscribe to channel configuration packets
    this.device.events.onChannelPacket.subscribe((channelPacket) => {
      try {
        const channelInfo = {
          index: channelPacket.index,
          role: channelPacket.role,
          name: channelPacket.settings?.name || '',
          psk: channelPacket.settings?.psk ? Buffer.from(channelPacket.settings.psk).toString('base64') : ''
        };

        this.channelMap.set(channelPacket.index, channelInfo);

        console.log(`[Meshtastic] Channel ${channelPacket.index}:`, {
          name: channelInfo.name || '(unnamed)',
          role: channelInfo.role === 1 ? 'PRIMARY' : 'SECONDARY',
          pskLength: channelInfo.psk.length
        });

        // Convert Map to array for updateChannels
        const channelsArray = Array.from(this.channelMap.values());
        this.updateChannels(channelsArray);
      } catch (error) {
        console.error('[Meshtastic] Error handling channel packet:', error);
        this.handleError(error);
      }
    });

    // Subscribe to config packets (includes LoRa config)
    this.device.events.onConfigPacket.subscribe((configPacket) => {
      try {
        // Check if this is a LoRa config packet
        if (configPacket.lora) {
          this.loraConfig = {
            region: configPacket.lora.region,
            modemPreset: configPacket.lora.modemPreset,
            hopLimit: configPacket.lora.hopLimit,
            txEnabled: configPacket.lora.txEnabled,
            txPower: configPacket.lora.txPower,
            channelNum: configPacket.lora.channelNum,
            overrideDutyCycle: configPacket.lora.overrideDutyCycle,
            sx126xRxBoostedGain: configPacket.lora.sx126xRxBoostedGain,
            overrideFrequency: configPacket.lora.overrideFrequency,
            ignoreMqtt: configPacket.lora.ignoreMqtt
          };

          console.log(`[Meshtastic] LoRa config:`, {
            region: this.getRegionName(this.loraConfig.region),
            modemPreset: this.getModemPresetName(this.loraConfig.modemPreset),
            txPower: this.loraConfig.txPower,
            hopLimit: this.loraConfig.hopLimit
          });

          // Emit config event so bridge server can update clients
          this.emit('config', this.loraConfig);
        }
      } catch (error) {
        console.error('[Meshtastic] Error handling config packet:', error);
        this.handleError(error);
      }
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

      console.log(`[Meshtastic] Sending text: "${text}" on channel ${channel}`);

      // Send using the device
      // sendText(text, destination, wantAck, channel)
      // Use "broadcast" as destination to broadcast on the specified channel
      await this.device.sendText(text, "broadcast", wantAck, channel);

      this.stats.messagesSent++;
      console.log(`[Meshtastic] Text broadcast successfully on channel ${channel}`);

      return true;
    } catch (error) {
      console.error('[Meshtastic] Error sending message:', error);
      this.handleError(error);
      throw error;
    }
  }

  normalizeMessagePacket(packet) {
    // The @meshtastic/core library already decodes text messages
    // packet.data contains the decoded string for text messages
    const text = packet.data;

    return {
      id: packet.id || Date.now().toString(),
      timestamp: packet.rxTime ? new Date(packet.rxTime * 1000) : new Date(),
      from: packet.from,
      to: packet.to,
      channel: packet.channel || 0,
      portnum: packet.portnum || 1,
      text: text || '',
      rssi: packet.rssi,
      snr: packet.snr,
      hopLimit: packet.hopLimit,
      payload: packet
    };
  }

  channelsMatch(channel1, channel2) {
    // Meshtastic channels match if PSK and name are the same
    return channel1.psk === channel2.psk && channel1.name === channel2.name;
  }

  getProtocolMetadata() {
    return {
      firmware: this.device?.deviceStatus?.firmware || 'unknown',
      hardware: this.nodeInfo?.hwModel || 'unknown',
      loraConfig: this.loraConfig ? {
        region: this.getRegionName(this.loraConfig.region),
        modemPreset: this.getModemPresetName(this.loraConfig.modemPreset),
        hopLimit: this.loraConfig.hopLimit,
        txEnabled: this.loraConfig.txEnabled,
        txPower: this.loraConfig.txPower,
        channelNum: this.loraConfig.channelNum
      } : null
    };
  }

  getRegionName(region) {
    const regions = {
      0: 'Unset',
      1: 'US',
      2: 'EU_433',
      3: 'EU_868',
      4: 'CN',
      5: 'JP',
      6: 'ANZ',
      7: 'KR',
      8: 'TW',
      9: 'RU',
      10: 'IN',
      11: 'NZ_865',
      12: 'TH',
      13: 'LORA_24',
      14: 'UA_433',
      15: 'UA_868'
    };
    return regions[region] || `Unknown (${region})`;
  }

  getModemPresetName(preset) {
    const presets = {
      0: 'Long Fast',
      1: 'Long Slow',
      2: 'Very Long Slow',
      3: 'Medium Slow',
      4: 'Medium Fast',
      5: 'Short Slow',
      6: 'Short Fast',
      7: 'Long Moderate'
    };
    return presets[preset] || `Unknown (${preset})`;
  }
}
