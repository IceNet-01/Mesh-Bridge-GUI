/**
 * Meshtastic Protocol Handler
 *
 * Implements BaseProtocol for Meshtastic radios using official @meshtastic libraries
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';
import { create, toBinary } from '@bufbuild/protobuf';
import * as Protobuf from '@meshtastic/protobufs';

export class MeshtasticProtocol extends BaseProtocol {
  constructor(radioId, portPath, options = {}) {
    super(radioId, portPath, options);
    this.transport = null;
    this.device = null;
    this.channelMap = new Map();
    this.loraConfig = null;
    this.myNodeNum = null; // Store our own node number for loop prevention

    // Node Catalog - Single source of truth for all node data
    // Key: numeric node number, Value: complete node object
    this.nodeCatalog = new Map();

    // Timers for periodic tasks
    this.nodesScanInterval = null;
    this.radioTimeUpdateInterval = null;

    // Track last message time for device time fallback
    this.lastMessageTime = null;

    // Track radio's actual time (updated from packets)
    this.radioTime = null;
    this.radioTimeSource = null;
    this.radioTimeUpdated = null; // When we last updated radio time
  }

  getProtocolName() {
    return 'meshtastic';
  }

  /**
   * Normalize node ID to consistent hex format with "!" prefix
   * This ensures all node IDs use the same format regardless of packet type
   * @param {number} nodeNum - Numeric node number
   * @returns {string} Normalized node ID in format "!xxxxxxxx"
   */
  normalizeNodeId(nodeNum) {
    if (typeof nodeNum !== 'number') {
      console.warn(`[Meshtastic] Invalid nodeNum type: ${typeof nodeNum}, value:`, nodeNum);
      return 'unknown';
    }
    // Convert to hex and pad to 8 characters, add "!" prefix
    return '!' + nodeNum.toString(16).padStart(8, '0');
  }

  /**
   * Update node catalog with new data
   * Intelligently merges data from different sources without losing information
   *
   * @param {number} nodeNum - Numeric node number
   * @param {Object} update - Partial node data to merge
   * @param {string} source - Source of update (e.g., 'NodeInfo', 'Telemetry', 'Position', 'Scan')
   * @returns {Object} Complete merged node data
   */
  updateNodeCatalog(nodeNum, update, source = 'Unknown') {
    if (typeof nodeNum !== 'number') {
      console.warn(`[Meshtastic] Cannot update catalog - invalid nodeNum:`, nodeNum);
      return null;
    }

    const nodeId = this.normalizeNodeId(nodeNum);

    // Get existing node or create new entry
    let node = this.nodeCatalog.get(nodeNum);

    if (!node) {
      // Create new catalog entry with defaults
      node = {
        nodeId: nodeId,
        num: nodeNum,
        longName: 'Unknown',
        shortName: '????',
        hwModel: 'Unknown',
        lastHeard: new Date(),
        // Timestamps for different data types
        _timestamps: {
          userInfo: null,
          position: null,
          telemetry: null,
          lastSeen: new Date()
        }
      };
      console.log(`[Meshtastic] 📝 Creating new catalog entry for ${nodeId} (source: ${source})`);
    }

    // Update lastSeen timestamp
    node._timestamps.lastSeen = new Date();
    node.lastHeard = new Date();

    // SMART MERGE: Only update fields that have meaningful new data

    // User identification - never overwrite good data with placeholders
    if (update.longName && update.longName !== 'Unknown' && update.longName !== node.longName) {
      node.longName = update.longName;
      node._timestamps.userInfo = new Date();
      console.log(`[Meshtastic] 👤 Updated name: ${nodeId} → "${update.longName}" (source: ${source})`);
    }

    if (update.shortName && update.shortName !== '????' && update.shortName !== node.shortName) {
      node.shortName = update.shortName;
      node._timestamps.userInfo = new Date();
    }

    if (update.hwModel && update.hwModel !== 'Unknown' && update.hwModel !== node.hwModel) {
      node.hwModel = update.hwModel;
      node._timestamps.userInfo = new Date();
    }

    // Position - update if new position data provided
    if (update.position && (update.position.latitude || update.position.longitude)) {
      node.position = {
        ...node.position,
        ...update.position
      };
      node._timestamps.position = new Date();
    }

    // Telemetry - always update if provided (newer data)
    const telemetryFields = [
      'batteryLevel', 'voltage', 'channelUtilization', 'airUtilTx', 'uptimeSeconds',
      'temperature', 'humidity', 'pressure', 'gasResistance', 'iaq',
      'ch1Voltage', 'ch1Current', 'ch2Voltage', 'ch2Current', 'ch3Voltage', 'ch3Current',
      'pm10Standard', 'pm25Standard', 'pm100Standard'
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

    // SNR - always update if provided
    if (update.snr !== undefined) {
      node.snr = update.snr;
    }

    // Store back in catalog
    this.nodeCatalog.set(nodeNum, node);

    return node;
  }

  /**
   * Get node from catalog
   * @param {number} nodeNum - Numeric node number
   * @returns {Object|null} Node data or null if not found
   */
  getNodeFromCatalog(nodeNum) {
    return this.nodeCatalog.get(nodeNum) || null;
  }

  /**
   * Get all nodes from catalog
   * @returns {Array} Array of all node objects
   */
  getAllNodesFromCatalog() {
    return Array.from(this.nodeCatalog.values());
  }

  async connect() {
    try {
      console.log(`[Meshtastic] Connecting to ${this.portPath}...`);

      // Check if we have an existing device/transport from detection (aggressive connection reuse)
      if (this.options.device && this.options.transport) {
        console.log(`[Meshtastic] 🔄 Reusing existing connection (already configured)`);
        this.device = this.options.device;
        this.transport = this.options.transport;

        // Subscribe to events AFTER we have the device
        this.setupEventHandlers();

        // Device is already configured from detection, skip configure()
        console.log(`[Meshtastic] Using pre-configured device`);
      } else {
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
      }

      // Set up heartbeat to keep serial connection alive (15 min timeout otherwise)
      this.device.setHeartbeatInterval(30000); // Send heartbeat every 30 seconds
      console.log(`[Meshtastic] Heartbeat enabled`);

      // Set up periodic node scan to extract node info from device.nodes
      // This ensures we get node data even if NodeInfoPacket events don't fire
      this.nodesScanInterval = setInterval(() => {
        this.scanAndEmitNodes();
      }, 60000); // Scan every 60 seconds
      console.log(`[Meshtastic] Periodic node scan enabled (60s interval)`);

      // Set up periodic radio status updates to keep UI time display fresh
      // Emit radio update every 10 seconds to refresh device time display
      this.radioTimeUpdateInterval = setInterval(() => {
        if (this.nodeInfo) {
          this.updateNodeInfo(this.nodeInfo);
        }
      }, 10000); // Every 10 seconds
      console.log(`[Meshtastic] Periodic radio time updates enabled (10s interval)`);

      this.connected = true;

      // Fetch node info with retry logic - device.nodes may not be populated immediately
      console.log(`[Meshtastic] 🔄 Connection established, calling fetchAndEmitDeviceInfo...`);
      this.fetchAndEmitDeviceInfo(0); // Start with 0 retries
      // Also do initial node scan after short delay
      setTimeout(() => this.scanAndEmitNodes(), 5000);

      // Sync device time with computer time (after connection is fully established)
      setTimeout(() => this.syncDeviceTime(), 2000); // Delay 2 seconds to ensure radio is ready

      console.log(`[Meshtastic] Successfully connected to ${this.portPath}`);

      return true;
    } catch (error) {
      console.error(`[Meshtastic] Connection failed:`, error);

      // Clean up any partial connection on error
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
        console.error(`[Meshtastic] Error during cleanup:`, cleanupError);
      }

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

    // Subscribe to ALL mesh packets (reduced logging for performance)
    this.device.events.onMeshPacket.subscribe((packet) => {
      // Only log text messages for debugging, suppress telemetry/position spam
      if (packet.decoded?.portnum === 3) { // TEXT_MESSAGE_APP
        const nodeId = this.normalizeNodeId(packet.from);
        console.log(`[Meshtastic] 📦 Text message from ${nodeId} on channel ${packet.channel}`);
      }
      // All other packet types are handled silently by their specific event handlers
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

        // Track last message time for device time fallback
        this.lastMessageTime = new Date();

        const normalized = this.normalizeMessagePacket(packet);
        this.emitMessage(normalized);
      } catch (error) {
        console.error('[Meshtastic] Error handling message packet:', error);
        this.handleError(error);
      }
    });

    // Subscribe to node info updates
    this.device.events.onMyNodeInfo.subscribe((myNodeInfo) => {
      console.log(`[Meshtastic] 🆔 onMyNodeInfo event fired!`, {
        myNodeNum: myNodeInfo.myNodeNum,
        hasUser: !!myNodeInfo.user,
        longName: myNodeInfo.user?.longName
      });

      try {
        // Store raw node number for loop prevention
        this.myNodeNum = myNodeInfo.myNodeNum;
        console.log(`[Meshtastic] ✅ Stored myNodeNum: ${this.myNodeNum}`);

        // Try to get full node info from our catalog first (most reliable)
        const myNode = this.nodeCatalog.get(myNodeInfo.myNodeNum);
        if (myNode && myNode.longName) {
          // Have complete node info from catalog - use it!
          const nodeInfo = {
            nodeId: this.normalizeNodeId(myNodeInfo.myNodeNum),
            longName: myNode.longName,
            shortName: myNode.shortName || '????',
            hwModel: myNode.hwModel || 'Unknown'
          };
          this.updateNodeInfo(nodeInfo);
          console.log(`[Meshtastic] Node info from catalog:`, nodeInfo);
          return; // Done - have complete info
        }

        // Fallback: Use myNodeInfo.user if available (may be incomplete)
        if (myNodeInfo.user && myNodeInfo.user.longName) {
          const nodeInfo = {
            nodeId: this.normalizeNodeId(myNodeInfo.myNodeNum),
            longName: myNodeInfo.user.longName,
            shortName: myNodeInfo.user.shortName || '????',
            hwModel: this.getHwModelName(myNodeInfo.user.hwModel) || 'Unknown'
          };
          console.log(`[Meshtastic] 🎯 Using myNodeInfo.user directly:`, nodeInfo);
          this.updateNodeInfo(nodeInfo);
          console.log(`[Meshtastic] ✅ Node info set from myNodeInfo.user`);
        } else {
          // No complete data yet - will be updated when NodeInfoPacket arrives
          console.log(`[Meshtastic] ⏳ Node number set to ${myNodeInfo.myNodeNum}, waiting for complete user info...`);
        }
      } catch (error) {
        console.error('[Meshtastic] ❌ Error handling node info:', error);
        this.handleError(error);
      }
    });

    // Subscribe to node info packets (includes our own node with full user details)
    this.device.events.onNodeInfoPacket.subscribe((node) => {
      console.log(`[Meshtastic] 📱 NodeInfoPacket received for node ${node.num}`, {
        hasUser: !!node.user,
        longName: node.user?.longName,
        myNodeNum: this.myNodeNum,
        deviceNodeNum: this.device?.nodeNum
      });

      // Check if this is our own node - use this.myNodeNum which is set by onMyNodeInfo
      if (this.myNodeNum && node.num === this.myNodeNum && node.user && node.user.longName) {
        console.log(`[Meshtastic] 🎉 Received full node info for our own radio!`);
        const nodeInfo = {
          nodeId: this.normalizeNodeId(node.num),
          longName: node.user.longName,
          shortName: node.user.shortName || '????',
          hwModel: this.getHwModelName(node.user.hwModel) || 'Unknown'
        };
        console.log(`[Meshtastic] 🎯 Calling updateNodeInfo for our radio:`, nodeInfo);
        this.updateNodeInfo(nodeInfo);
        console.log(`[Meshtastic] ✅ Successfully updated our radio's node info`);
      } else if (node.num === this.myNodeNum) {
        console.log(`[Meshtastic] ⏳ NodeInfoPacket for our node but missing user data yet`);
      }

      // Update node catalog with data from NodeInfoPacket
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
          // Try both camelCase and snake_case field names for environmental data
          temperature: node.environmentMetrics?.temperature || node.deviceMetrics?.temperature,
          humidity: node.environmentMetrics?.relativeHumidity || node.environmentMetrics?.relative_humidity,
          pressure: node.environmentMetrics?.barometricPressure || node.environmentMetrics?.barometric_pressure,
        };

        const catalogedNode = this.updateNodeCatalog(node.num, update, 'NodeInfoPacket');
        if (catalogedNode) {
          this.emit('node', catalogedNode);
        }

        // Also emit as nodeinfo packet for potential forwarding
        // Skip our own radio's announcements (already filtered in bridge server)
        this.emit('nodeinfo-packet', {
          from: node.num,
          data: node.user,
          channel: 0, // Node announcements typically on channel 0
          timestamp: new Date()
        });
      }
    });

    // Subscribe to position packets
    this.device.events.onPositionPacket.subscribe((positionPacket) => {
      try {
        // If this is from our own radio and has GPS time, update radio time (silent)
        if (this.myNodeNum && positionPacket.from === this.myNodeNum && positionPacket.data?.time) {
          this.radioTime = new Date(positionPacket.data.time * 1000);
          this.radioTimeSource = 'gps';
          this.radioTimeUpdated = new Date();
        }

        if (positionPacket.data && (positionPacket.data.latitudeI || positionPacket.data.longitudeI)) {
          // Update node catalog with position data
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
        console.error('[Meshtastic] Error handling position packet:', error);
      }
    });

    // Subscribe to telemetry packets (device metrics)
    this.device.events.onTelemetryPacket.subscribe((telemetryPacket) => {
      try {
        // If this is from our own radio, update radio time (silent)
        if (this.myNodeNum && telemetryPacket.from === this.myNodeNum) {
          this.radioTime = new Date();
          this.radioTimeSource = 'telemetry';
          this.radioTimeUpdated = new Date();
        }

        const data = telemetryPacket.data;
        const update = {};

        if (!data.variant || !data.variant.case) {
          return; // Skip packets without variant data
        }

        // Handle different telemetry types based on variant.case
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

          case 'powerMetrics': {
            const metrics = data.variant.value;
            update.ch1Voltage = metrics.ch1Voltage;
            update.ch1Current = metrics.ch1Current;
            update.ch2Voltage = metrics.ch2Voltage;
            update.ch2Current = metrics.ch2Current;
            update.ch3Voltage = metrics.ch3Voltage;
            update.ch3Current = metrics.ch3Current;
            break;
          }

          case 'airQualityMetrics': {
            const metrics = data.variant.value;
            update.pm10Standard = metrics.pm10Standard;
            update.pm25Standard = metrics.pm25Standard;
            update.pm100Standard = metrics.pm100Standard;
            break;
          }

          case 'localStats': {
            // Local stats - can add handling if needed
            break;
          }

          default:
            // Unknown telemetry type - skip silently
            return;
        }

        // Update catalog with telemetry data
        const catalogedNode = this.updateNodeCatalog(telemetryPacket.from, update, 'TelemetryPacket');

        if (catalogedNode) {
          this.emit('node', catalogedNode);
        }
      } catch (error) {
        console.error('[Meshtastic] Error handling telemetry packet:', error);
      }
    });

    // Subscribe to user packets (for node name/info updates)
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
        console.error('[Meshtastic] Error handling user packet:', error);
      }
    });

    // Subscribe to routing packets (for neighbor info) - silently processed
    this.device.events.onRoutingPacket.subscribe((routingPacket) => {
      // Routing packets contain neighbor info - could be used for mesh topology
      // Processed silently to reduce log spam
    });

    // Subscribe to waypoint packets
    this.device.events.onWaypointPacket.subscribe((waypointPacket) => {
      // Check if this is an emergency/SOS waypoint (icon 16 = SOS)
      if (waypointPacket.data?.icon === 16) {
        console.log(`🚨 EMERGENCY/SOS waypoint detected from node ${waypointPacket.from}!`);
        this.emit('emergency', {
          from: waypointPacket.from,
          waypoint: waypointPacket.data
        });
      }
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

    // Subscribe to config packets (includes all config types)
    this.device.events.onConfigPacket.subscribe((configPacket) => {
      try {
        console.log(`[Meshtastic] 📦 Config packet received:`, Object.keys(configPacket));

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
            paFanDisabled: configPacket.lora.paFanDisabled,
            ignoreMqtt: configPacket.lora.ignoreMqtt
          };

          console.log(`[Meshtastic] LoRa config:`, {
            region: this.getRegionName(this.loraConfig.region),
            modemPreset: this.getModemPresetName(this.loraConfig.modemPreset),
            txPower: this.loraConfig.txPower,
            hopLimit: this.loraConfig.hopLimit
          });

          // Emit config event so bridge server can update clients
          this.emit('config', { configType: 'lora', config: this.loraConfig });
        }

        // Check for Device config
        if (configPacket.device) {
          console.log(`[Meshtastic] Device config received:`, configPacket.device);
          this.emit('config', { configType: 'device', config: configPacket.device });
        }

        // Check for Position config
        if (configPacket.position) {
          console.log(`[Meshtastic] Position config received:`, configPacket.position);
          this.emit('config', { configType: 'position', config: configPacket.position });
        }

        // Check for Power config
        if (configPacket.power) {
          console.log(`[Meshtastic] Power config received:`, configPacket.power);
          this.emit('config', { configType: 'power', config: configPacket.power });
        }

        // Check for Network config
        if (configPacket.network) {
          console.log(`[Meshtastic] Network config received:`, configPacket.network);
          this.emit('config', { configType: 'network', config: configPacket.network });
        }

        // Check for Display config
        if (configPacket.display) {
          console.log(`[Meshtastic] Display config received:`, configPacket.display);
          this.emit('config', { configType: 'display', config: configPacket.display });
        }

        // Check for Bluetooth config
        if (configPacket.bluetooth) {
          console.log(`[Meshtastic] Bluetooth config received:`, configPacket.bluetooth);
          this.emit('config', { configType: 'bluetooth', config: configPacket.bluetooth });
        }
      } catch (error) {
        console.error('[Meshtastic] Error handling config packet:', error);
        this.handleError(error);
      }
    });
  }

  /**
   * Fetch and emit device info from the device object
   * This is called after configure() to ensure we get node info and channels
   * even if the event subscriptions don't fire properly
   * @param {number} retryCount - Current retry attempt (0-based)
   */
  fetchAndEmitDeviceInfo(retryCount = 0) {
    try {
      const maxRetries = 5;
      const retryDelay = Math.min(500 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s

      // Only log on first attempt to reduce spam
      if (retryCount === 0) {
        console.log(`[Meshtastic] 🔍 Fetching device info from catalog...`);
      }

      // Check if we have myNodeNum (set by onMyNodeInfo event)
      // Note: device.nodeNum does NOT exist in @meshtastic/core - we use this.myNodeNum instead
      if (this.myNodeNum) {
        // Try to get node info from our catalog
        const myNode = this.nodeCatalog.get(this.myNodeNum);

        if (myNode && myNode.longName) {
          const nodeInfo = {
            nodeId: this.normalizeNodeId(this.myNodeNum),
            longName: myNode.longName,
            shortName: myNode.shortName || '????',
            hwModel: myNode.hwModel || 'Unknown'
          };
          this.updateNodeInfo(nodeInfo);
          console.log(`[Meshtastic] ✅ Device info ready: ${myNode.longName} (${nodeInfo.nodeId})`);
        } else if (retryCount < maxRetries) {
          // Node number set but catalog not populated yet, retry
          setTimeout(() => {
            this.fetchAndEmitDeviceInfo(retryCount + 1);
          }, retryDelay);
          return;
        }
      } else if (retryCount < maxRetries) {
        // myNodeNum not set yet (onMyNodeInfo hasn't fired), retry
        setTimeout(() => {
          this.fetchAndEmitDeviceInfo(retryCount + 1);
        }, retryDelay);
        return;
      }

      // Get channels from device
      if (this.device && this.device.channels) {
        console.log(`[Meshtastic] Found ${this.device.channels.length} channels in device object`);
        this.device.channels.forEach((channel, index) => {
          if (channel && channel.settings) {
            const channelInfo = {
              index: index,
              role: channel.role,
              name: channel.settings.name || '',
              psk: channel.settings.psk ? Buffer.from(channel.settings.psk).toString('base64') : ''
            };
            this.channelMap.set(index, channelInfo);
            console.log(`[Meshtastic] Channel ${index}: "${channelInfo.name || '(unnamed)'}"`);
          }
        });

        // Emit channels
        const channelsArray = Array.from(this.channelMap.values());
        if (channelsArray.length > 0) {
          this.updateChannels(channelsArray);
          console.log(`[Meshtastic] Emitted ${channelsArray.length} channels`);
        }
      }

      // Get config from device
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
        console.log(`[Meshtastic] LoRa config fetched:`, {
          region: this.getRegionName(this.loraConfig.region),
          modemPreset: this.getModemPresetName(this.loraConfig.modemPreset)
        });
        this.emit('config', this.loraConfig);
      }

      console.log(`[Meshtastic] Device info fetch complete`);
    } catch (error) {
      console.error('[Meshtastic] Error fetching device info:', error);
    }
  }

  /**
   * Update and emit node info for this radio
   */
  updateNodeInfo(nodeInfo) {
    this.nodeInfo = nodeInfo;
    this.emit('nodeInfo', nodeInfo);
  }

  /**
   * Scan node catalog and re-emit all known nodes
   * This ensures clients get periodic updates for all nodes we know about
   */
  scanAndEmitNodes() {
    try {
      if (this.nodeCatalog.size === 0) {
        return; // Skip silently if catalog empty
      }

      // Silently emit all nodes to keep clients updated
      this.nodeCatalog.forEach((node) => {
        this.emit('node', node);
      });
    } catch (error) {
      console.error('[Meshtastic] Error scanning nodes:', error);
    }
  }

  async disconnect() {
    try {
      console.log(`[Meshtastic] Disconnecting from ${this.portPath}...`);

      // Clear periodic node scan interval
      if (this.nodesScanInterval) {
        clearInterval(this.nodesScanInterval);
        this.nodesScanInterval = null;
        console.log(`[Meshtastic] Periodic node scan disabled`);
      }

      // Clear periodic radio time update interval
      if (this.radioTimeUpdateInterval) {
        clearInterval(this.radioTimeUpdateInterval);
        this.radioTimeUpdateInterval = null;
        console.log(`[Meshtastic] Periodic radio time updates disabled`);
      }

      // Disconnect device first (stops heartbeat and message processing)
      if (this.device) {
        try {
          await this.device.disconnect();
          console.log(`[Meshtastic] Device disconnected`);
        } catch (deviceError) {
          console.error(`[Meshtastic] Error disconnecting device:`, deviceError);
          // Continue with cleanup even if device disconnect fails
        }
        this.device = null;
      }

      // Explicitly close the serial port to release the lock
      if (this.transport && this.transport.port) {
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.log(`[Meshtastic] Port close timeout, forcing cleanup`);
              resolve(); // Don't reject, just continue
            }, 2000);

            // Check if port is already closed
            if (!this.transport.port.isOpen) {
              clearTimeout(timeout);
              console.log(`[Meshtastic] Port already closed`);
              resolve();
              return;
            }

            this.transport.port.close((err) => {
              clearTimeout(timeout);
              if (err) {
                console.error(`[Meshtastic] Error closing port:`, err);
                // Don't reject - we want to continue cleanup
              } else {
                console.log(`[Meshtastic] Serial port closed`);
              }
              resolve();
            });
          });
        } catch (portError) {
          console.error(`[Meshtastic] Error during port cleanup:`, portError);
          // Continue with cleanup
        }
      }

      this.transport = null;
      this.connected = false;
      console.log(`[Meshtastic] Disconnected successfully from ${this.portPath}`);
    } catch (error) {
      console.error('[Meshtastic] Error during disconnect:', error);
      // Mark as disconnected even if there was an error
      this.connected = false;
      this.device = null;
      this.transport = null;
      // Don't throw - we want disconnect to always succeed
    }
  }

  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      // Check if device is configured
      console.log('[Meshtastic] 🔍 Checking device configuration before send:', {
        hasNodeInfo: !!this.nodeInfo,
        nodeInfoKeys: this.nodeInfo ? Object.keys(this.nodeInfo) : [],
        nodeId: this.nodeInfo?.nodeId,
        longName: this.nodeInfo?.longName
      });

      if (!this.nodeInfo || !this.nodeInfo.nodeId) {
        console.log('[Meshtastic] ❌ Device not configured - nodeInfo check failed');
        throw new Error('Device not fully configured yet. Please wait a few seconds and try again.');
      }

      // Validate channel exists
      const availableChannels = Array.from(this.channelMap.keys());
      console.log(`[Meshtastic] Available channels:`, availableChannels);
      console.log(`[Meshtastic] Requested channel:`, channel);

      if (!this.channelMap.has(channel)) {
        throw new Error(`Channel ${channel} not found. Available channels: ${availableChannels.join(', ')}`);
      }

      const channelConfig = this.channelMap.get(channel);
      console.log(`[Meshtastic] Channel ${channel} config:`, {
        name: channelConfig.name,
        role: channelConfig.role,
        hasPSK: !!channelConfig.psk && channelConfig.psk.length > 0
      });

      const { wantAck = false } = options;

      // Get hop limit from LoRa config, default to 3 if not set
      const hopLimit = this.loraConfig?.hopLimit ?? 3;

      console.log(`[Meshtastic] Sending text: "${text}" on channel ${channel} (broadcast)`);
      console.log(`[Meshtastic] Send parameters:`, {
        text,
        destination: 'broadcast',
        wantAck,
        channel,
        hopLimit
      });

      // IMPORTANT: We must manually construct the packet with hopLimit
      // because @meshtastic/core's sendText/sendPacket doesn't set hopLimit,
      // which causes it to default to 0 (no mesh forwarding).
      // This was causing messages to stop at the first device.

      // Encode the text message
      const enc = new TextEncoder();
      const textBytes = enc.encode(text);

      // Create MeshPacket with hopLimit explicitly set
      const meshPacket = create(Protobuf.Mesh.MeshPacketSchema, {
        payloadVariant: {
          case: 'decoded',
          value: {
            payload: textBytes,
            portnum: Protobuf.Portnums.PortNum.TEXT_MESSAGE_APP,
            wantResponse: false,
            dest: 0,
            requestId: 0,
            source: 0,
          },
        },
        from: this.nodeInfo.myNodeNum,
        to: 0xFFFFFFFF, // Broadcast address
        id: this.generateRandId(),
        wantAck,
        channel,
        hopLimit, // Set hop limit from LoRa config
      });

      // Wrap in ToRadio message
      const toRadioMessage = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: {
          case: 'packet',
          value: meshPacket,
        },
      });

      // Send the packet
      const result = await this.device.sendRaw(
        toBinary(Protobuf.Mesh.ToRadioSchema, toRadioMessage),
        meshPacket.id
      );

      console.log(`[Meshtastic] Message sent with hop limit ${hopLimit}, packet ID:`, result);

      this.stats.messagesSent++;
      console.log(`[Meshtastic] ✅ Text broadcast successfully on channel ${channel}`);

      return true;
    } catch (error) {
      console.error('[Meshtastic] ❌ Error sending message:', error);
      console.error('[Meshtastic] Error type:', typeof error);
      console.error('[Meshtastic] Error constructor:', error?.constructor?.name);

      // Try to log error details
      try {
        console.error('[Meshtastic] Error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      } catch (e) {
        console.error('[Meshtastic] Could not stringify error');
      }

      // Provide better error messages for common Meshtastic error codes
      let errorMsg = 'Unknown error';

      // Handle various error formats
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'number') {
        // Direct error code
        if (error === 3) {
          errorMsg = 'Device not ready. Please wait for device configuration to complete.';
        } else if (error === 2) {
          errorMsg = 'Invalid channel. Please check channel number.';
        } else if (error === 1) {
          errorMsg = 'Message queue full. Please wait and try again.';
        } else {
          errorMsg = `Meshtastic error code: ${error}`;
        }
      } else if (typeof error === 'object' && error !== null) {
        // Error object from Meshtastic library: { id: ..., error: 3 }
        // Check error.error property first (most common format)
        const errorCode = error.error || error.code || error.errorCode || error.status;

        if (errorCode === 3) {
          errorMsg = 'Device not ready. Please wait for device configuration to complete.';
        } else if (errorCode === 2) {
          errorMsg = 'Invalid channel. Please check channel number.';
        } else if (errorCode === 1) {
          errorMsg = 'Message queue full. Please wait and try again.';
        } else {
          // Try to get a message from various properties
          const msg = error.message || error.msg || error.description;
          if (msg) {
            errorMsg = String(msg);
          } else {
            // No message, show the error object
            try {
              errorMsg = `Send failed: ${JSON.stringify(error)}`;
            } catch (e) {
              errorMsg = `Send failed: ${String(error)}`;
            }
          }
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
   * Get channel configuration from the radio
   * @param {number} channelIndex - Channel index (0-7)
   * @returns {Promise<Object>} Channel configuration
   */
  async getChannel(channelIndex) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[Channel Config] 📻 Getting channel ${channelIndex} configuration...`);

      // Create AdminMessage with get_channel_request
      // Index is 1-based in protobuf (0 = primary channel)
      const getChannelMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
          case: 'getChannelRequest',
          value: channelIndex + 1  // Convert to 1-based index
        }
      });

      console.log(`[Channel Config] 📦 AdminMessage Structure:`, JSON.stringify(getChannelMessage, null, 2));

      // Serialize the message
      const adminBytes = toBinary(Protobuf.Admin.AdminMessageSchema, getChannelMessage);

      console.log(`[Channel Config] 🔧 Serialized to ${adminBytes.length} bytes`);

      // Send to radio - response will come via onChannelPacket event
      console.log(`[Channel Config] 📡 Sending get channel request...`);
      const packetId = await this.device.sendPacket(
        adminBytes,
        Protobuf.Portnums.PortNum.ADMIN_APP,
        'self',
        0,
        false,  // wantAck - don't wait for ACK to avoid timeout
        false   // wantResponse - response comes via onChannelPacket event
      );

      console.log(`[Channel Config] ✅ Request sent, packet ID: ${packetId}, waiting for response via onChannelPacket event`);

      // Note: Response will come via onChannelPacket event
      return { success: true, packetId };
    } catch (error) {
      console.error('[Channel Config] ❌ Error getting channel:', error);
      throw error;
    }
  }

  /**
   * Set channel configuration on the radio
   * @param {Object} channelConfig - Channel configuration object
   * @returns {Promise<boolean>} Success status
   */
  async setChannel(channelConfig) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[Channel Config] 📻 Setting channel configuration...`);
      console.log(`[Channel Config] 📦 Channel config:`, JSON.stringify(channelConfig, null, 2));

      // Convert PSK from plain object to Uint8Array if needed
      // When sent over WebSocket, Uint8Array becomes a plain object like {"0": 1, "1": 2, ...}
      if (channelConfig.settings?.psk && typeof channelConfig.settings.psk === 'object') {
        // Check if it's already a Uint8Array
        if (!(channelConfig.settings.psk instanceof Uint8Array)) {
          // Convert plain object to Uint8Array
          const pskArray = Object.values(channelConfig.settings.psk);
          channelConfig.settings.psk = new Uint8Array(pskArray);
          console.log(`[Channel Config] 🔧 Converted PSK from object to Uint8Array (${channelConfig.settings.psk.length} bytes)`);
        }
      }

      // Convert role from string to enum value
      // Meshtastic Channel.Role enum: 0 = SECONDARY, 1 = PRIMARY, 2 = DISABLED
      if (typeof channelConfig.role === 'string') {
        const roleMap = {
          'PRIMARY': 1,
          'SECONDARY': 0,
          'DISABLED': 2
        };
        const roleString = channelConfig.role;
        const roleValue = roleMap[channelConfig.role];
        if (roleValue !== undefined) {
          channelConfig.role = roleValue;
          console.log(`[Channel Config] 🔧 Converted role from "${roleString}" to ${roleValue}`);
        }
      }

      // Create Channel protobuf message
      const channelMessage = create(Protobuf.Channel.ChannelSchema, channelConfig);

      // Create AdminMessage with set_channel
      const setChannelMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
          case: 'setChannel',
          value: channelMessage
        }
      });

      console.log(`[Channel Config] 📦 AdminMessage Structure:`, JSON.stringify(setChannelMessage, null, 2));

      // Serialize the message
      const adminBytes = toBinary(Protobuf.Admin.AdminMessageSchema, setChannelMessage);

      console.log(`[Channel Config] 🔧 Serialized to ${adminBytes.length} bytes`);
      console.log(`[Channel Config] 📊 Hex Dump: ${Array.from(adminBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

      // Send to radio
      console.log(`[Channel Config] 📡 Sending set channel request...`);
      const packetId = await this.device.sendPacket(
        adminBytes,
        Protobuf.Portnums.PortNum.ADMIN_APP,
        'self',
        0,
        true,   // wantAck
        false   // wantResponse
      );

      console.log(`[Channel Config] ✅ Channel configuration sent, packet ID: ${packetId}`);

      return true;
    } catch (error) {
      console.error('[Channel Config] ❌ Error setting channel:', error);
      throw error;
    }
  }

  /**
   * Sync device time with computer time
   * Sends the current Unix timestamp to the radio so it has the correct time
   */
  async syncDeviceTime() {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      // Get current Unix timestamp (seconds since epoch)
      const currentTime = Math.floor(Date.now() / 1000);

      console.log(`[Meshtastic] ⏰ Syncing device time to ${new Date().toISOString()}...`);

      // Create AdminMessage with setTimeOnly
      const adminMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
          case: 'setTimeOnly',
          value: currentTime
        }
      });

      // Serialize the message
      const adminBytes = toBinary(Protobuf.Admin.AdminMessageSchema, adminMessage);

      // Send to radio
      const packetId = await this.device.sendPacket(
        adminBytes,
        Protobuf.Portnums.PortNum.ADMIN_APP,
        'self',
        0,
        false,  // wantAck - don't wait for ACK
        false   // wantResponse - no response expected
      );

      console.log(`[Meshtastic] ✅ Time sync sent successfully, packet ID: ${packetId}`);
      return true;
    } catch (error) {
      console.error('[Meshtastic] ❌ Error syncing device time:', error);
      // Don't throw - time sync failure shouldn't prevent connection
      return false;
    }
  }

  /**
   * Reboot the radio device
   * This will restart the Meshtastic radio
   */
  async rebootRadio() {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[Meshtastic] 🔄 Rebooting radio...`);

      // Send reboot command to the device
      await this.device.reboot();

      console.log(`[Meshtastic] ✅ Reboot command sent to radio`);

      // The device will disconnect after reboot, so mark as disconnected
      this.connected = false;

      return true;
    } catch (error) {
      console.error('[Meshtastic] ❌ Error rebooting radio:', error);
      throw error;
    }
  }

  /**
   * Get radio configuration
   * @param {string} configType - Type of config (lora, device, position, power, network, display, bluetooth)
   * @returns {Promise<Object>} Configuration object
   */
  async getConfig(configType) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[Radio Config] 📻 Getting ${configType} configuration...`);

      // Map config type to protobuf enum
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

      // Create AdminMessage with get_config_request
      const getConfigMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
          case: 'getConfigRequest',
          value: configTypeEnum
        }
      });

      console.log(`[Radio Config] 📦 AdminMessage Structure:`, JSON.stringify(getConfigMessage, null, 2));

      // Serialize the message
      const adminBytes = toBinary(Protobuf.Admin.AdminMessageSchema, getConfigMessage);

      console.log(`[Radio Config] 🔧 Serialized to ${adminBytes.length} bytes`);

      // Send to radio - response will come via onConfigPacket event
      console.log(`[Radio Config] 📡 Sending get config request...`);
      const packetId = await this.device.sendPacket(
        adminBytes,
        Protobuf.Portnums.PortNum.ADMIN_APP,
        'self',
        0,
        false,  // wantAck - don't wait for ACK to avoid timeout
        false   // wantResponse - response comes via onConfigPacket event
      );

      console.log(`[Radio Config] ✅ Request sent, packet ID: ${packetId}, waiting for response via onConfigPacket event`);

      // Note: Response will come via onConfigPacket event handler
      return { success: true, packetId };
    } catch (error) {
      console.error('[Radio Config] ❌ Error getting config:', error);
      throw error;
    }
  }

  /**
   * Set radio configuration
   * @param {string} configType - Type of config (lora, device, position, power, network, display, bluetooth)
   * @param {Object} config - Configuration object
   * @returns {Promise<boolean>} Success status
   */
  async setConfig(configType, config) {
    try {
      if (!this.connected || !this.device) {
        throw new Error('Device not connected');
      }

      console.log(`[Radio Config] 📻 Setting ${configType} configuration...`);
      console.log(`[Radio Config] 📦 Config data:`, JSON.stringify(config, null, 2));

      // Create config message based on type
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

      // Wrap in Config message
      const fullConfig = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
          case: configCase,
          value: configMessage
        }
      });

      // Create AdminMessage with set_config
      const setConfigMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
          case: 'setConfig',
          value: fullConfig
        }
      });

      console.log(`[Radio Config] 📦 AdminMessage Structure:`, JSON.stringify(setConfigMessage, null, 2));

      // Serialize the message
      const adminBytes = toBinary(Protobuf.Admin.AdminMessageSchema, setConfigMessage);

      console.log(`[Radio Config] 🔧 Serialized to ${adminBytes.length} bytes`);

      // Send to radio
      console.log(`[Radio Config] 📡 Sending set config request...`);
      const packetId = await this.device.sendPacket(
        adminBytes,
        Protobuf.Portnums.PortNum.ADMIN_APP,
        'self',
        0,
        true,   // wantAck
        false   // wantResponse
      );

      console.log(`[Radio Config] ✅ Configuration sent, packet ID: ${packetId}`);

      return true;
    } catch (error) {
      console.error('[Radio Config] ❌ Error setting config:', error);
      throw error;
    }
  }

  normalizeMessagePacket(packet) {
    // The @meshtastic/core library already decodes text messages
    // packet.data contains the decoded string for text messages
    const text = packet.data;

    return {
      id: packet.id || Date.now().toString(),
      timestamp: new Date(), // Always use current time to avoid timezone issues
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
    // Meshtastic channels match if PSK is the same (name matching not required)
    return channel1.psk === channel2.psk;
  }

  getProtocolMetadata() {
    // Get device time - use tracked radio time if available
    let deviceTime = null;
    let deviceTimeSource = null;

    try {
      if (this.radioTime) {
        // Use tracked radio time (updated from telemetry/GPS packets)
        deviceTime = this.radioTime;
        deviceTimeSource = this.radioTimeSource;
      } else if (this.nodeInfo?.position?.time) {
        // Fallback: Try to get device time from position time
        deviceTime = new Date(this.nodeInfo.position.time * 1000);
        deviceTimeSource = 'gps';
      } else if (this.lastMessageTime) {
        // Last fallback: use time from last received message
        deviceTime = this.lastMessageTime;
        deviceTimeSource = 'message';
      }
    } catch (e) {
      // Ignore errors getting device time
    }

    return {
      firmware: this.device?.deviceStatus?.firmware || 'unknown',
      hardware: this.nodeInfo?.hwModel || 'unknown',
      deviceTime: deviceTime, // Device's current time (Date object or null)
      deviceTimeSource: deviceTimeSource, // 'gps', 'telemetry', 'message', or null
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

  getHwModelName(model) {
    const models = {
      0: 'Unset',
      1: 'TLORA_V2',
      2: 'TLORA_V1',
      3: 'TLORA_V2_1_1p6',
      4: 'TBEAM',
      5: 'HELTEC_V2_0',
      6: 'TBEAM_V0p7',
      7: 'T_ECHO',
      8: 'TLORA_V1_1p3',
      9: 'RAK4631',
      10: 'HELTEC_V2_1',
      11: 'HELTEC_V1',
      12: 'LILYGO_TBEAM_S3_CORE',
      13: 'RAK11200',
      14: 'NANO_G1',
      15: 'TLORA_V2_1_1p8',
      16: 'TLORA_T3_S3',
      17: 'NANO_G1_EXPLORER',
      18: 'NANO_G2_ULTRA',
      19: 'LORA_TYPE',
      20: 'WIPHONE',
      21: 'WIO_WM1110',
      22: 'RAK2560',
      23: 'HELTEC_HRU_3601',
      24: 'STATION_G1',
      25: 'RAK11310',
      26: 'SENSELORA_RP2040',
      27: 'SENSELORA_S3',
      28: 'CANARYONE',
      29: 'RP2040_LORA',
      30: 'STATION_G2',
      31: 'LORA_RELAY_V1',
      32: 'NRF52840DK',
      33: 'PPR',
      34: 'GENIEBLOCKS',
      35: 'NRF52_UNKNOWN',
      36: 'PORTDUINO',
      37: 'ANDROID_SIM',
      38: 'DIY_V1',
      39: 'NRF52840_PCA10059',
      40: 'DR_DEV',
      41: 'M5STACK',
      42: 'HELTEC_V3',
      43: 'HELTEC_WSL_V3',
      44: 'BETAFPV_2400_TX',
      45: 'BETAFPV_900_NANO_TX',
      46: 'RPI_PICO',
      47: 'HELTEC_WIRELESS_TRACKER',
      48: 'HELTEC_WIRELESS_PAPER',
      49: 'T_DECK',
      50: 'T_WATCH_S3',
      51: 'PICOMPUTER_S3',
      52: 'HELTEC_HT62',
      53: 'EBYTE_ESP32_S3',
      54: 'ESP32_S3_PICO',
      55: 'CHATTER_2',
      56: 'HELTEC_WIRELESS_PAPER_V1_0',
      57: 'HELTEC_CAPSULE_SENSOR_V3',
      58: 'T_BEAM_SUPREME',
      59: 'UNPHONE',
      60: 'TD_LORAC',
      61: 'CDEBYTE_EORA_S3',
      62: 'TWC_MESH_V4',
      63: 'NRF52_PROMICRO_DIY',
      64: 'RADIOMASTER_900_BANDIT_NANO',
      65: 'HELTEC_VISION_MASTER_T190',
      66: 'HELTEC_VISION_MASTER_E213',
      67: 'HELTEC_VISION_MASTER_E290',
      68: 'HELTEC_MESH_NODE_T114',
      69: 'SENSECAP_INDICATOR',
      70: 'TRACKER_T1000_E',
      71: 'RAK3172',
      72: 'WIO_E5',
      73: 'RADIOMASTER_900_BANDIT',
      74: 'ME25LS01_4Y10TD',
      75: 'RP2040_FEATHER_RFM95',
      76: 'M5STACK_COREBASIC',
      77: 'M5STACK_CORE2',
      78: 'RPI_PICO2',
      79: 'M5STACK_CORES3',
      80: 'SEEED_XIAO_S3',
      81: 'BETAFPV_ELRS_MICRO_TX',
      82: 'PICOMPUTER_S3_WAVESHARE',
      83: 'RADIOMASTER_900_BANDIT_MICRO',
      84: 'HELTEC_CAPSULE_SENSOR_V3_NO_GPS',
      85: 'SWAN_R5',
      86: 'RP2350_LORA',
      87: 'WIPHONE2',
      88: 'HELTEC_ESP32C6',
      89: 'RAK3172_E22',
      90: 'RAK3172_E220',
      91: 'KIWIMESH',
      92: 'TD_LOWIFI',
      93: 'E22_900M30S_JP',
      94: 'NOMAD_STAR_METEOR_PRO',
      95: 'E22_400M30S',
      96: 'ICECHAT',
      97: 'DIY_V1_EU865',
      98: 'DIY_V1_JP_TX',
      99: 'DIY_V1_JP_RX',
      100: 'DIY_V1_NZ865',
      101: 'DIY_V1_EU433',
      102: 'DIY_V1_SE',
      103: 'DIY_V1_TW',
      104: 'DIY_V1_UK',
      105: 'EBYTE_E22_400M30S',
      106: 'FEATHER_OLED_BLE',
      107: 'FEATHER_OLED_WIFI',
      255: 'PRIVATE_HW'
    };
    return models[model] || `Unknown (${model})`;
  }

  /**
   * Generate a random packet ID
   * @returns {number} Random packet ID
   */
  generateRandId() {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }
}
