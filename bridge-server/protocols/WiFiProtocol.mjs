/**
 * WiFi Protocol Handler for Meshtastic
 *
 * Implements BaseProtocol for Meshtastic radios using WiFi/TCP/HTTP connections
 * Uses @meshtastic/transport-http for network-based communication
 *
 * Note: When a Meshtastic device has WiFi enabled, Bluetooth is automatically disabled.
 * This is a hardware limitation of ESP32 devices.
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshDevice } from '@meshtastic/core';
import { create } from '@bufbuild/protobuf';
import * as Protobuf from '@meshtastic/protobufs';

// Dynamic import for transport-http (ESM module)
let TransportHTTP;

export class WiFiProtocol extends BaseProtocol {
  constructor(radioId, hostAddress, options = {}) {
    super(radioId, hostAddress, options);

    // WiFi specific properties
    this.hostAddress = hostAddress; // IP address or hostname (e.g., "192.168.1.100" or "meshtastic.local")
    this.transport = null;
    this.device = null;
    this.channelMap = new Map();
    this.loraConfig = null;
    this.myNodeNum = null;

    // Node Catalog - Single source of truth for all node data
    this.nodeCatalog = new Map();

    // Timers for periodic tasks
    this.nodesScanInterval = null;
    this.radioTimeUpdateInterval = null;

    // Track last message time for device time fallback
    this.lastMessageTime = null;

    // Track radio's actual time
    this.radioTime = null;
    this.radioTimeSource = null;
    this.radioTimeUpdated = null;

    // Connection options
    this.useTLS = options.useTLS || false; // Use HTTPS instead of HTTP
    this.fetchInterval = options.fetchInterval || 3000; // Poll interval in ms
  }

  getProtocolName() {
    return 'wifi';
  }

  /**
   * Normalize node ID to consistent hex format with "!" prefix
   */
  normalizeNodeId(nodeNum) {
    if (typeof nodeNum !== 'number') {
      console.warn(`[WiFi] Invalid nodeNum type: ${typeof nodeNum}, value:`, nodeNum);
      return 'unknown';
    }
    return '!' + nodeNum.toString(16).padStart(8, '0');
  }

  /**
   * Update node catalog with new data
   */
  updateNodeCatalog(nodeNum, update, source = 'Unknown') {
    if (typeof nodeNum !== 'number') {
      console.warn(`[WiFi] Cannot update catalog - invalid nodeNum:`, nodeNum);
      return null;
    }

    const nodeId = this.normalizeNodeId(nodeNum);
    let node = this.nodeCatalog.get(nodeNum);

    if (!node) {
      node = {
        nodeId: nodeId,
        num: nodeNum,
        longName: 'Unknown',
        shortName: '????',
        hwModel: 'Unknown',
        lastHeard: new Date(),
        _timestamps: {
          userInfo: null,
          position: null,
          telemetry: null,
          lastSeen: new Date()
        }
      };
      console.log(`[WiFi] 📝 Creating new catalog entry for ${nodeId} (source: ${source})`);
    }

    node._timestamps.lastSeen = new Date();
    node.lastHeard = new Date();

    // Smart merge - only update fields with meaningful new data
    if (update.longName && update.longName !== 'Unknown' && update.longName !== node.longName) {
      node.longName = update.longName;
      node._timestamps.userInfo = new Date();
      console.log(`[WiFi] 👤 Updated name: ${nodeId} → "${update.longName}" (source: ${source})`);
    }

    if (update.shortName && update.shortName !== '????' && update.shortName !== node.shortName) {
      node.shortName = update.shortName;
      node._timestamps.userInfo = new Date();
    }

    if (update.hwModel && update.hwModel !== 'Unknown' && update.hwModel !== node.hwModel) {
      node.hwModel = update.hwModel;
      node._timestamps.userInfo = new Date();
    }

    if (update.position && (update.position.latitude || update.position.longitude)) {
      node.position = { ...node.position, ...update.position };
      node._timestamps.position = new Date();
    }

    // Telemetry fields
    const telemetryFields = [
      'batteryLevel', 'voltage', 'channelUtilization', 'airUtilTx', 'uptimeSeconds',
      'temperature', 'humidity', 'pressure', 'gasResistance', 'iaq'
    ];

    let telemetryUpdated = false;
    for (const field of telemetryFields) {
      if (update[field] !== undefined && update[field] !== null) {
        node[field] = update[field];
        telemetryUpdated = true;
      }
    }

    if (telemetryUpdated) {
      node._timestamps.telemetry = new Date();
    }

    if (update.snr !== undefined) {
      node.snr = update.snr;
    }

    this.nodeCatalog.set(nodeNum, node);
    return node;
  }

  /**
   * Get node from catalog
   */
  getNodeFromCatalog(nodeNum) {
    return this.nodeCatalog.get(nodeNum) || null;
  }

  /**
   * Get all nodes from catalog
   */
  getAllNodesFromCatalog() {
    return Array.from(this.nodeCatalog.values());
  }

  async connect() {
    try {
      console.log(`[WiFi] Connecting to ${this.hostAddress}...`);

      // Dynamically import the transport-http module
      if (!TransportHTTP) {
        try {
          const module = await import('@meshtastic/transport-http');
          TransportHTTP = module.TransportHTTP || module.default;
          console.log(`[WiFi] Loaded @meshtastic/transport-http module`);
        } catch (importError) {
          console.error(`[WiFi] Failed to import @meshtastic/transport-http:`, importError);
          throw new Error('WiFi transport not available. Please install @meshtastic/transport-http package.');
        }
      }

      // Determine the URL scheme
      const protocol = this.useTLS ? 'https' : 'http';
      const url = `${protocol}://${this.hostAddress}`;

      console.log(`[WiFi] Creating HTTP transport to ${url}...`);

      // Create HTTP transport
      this.transport = await TransportHTTP.create(this.hostAddress, {
        fetchInterval: this.fetchInterval,
        tls: this.useTLS
      });
      console.log(`[WiFi] Transport created successfully`);

      // Create Meshtastic device
      this.device = new MeshDevice(this.transport);
      console.log(`[WiFi] MeshDevice created, configuring...`);

      // Subscribe to events BEFORE configuring
      this.setupEventHandlers();

      // Configure the device
      console.log(`[WiFi] Configuring radio...`);
      await this.device.configure();
      console.log(`[WiFi] Radio configured successfully`);

      // Set up heartbeat (if supported)
      try {
        this.device.setHeartbeatInterval(30000);
        console.log(`[WiFi] Heartbeat enabled`);
      } catch (e) {
        console.log(`[WiFi] Heartbeat not supported over HTTP transport`);
      }

      // Set up periodic node scan
      this.nodesScanInterval = setInterval(() => {
        this.scanAndEmitNodes();
      }, 60000);
      console.log(`[WiFi] Periodic node scan enabled (60s interval)`);

      // Set up periodic radio status updates
      this.radioTimeUpdateInterval = setInterval(() => {
        if (this.nodeInfo) {
          this.updateNodeInfo(this.nodeInfo);
        }
      }, 10000);
      console.log(`[WiFi] Periodic radio time updates enabled (10s interval)`);

      this.connected = true;

      // Fetch node info
      console.log(`[WiFi] 🔄 Connection established, fetching device info...`);
      this.fetchAndEmitDeviceInfo(0);
      setTimeout(() => this.scanAndEmitNodes(), 5000);

      console.log(`[WiFi] Successfully connected to ${this.hostAddress}`);

      return true;
    } catch (error) {
      console.error(`[WiFi] Connection failed:`, error);

      // Clean up on error
      try {
        if (this.device) {
          await this.device.disconnect();
          this.device = null;
        }
        if (this.transport) {
          this.transport = null;
        }
        this.connected = false;
      } catch (cleanupError) {
        console.error(`[WiFi] Error during cleanup:`, cleanupError);
      }

      this.handleError(error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Subscribe to connection status events
    this.device.events.onDeviceStatus.subscribe((status) => {
      console.log(`[WiFi] Device status: ${status}`);

      if (status === 2) { // DeviceDisconnected
        console.log(`[WiFi] Radio disconnected, cleaning up...`);
        this.connected = false;
        this.emit('disconnected');
      }
    });

    // Subscribe to mesh packets
    this.device.events.onMeshPacket.subscribe((packet) => {
      if (packet.decoded?.portnum === 3) { // TEXT_MESSAGE_APP
        const nodeId = this.normalizeNodeId(packet.from);
        console.log(`[WiFi] 📦 Text message from ${nodeId} on channel ${packet.channel}`);
      }
    });

    // Subscribe to message packets
    this.device.events.onMessagePacket.subscribe((packet) => {
      console.log(`[WiFi] onMessagePacket fired!`);
      try {
        if (this.myNodeNum && packet.from === this.myNodeNum) {
          console.log(`[WiFi] Ignoring own outgoing message from node ${packet.from}`);
          return;
        }

        this.lastMessageTime = new Date();
        const normalized = this.normalizeMessagePacket(packet);
        this.emitMessage(normalized);
      } catch (error) {
        console.error('[WiFi] Error handling message packet:', error);
        this.handleError(error);
      }
    });

    // Subscribe to node info updates
    this.device.events.onMyNodeInfo.subscribe((myNodeInfo) => {
      console.log(`[WiFi] 🆔 onMyNodeInfo event fired!`, {
        myNodeNum: myNodeInfo.myNodeNum,
        hasUser: !!myNodeInfo.user,
        longName: myNodeInfo.user?.longName
      });

      try {
        this.myNodeNum = myNodeInfo.myNodeNum;
        console.log(`[WiFi] ✅ Stored myNodeNum: ${this.myNodeNum}`);

        const myNode = this.nodeCatalog.get(myNodeInfo.myNodeNum);
        if (myNode && myNode.longName) {
          const nodeInfo = {
            nodeId: this.normalizeNodeId(myNodeInfo.myNodeNum),
            longName: myNode.longName,
            shortName: myNode.shortName || '????',
            hwModel: myNode.hwModel || 'Unknown'
          };
          this.updateNodeInfo(nodeInfo);
          console.log(`[WiFi] Node info from catalog:`, nodeInfo);
          return;
        }

        if (myNodeInfo.user && myNodeInfo.user.longName) {
          const nodeInfo = {
            nodeId: this.normalizeNodeId(myNodeInfo.myNodeNum),
            longName: myNodeInfo.user.longName,
            shortName: myNodeInfo.user.shortName || '????',
            hwModel: this.getHwModelName(myNodeInfo.user.hwModel) || 'Unknown'
          };
          console.log(`[WiFi] 🎯 Using myNodeInfo.user directly:`, nodeInfo);
          this.updateNodeInfo(nodeInfo);
        } else {
          console.log(`[WiFi] ⏳ Node number set to ${myNodeInfo.myNodeNum}, waiting for complete user info...`);
        }
      } catch (error) {
        console.error('[WiFi] ❌ Error handling node info:', error);
        this.handleError(error);
      }
    });

    // Subscribe to node info packets
    this.device.events.onNodeInfoPacket.subscribe((node) => {
      console.log(`[WiFi] 📱 NodeInfoPacket received for node ${node.num}`);

      if (this.myNodeNum && node.num === this.myNodeNum && node.user && node.user.longName) {
        console.log(`[WiFi] 🎉 Received full node info for our own radio!`);
        const nodeInfo = {
          nodeId: this.normalizeNodeId(node.num),
          longName: node.user.longName,
          shortName: node.user.shortName || '????',
          hwModel: this.getHwModelName(node.user.hwModel) || 'Unknown'
        };
        this.updateNodeInfo(nodeInfo);
      }

      if (node.user) {
        const update = {
          longName: node.user.longName,
          shortName: node.user.shortName,
          hwModel: this.getHwModelName(node.user.hwModel),
          snr: node.snr,
          position: node.position && node.position.latitudeI && node.position.longitudeI ? {
            latitude: node.position.latitudeI / 1e7,
            longitude: node.position.longitudeI / 1e7,
            altitude: node.position.altitude,
            time: node.position.time ? new Date(node.position.time * 1000) : undefined
          } : undefined,
          batteryLevel: node.deviceMetrics?.batteryLevel,
          voltage: node.deviceMetrics?.voltage,
          channelUtilization: node.deviceMetrics?.channelUtilization,
          airUtilTx: node.deviceMetrics?.airUtilTx,
          temperature: node.environmentMetrics?.temperature || node.deviceMetrics?.temperature,
          humidity: node.environmentMetrics?.relativeHumidity || node.environmentMetrics?.relative_humidity,
          pressure: node.environmentMetrics?.barometricPressure || node.environmentMetrics?.barometric_pressure,
        };

        const catalogedNode = this.updateNodeCatalog(node.num, update, 'NodeInfoPacket');
        if (catalogedNode) {
          this.emit('node', catalogedNode);
        }

        this.emit('nodeinfo-packet', {
          from: node.num,
          data: node.user,
          channel: 0,
          timestamp: new Date()
        });
      }
    });

    // Subscribe to position packets
    this.device.events.onPositionPacket.subscribe((positionPacket) => {
      try {
        if (this.myNodeNum && positionPacket.from === this.myNodeNum && positionPacket.data?.time) {
          this.radioTime = new Date(positionPacket.data.time * 1000);
          this.radioTimeSource = 'gps';
          this.radioTimeUpdated = new Date();
        }

        if (positionPacket.data && (positionPacket.data.latitudeI || positionPacket.data.longitudeI)) {
          const update = {
            position: {
              latitude: positionPacket.data.latitudeI / 1e7,
              longitude: positionPacket.data.longitudeI / 1e7,
              altitude: positionPacket.data.altitude,
              time: positionPacket.data.time ? new Date(positionPacket.data.time * 1000) : new Date()
            }
          };

          const catalogedNode = this.updateNodeCatalog(positionPacket.from, update, 'PositionPacket');
          if (catalogedNode) {
            this.emit('node', catalogedNode);
          }
        }
      } catch (error) {
        console.error('[WiFi] Error handling position packet:', error);
      }
    });

    // Subscribe to telemetry packets
    this.device.events.onTelemetryPacket.subscribe((telemetryPacket) => {
      try {
        if (this.myNodeNum && telemetryPacket.from === this.myNodeNum) {
          this.radioTime = new Date();
          this.radioTimeSource = 'telemetry';
          this.radioTimeUpdated = new Date();
        }

        const data = telemetryPacket.data;
        const update = {};

        if (!data.variant || !data.variant.case) {
          return;
        }

        switch (data.variant.case) {
          case 'deviceMetrics': {
            const metrics = data.variant.value;
            update.batteryLevel = metrics.batteryLevel;
            update.voltage = metrics.voltage;
            update.channelUtilization = metrics.channelUtilization;
            update.airUtilTx = metrics.airUtilTx;
            update.uptimeSeconds = metrics.uptimeSeconds;
            break;
          }
          case 'environmentMetrics': {
            const metrics = data.variant.value;
            update.temperature = metrics.temperature;
            update.humidity = metrics.relativeHumidity || metrics.relative_humidity;
            update.pressure = metrics.barometricPressure || metrics.barometric_pressure;
            update.gasResistance = metrics.gasResistance || metrics.gas_resistance;
            update.iaq = metrics.iaq;
            break;
          }
          default:
            return;
        }

        const catalogedNode = this.updateNodeCatalog(telemetryPacket.from, update, 'TelemetryPacket');
        if (catalogedNode) {
          this.emit('node', catalogedNode);
        }
      } catch (error) {
        console.error('[WiFi] Error handling telemetry packet:', error);
      }
    });

    // Subscribe to user packets
    this.device.events.onUserPacket.subscribe((userPacket) => {
      try {
        if (userPacket.data) {
          const update = {
            longName: userPacket.data.longName,
            shortName: userPacket.data.shortName,
            hwModel: this.getHwModelName(userPacket.data.hwModel)
          };

          const catalogedNode = this.updateNodeCatalog(userPacket.from, update, 'UserPacket');
          if (catalogedNode) {
            this.emit('node', catalogedNode);
          }
        }
      } catch (error) {
        console.error('[WiFi] Error handling user packet:', error);
      }
    });

    // Subscribe to channel configuration packets
    this.device.events.onChannelPacket.subscribe((channelPacket) => {
      try {
        console.log(`[WiFi] 🔍 Channel packet ${channelPacket.index}:`, JSON.stringify(channelPacket, null, 2));

        const roleMap = { 0: 'DISABLED', 1: 'PRIMARY', 2: 'SECONDARY' };

        const channelInfo = {
          index: channelPacket.index,
          role: roleMap[channelPacket.role] || 'SECONDARY',
          settings: {
            name: channelPacket.settings?.name || '',
            psk: channelPacket.settings?.psk ? Buffer.from(channelPacket.settings.psk).toString('base64') : '',
            uplinkEnabled: channelPacket.settings?.uplinkEnabled ?? true,
            downlinkEnabled: channelPacket.settings?.downlinkEnabled ?? true
          }
        };

        this.channelMap.set(channelPacket.index, channelInfo);
        console.log(`[WiFi] Channel ${channelPacket.index}: ${channelInfo.settings.name || '(unnamed)'}`);

        const channelsArray = Array.from(this.channelMap.values());
        this.updateChannels(channelsArray);
      } catch (error) {
        console.error('[WiFi] Error handling channel packet:', error);
        this.handleError(error);
      }
    });

    // Subscribe to config packets
    this.device.events.onConfigPacket.subscribe((configPacket) => {
      try {
        console.log(`[WiFi] 📦 Config packet received`);

        const configType = configPacket.payloadVariant?.case;
        const configData = configPacket.payloadVariant?.value;

        if (configPacket.lora) {
          this.loraConfig = {
            region: configPacket.lora.region,
            modemPreset: configPacket.lora.modemPreset,
            hopLimit: configPacket.lora.hopLimit,
            txEnabled: configPacket.lora.txEnabled,
            txPower: configPacket.lora.txPower,
            channelNum: configPacket.lora.channelNum
          };
          console.log(`[WiFi] LoRa config received`);
          this.emit('config', { configType: 'lora', config: this.loraConfig });
        }

        if (configType === 'lora' && configData) {
          this.loraConfig = {
            region: configData.region,
            modemPreset: configData.modemPreset,
            hopLimit: configData.hopLimit,
            txEnabled: configData.txEnabled,
            txPower: configData.txPower,
            channelNum: configData.channelNum
          };
          this.emit('config', { configType: 'lora', config: this.loraConfig });
        }
      } catch (error) {
        console.error('[WiFi] Error handling config packet:', error);
        this.handleError(error);
      }
    });
  }

  /**
   * Fetch and emit device info
   */
  fetchAndEmitDeviceInfo(retryCount = 0) {
    try {
      const maxRetries = 5;
      const retryDelay = Math.min(500 * Math.pow(2, retryCount), 5000);

      if (retryCount === 0) {
        console.log(`[WiFi] 🔍 Fetching device info from catalog...`);
      }

      if (this.myNodeNum) {
        const myNode = this.nodeCatalog.get(this.myNodeNum);

        if (myNode && myNode.longName) {
          const nodeInfo = {
            nodeId: this.normalizeNodeId(this.myNodeNum),
            longName: myNode.longName,
            shortName: myNode.shortName || '????',
            hwModel: myNode.hwModel || 'Unknown'
          };
          this.updateNodeInfo(nodeInfo);
          console.log(`[WiFi] ✅ Device info ready: ${myNode.longName} (${nodeInfo.nodeId})`);
        } else if (retryCount < maxRetries) {
          setTimeout(() => this.fetchAndEmitDeviceInfo(retryCount + 1), retryDelay);
          return;
        }
      } else if (retryCount < maxRetries) {
        setTimeout(() => this.fetchAndEmitDeviceInfo(retryCount + 1), retryDelay);
        return;
      }

      // Get channels from device
      if (this.device && this.device.channels) {
        console.log(`[WiFi] Found ${this.device.channels.length} channels in device object`);
        this.device.channels.forEach((channel, index) => {
          if (channel && channel.settings) {
            const channelInfo = {
              index: index,
              role: channel.role,
              name: channel.settings.name || '',
              psk: channel.settings.psk ? Buffer.from(channel.settings.psk).toString('base64') : ''
            };
            this.channelMap.set(index, channelInfo);
          }
        });

        const channelsArray = Array.from(this.channelMap.values());
        if (channelsArray.length > 0) {
          this.updateChannels(channelsArray);
          console.log(`[WiFi] Emitted ${channelsArray.length} channels`);
        }
      }

      // Get LoRa config from device
      if (this.device && this.device.config && this.device.config.lora) {
        const lora = this.device.config.lora;
        this.loraConfig = {
          region: lora.region,
          modemPreset: lora.modemPreset,
          hopLimit: lora.hopLimit,
          txEnabled: lora.txEnabled,
          txPower: lora.txPower,
          channelNum: lora.channelNum
        };
        console.log(`[WiFi] LoRa config fetched`);
        this.emit('config', this.loraConfig);
      }

      console.log(`[WiFi] Device info fetch complete`);
    } catch (error) {
      console.error('[WiFi] Error fetching device info:', error);
    }
  }

  /**
   * Update and emit node info
   */
  updateNodeInfo(nodeInfo) {
    this.nodeInfo = nodeInfo;
    this.emit('nodeInfo', nodeInfo);
  }

  /**
   * Scan and emit all nodes
   */
  scanAndEmitNodes() {
    try {
      if (this.nodeCatalog.size === 0) {
        return;
      }

      this.nodeCatalog.forEach((node) => {
        this.emit('node', node);
      });
    } catch (error) {
      console.error('[WiFi] Error scanning nodes:', error);
    }
  }

  async disconnect() {
    try {
      console.log(`[WiFi] Disconnecting from ${this.hostAddress}...`);

      if (this.nodesScanInterval) {
        clearInterval(this.nodesScanInterval);
        this.nodesScanInterval = null;
      }

      if (this.radioTimeUpdateInterval) {
        clearInterval(this.radioTimeUpdateInterval);
        this.radioTimeUpdateInterval = null;
      }

      if (this.device) {
        await this.device.disconnect();
        this.device = null;
      }

      if (this.transport) {
        this.transport = null;
      }

      this.connected = false;
      console.log(`[WiFi] Disconnected successfully`);
    } catch (error) {
      console.error('[WiFi] Error during disconnect:', error);
      this.handleError(error);
      throw error;
    }
  }

  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      if (!this.nodeInfo || !this.nodeInfo.nodeId) {
        throw new Error('Device not fully configured yet. Please wait a few seconds and try again.');
      }

      if (!this.channelMap.has(channel)) {
        const availableChannels = Array.from(this.channelMap.keys());
        throw new Error(`Channel ${channel} not found. Available channels: ${availableChannels.join(', ')}`);
      }

      const { wantAck = false } = options;

      console.log(`[WiFi] Sending text: "${text}" on channel ${channel} (broadcast)`);

      const result = await this.device.sendText(text, "broadcast", wantAck, channel);

      this.stats.messagesSent++;
      console.log(`[WiFi] ✅ Text broadcast successfully on channel ${channel}`);

      return true;
    } catch (error) {
      console.error('[WiFi] ❌ Error sending message:', error);

      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const errorCode = error.error || error.code || error.errorCode || error.status;
        if (errorCode === 3) {
          errorMsg = 'Device not ready. Please wait for device configuration to complete.';
        } else if (errorCode === 2) {
          errorMsg = 'Invalid channel. Please check channel number.';
        } else {
          errorMsg = String(error.message || error);
        }
      } else {
        errorMsg = String(error);
      }

      const finalError = new Error(errorMsg);
      this.handleError(finalError);
      throw finalError;
    }
  }

  /**
   * Get channel configuration
   */
  async getChannel(channelIndex) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[WiFi] Getting channel ${channelIndex} configuration...`);
      await this.device.getChannel(channelIndex);
      return { success: true };
    } catch (error) {
      console.error('[WiFi] Error getting channel:', error);
      throw error;
    }
  }

  /**
   * Set channel configuration
   */
  async setChannel(channelConfig) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[WiFi] Setting channel configuration...`);

      if (channelConfig.settings?.psk && typeof channelConfig.settings.psk === 'object') {
        if (!(channelConfig.settings.psk instanceof Uint8Array)) {
          const pskArray = Object.values(channelConfig.settings.psk);
          channelConfig.settings.psk = new Uint8Array(pskArray);
        }
      }

      if (typeof channelConfig.role === 'string') {
        const roleMap = { 'PRIMARY': 1, 'SECONDARY': 0, 'DISABLED': 2 };
        const roleValue = roleMap[channelConfig.role];
        if (roleValue !== undefined) {
          channelConfig.role = roleValue;
        }
      }

      const channelMessage = create(Protobuf.Channel.ChannelSchema, channelConfig);
      await this.device.setChannel(channelMessage);

      console.log(`[WiFi] ✅ Channel configuration sent successfully`);
      return true;
    } catch (error) {
      console.error('[WiFi] Error setting channel:', error);
      throw error;
    }
  }

  /**
   * Reboot the radio
   */
  async rebootRadio() {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[WiFi] 🔄 Rebooting radio...`);
      await this.device.reboot();
      console.log(`[WiFi] ✅ Reboot command sent to radio`);
      this.connected = false;

      return true;
    } catch (error) {
      console.error('[WiFi] ❌ Error rebooting radio:', error);
      throw error;
    }
  }

  /**
   * Get radio configuration
   */
  async getConfig(configType) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[WiFi] Getting ${configType} configuration...`);

      const configTypeMap = {
        'device': Protobuf.Admin.AdminMessage_ConfigType.DEVICE_CONFIG,
        'position': Protobuf.Admin.AdminMessage_ConfigType.POSITION_CONFIG,
        'power': Protobuf.Admin.AdminMessage_ConfigType.POWER_CONFIG,
        'network': Protobuf.Admin.AdminMessage_ConfigType.NETWORK_CONFIG,
        'display': Protobuf.Admin.AdminMessage_ConfigType.DISPLAY_CONFIG,
        'lora': Protobuf.Admin.AdminMessage_ConfigType.LORA_CONFIG,
        'bluetooth': Protobuf.Admin.AdminMessage_ConfigType.BLUETOOTH_CONFIG,
      };

      const configTypeEnum = configTypeMap[configType.toLowerCase()];
      if (!configTypeEnum) {
        throw new Error(`Unknown config type: ${configType}`);
      }

      await this.device.getConfig(configTypeEnum);
      return { success: true };
    } catch (error) {
      console.error('[WiFi] Error getting config:', error);
      throw error;
    }
  }

  /**
   * Set radio configuration
   */
  async setConfig(configType, config) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[WiFi] Setting ${configType} configuration...`);

      let configMessage;
      let configCase;

      switch (configType.toLowerCase()) {
        case 'device':
          configMessage = create(Protobuf.Config.Config_DeviceConfigSchema, config);
          configCase = 'device';
          break;
        case 'position':
          configMessage = create(Protobuf.Config.Config_PositionConfigSchema, config);
          configCase = 'position';
          break;
        case 'power':
          configMessage = create(Protobuf.Config.Config_PowerConfigSchema, config);
          configCase = 'power';
          break;
        case 'network':
          configMessage = create(Protobuf.Config.Config_NetworkConfigSchema, config);
          configCase = 'network';
          break;
        case 'display':
          configMessage = create(Protobuf.Config.Config_DisplayConfigSchema, config);
          configCase = 'display';
          break;
        case 'lora':
          configMessage = create(Protobuf.Config.Config_LoRaConfigSchema, config);
          configCase = 'lora';
          break;
        case 'bluetooth':
          configMessage = create(Protobuf.Config.Config_BluetoothConfigSchema, config);
          configCase = 'bluetooth';
          break;
        default:
          throw new Error(`Unknown config type: ${configType}`);
      }

      const fullConfig = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: { case: configCase, value: configMessage }
      });

      await this.device.setConfig(fullConfig);
      console.log(`[WiFi] ✅ Configuration sent successfully`);

      return true;
    } catch (error) {
      console.error('[WiFi] Error setting config:', error);
      throw error;
    }
  }

  /**
   * Set device owner information
   */
  async setOwner(owner) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[WiFi] 👤 Setting owner information...`);

      const userMessage = create(Protobuf.Mesh.UserSchema, {
        longName: owner.longName || '',
        shortName: owner.shortName || '',
        isLicensed: owner.isLicensed || false,
      });

      await this.device.setOwner(userMessage);
      console.log(`[WiFi] ✅ Owner information sent successfully`);

      if (this.myNodeNum) {
        const node = this.nodeCatalog.get(this.myNodeNum);
        if (node) {
          node.longName = owner.longName || node.longName;
          node.shortName = owner.shortName || node.shortName;

          this.emit('node-info', {
            nodeId: this.normalizeNodeId(this.myNodeNum),
            longName: node.longName,
            shortName: node.shortName,
            hwModel: node.hwModel || 'Unknown'
          });
        }
      }

      return true;
    } catch (error) {
      console.error('[WiFi] ❌ Error setting owner:', error);
      throw error;
    }
  }

  normalizeMessagePacket(packet) {
    const text = packet.data;

    return {
      id: packet.id || Date.now().toString(),
      timestamp: new Date(),
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
    const psk1 = channel1?.settings?.psk || channel1?.psk || '';
    const psk2 = channel2?.settings?.psk || channel2?.psk || '';
    return psk1 === psk2;
  }

  getProtocolMetadata() {
    let deviceTime = null;
    let deviceTimeSource = null;

    try {
      if (this.radioTime) {
        deviceTime = this.radioTime;
        deviceTimeSource = this.radioTimeSource;
      } else if (this.nodeInfo?.position?.time) {
        deviceTime = new Date(this.nodeInfo.position.time * 1000);
        deviceTimeSource = 'gps';
      } else if (this.lastMessageTime) {
        deviceTime = this.lastMessageTime;
        deviceTimeSource = 'message';
      }
    } catch (e) {
      // Ignore errors
    }

    return {
      firmware: this.device?.deviceStatus?.firmware || 'unknown',
      hardware: this.nodeInfo?.hwModel || 'unknown',
      deviceTime: deviceTime,
      deviceTimeSource: deviceTimeSource,
      connectionType: 'wifi',
      hostAddress: this.hostAddress,
      useTLS: this.useTLS,
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
      0: 'Unset', 1: 'US', 2: 'EU_433', 3: 'EU_868', 4: 'CN', 5: 'JP',
      6: 'ANZ', 7: 'KR', 8: 'TW', 9: 'RU', 10: 'IN', 11: 'NZ_865',
      12: 'TH', 13: 'LORA_24', 14: 'UA_433', 15: 'UA_868'
    };
    return regions[region] || `Unknown (${region})`;
  }

  getModemPresetName(preset) {
    const presets = {
      0: 'Long Fast', 1: 'Long Slow', 2: 'Very Long Slow', 3: 'Medium Slow',
      4: 'Medium Fast', 5: 'Short Slow', 6: 'Short Fast', 7: 'Long Moderate'
    };
    return presets[preset] || `Unknown (${preset})`;
  }

  getHwModelName(model) {
    const models = {
      0: 'Unset', 1: 'TLORA_V2', 2: 'TLORA_V1', 3: 'TLORA_V2_1_1p6', 4: 'TBEAM',
      5: 'HELTEC_V2_0', 6: 'TBEAM_V0p7', 7: 'T_ECHO', 8: 'TLORA_V1_1p3', 9: 'RAK4631',
      10: 'HELTEC_V2_1', 11: 'HELTEC_V1', 42: 'HELTEC_V3', 43: 'HELTEC_WSL_V3',
      47: 'HELTEC_WIRELESS_TRACKER', 48: 'HELTEC_WIRELESS_PAPER', 49: 'T_DECK',
      50: 'T_WATCH_S3', 58: 'T_BEAM_SUPREME', 255: 'PRIVATE_HW'
    };
    return models[model] || `Unknown (${model})`;
  }
}
