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

    // Subscribe to ALL mesh packets
    this.device.events.onMeshPacket.subscribe((packet) => {
      const nodeId = this.normalizeNodeId(packet.from);

      // Portnum 3 = TEXT_MESSAGE_APP, 4 = POSITION_APP, 7 = NODEINFO_APP,
      // 67 = TELEMETRY_APP, 71 = RANGE_TEST_APP, etc.
      const portnumName = packet.decoded?.portnum === 3 ? 'TEXT' :
                         packet.decoded?.portnum === 4 ? 'POSITION' :
                         packet.decoded?.portnum === 7 ? 'NODEINFO' :
                         packet.decoded?.portnum === 67 ? 'TELEMETRY' :
                         packet.decoded?.portnum;

      console.log(`[Meshtastic] 📦 MeshPacket from ${nodeId}: portnum=${portnumName} (${packet.decoded?.portnum}), channel=${packet.channel}, variant=${packet.decoded?.payloadVariant?.case}`);

      // Log FULL packet data for telemetry packets
      if (packet.decoded?.portnum === 67) {
        console.log(`[Meshtastic] 🌡️ TELEMETRY MeshPacket full data:`, JSON.stringify(packet, null, 2));
      }
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
      console.log(`[Meshtastic] Position packet:`, positionPacket);
      try {
        // If this is from our own radio and has GPS time, update radio time
        if (this.myNodeNum && positionPacket.from === this.myNodeNum && positionPacket.data?.time) {
          this.radioTime = new Date(positionPacket.data.time * 1000);
          this.radioTimeSource = 'gps';
          this.radioTimeUpdated = new Date();
          console.log(`[Meshtastic] ⏰ Updated radio time from GPS: ${this.radioTime.toISOString()}`);
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
      const nodeId = this.normalizeNodeId(telemetryPacket.from);
      console.log(`[Meshtastic] 📊 ═══════════════════════════════════════════════════════════════`);
      console.log(`[Meshtastic] 📊 TELEMETRY PACKET from ${nodeId} (num: ${telemetryPacket.from})`);
      console.log(`[Meshtastic] 📊 ═══════════════════════════════════════════════════════════════`);

      try {
        // If this is from our own radio, update radio time
        if (this.myNodeNum && telemetryPacket.from === this.myNodeNum) {
          // Telemetry from our own radio means "now" - update radio time
          this.radioTime = new Date();
          this.radioTimeSource = 'telemetry';
          this.radioTimeUpdated = new Date();
          console.log(`[Meshtastic] ⏰ Updated radio time from own telemetry: ${this.radioTime.toISOString()}`);
        }

        // Log the COMPLETE telemetry packet structure
        console.log(`[Meshtastic] 🔍 FULL TelemetryPacket structure:`, JSON.stringify(telemetryPacket, null, 2));

        const data = telemetryPacket.data;
        const update = {};

        // The telemetry data uses a variant (discriminated union) pattern
        // data.variant.case tells us which type of telemetry
        // data.variant.value contains the actual metrics
        console.log(`[Meshtastic] 📊 Telemetry variant type: ${data.variant?.case || 'none'}`);

        if (!data.variant || !data.variant.case) {
          console.warn(`[Meshtastic] ⚠️ Telemetry packet has no variant data`);
          return;
        }

        // Handle different telemetry types based on variant.case
        switch (data.variant.case) {
          case 'deviceMetrics': {
            const metrics = data.variant.value;
            console.log(`[Meshtastic] 🔋 Device metrics:`, metrics);
            update.batteryLevel = metrics.batteryLevel;
            update.voltage = metrics.voltage;
            update.channelUtilization = metrics.channelUtilization;
            update.airUtilTx = metrics.airUtilTx;
            update.uptimeSeconds = metrics.uptimeSeconds;
            break;
          }

          case 'environmentMetrics': {
            const metrics = data.variant.value;
            console.log(`[Meshtastic] 🌡️ Environment metrics raw:`, metrics);
            console.log(`[Meshtastic] 🌡️ Environment metrics keys:`, Object.keys(metrics));

            // Extract environmental data (supports both camelCase and snake_case)
            update.temperature = metrics.temperature;
            update.humidity = metrics.relativeHumidity || metrics.relative_humidity;
            update.pressure = metrics.barometricPressure || metrics.barometric_pressure;
            update.gasResistance = metrics.gasResistance || metrics.gas_resistance;
            update.iaq = metrics.iaq;

            console.log(`[Meshtastic] 🌡️ Extracted environmental values:`, {
              temperature: update.temperature,
              humidity: update.humidity,
              pressure: update.pressure,
              gasResistance: update.gasResistance,
              iaq: update.iaq
            });
            break;
          }

          case 'powerMetrics': {
            const metrics = data.variant.value;
            console.log(`[Meshtastic] ⚡ Power metrics:`, metrics);
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
            console.log(`[Meshtastic] 💨 Air quality metrics:`, metrics);
            update.pm10Standard = metrics.pm10Standard;
            update.pm25Standard = metrics.pm25Standard;
            update.pm100Standard = metrics.pm100Standard;
            break;
          }

          case 'localStats': {
            const metrics = data.variant.value;
            console.log(`[Meshtastic] 📊 Local stats:`, metrics);
            // Can add local stats handling here if needed
            break;
          }

          default:
            console.warn(`[Meshtastic] ⚠️ Unknown telemetry variant type: ${data.variant.case}`);
        }

        // Update catalog with telemetry data
        const catalogedNode = this.updateNodeCatalog(telemetryPacket.from, update, 'TelemetryPacket');

        // Log what telemetry data we're emitting
        if (catalogedNode) {
          const telemetryDetails = [];
          if (catalogedNode.batteryLevel !== undefined) telemetryDetails.push(`Battery: ${catalogedNode.batteryLevel}%`);
          if (catalogedNode.voltage !== undefined) telemetryDetails.push(`Voltage: ${catalogedNode.voltage}V`);
          if (catalogedNode.temperature !== undefined) telemetryDetails.push(`Temp: ${catalogedNode.temperature}°C`);
          if (catalogedNode.humidity !== undefined) telemetryDetails.push(`Humidity: ${catalogedNode.humidity}%`);
          if (catalogedNode.pressure !== undefined) telemetryDetails.push(`Pressure: ${catalogedNode.pressure}hPa`);
          console.log(`[Meshtastic] ✅ Catalog updated for ${catalogedNode.longName} (${nodeId}): ${telemetryDetails.join(', ')}`);

          this.emit('node', catalogedNode);
        }
      } catch (error) {
        console.error('[Meshtastic] Error handling telemetry packet:', error);
      }
    });

    // Subscribe to user packets (for node name/info updates)
    this.device.events.onUserPacket.subscribe((userPacket) => {
      console.log(`[Meshtastic] User packet:`, userPacket);
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

    // Subscribe to routing packets (for neighbor info)
    this.device.events.onRoutingPacket.subscribe((routingPacket) => {
      console.log(`[Meshtastic] Routing packet:`, routingPacket);
      // Routing packets contain neighbor info - could be used for mesh topology
    });

    // Subscribe to waypoint packets
    this.device.events.onWaypointPacket.subscribe((waypointPacket) => {
      console.log(`[Meshtastic] Waypoint packet:`, waypointPacket);
      // Waypoint data - could be added to map
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

      console.log(`[Meshtastic] 🔍 fetchAndEmitDeviceInfo called (attempt ${retryCount + 1}/${maxRetries + 1})`);
      console.log(`[Meshtastic] Device state:`, {
        hasDevice: !!this.device,
        deviceNodeNum: this.device?.nodeNum,
        myNodeNum: this.myNodeNum,
        catalogSize: this.nodeCatalog.size
      });

      // Check if we have device.nodeNum (our radio's node number)
      if (this.device && this.device.nodeNum) {
        console.log(`[Meshtastic] ✅ device.nodeNum exists: ${this.device.nodeNum}`);

        // Store our node number for loop prevention
        this.myNodeNum = this.device.nodeNum;

        // Try to get node info from our catalog first
        const myNode = this.nodeCatalog.get(this.device.nodeNum);

        if (myNode && myNode.longName) {
          const nodeInfo = {
            nodeId: this.normalizeNodeId(this.device.nodeNum),
            longName: myNode.longName,
            shortName: myNode.shortName || '????',
            hwModel: myNode.hwModel || 'Unknown'
          };
          console.log(`[Meshtastic] 🎯 Calling updateNodeInfo with:`, nodeInfo);
          this.updateNodeInfo(nodeInfo);
          console.log(`[Meshtastic] ✅ Node info fetched from catalog successfully`);
        } else {
          console.log(`[Meshtastic] ⏳ My node not in catalog yet (will be populated by events)`);

          // Retry with exponential backoff if we haven't exceeded max retries
          if (retryCount < maxRetries) {
            console.log(`[Meshtastic] ⏳ Retrying device info fetch in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              this.fetchAndEmitDeviceInfo(retryCount + 1);
            }, retryDelay);
            return; // Exit early, will retry
          } else {
            console.log(`[Meshtastic] ⚠️  Max retries reached, node info will be set when NodeInfoPacket arrives`);
          }
        }
      } else if (retryCount < maxRetries) {
        // device.nodeNum not ready yet, retry
        console.log(`[Meshtastic] ⏳ device.nodeNum not ready, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
        setTimeout(() => {
          this.fetchAndEmitDeviceInfo(retryCount + 1);
        }, retryDelay);
        return; // Exit early, will retry
      } else {
        console.log(`[Meshtastic] ⚠️  device.nodeNum never became ready after ${maxRetries} retries`);
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
    console.log('[Meshtastic] 📝 updateNodeInfo called with:', {
      nodeId: nodeInfo?.nodeId,
      longName: nodeInfo?.longName,
      shortName: nodeInfo?.shortName,
      hwModel: nodeInfo?.hwModel
    });

    this.nodeInfo = nodeInfo;
    console.log('[Meshtastic] ✅ this.nodeInfo set, emitting nodeInfo event...');
    this.emit('nodeInfo', nodeInfo);
    console.log('[Meshtastic] ✅ nodeInfo event emitted');
  }

  /**
   * Scan node catalog and re-emit all known nodes
   * This ensures clients get periodic updates for all nodes we know about
   */
  scanAndEmitNodes() {
    try {
      if (this.nodeCatalog.size === 0) {
        console.log(`[Meshtastic] 🔍 Node scan skipped - catalog empty (nodes will be added via events)`);
        return;
      }

      console.log(`[Meshtastic] 🔍 Scanning ${this.nodeCatalog.size} nodes in catalog...`);
      let emittedCount = 0;

      this.nodeCatalog.forEach((node, nodeNum) => {
        const nodeId = this.normalizeNodeId(nodeNum);

        console.log(`[Meshtastic] 🔍 Node ${nodeId}:`, {
          longName: node.longName,
          shortName: node.shortName,
          hwModel: node.hwModel,
          hasPosition: !!(node.position?.latitude),
          temperature: node.temperature,
          humidity: node.humidity,
          pressure: node.pressure,
          batteryLevel: node.batteryLevel,
          lastHeard: node.lastHeard
        });

        // Emit the cataloged node
        console.log(`[Meshtastic] ✅ Emitting node: ${node.longName} (${nodeId})`);
        this.emit('node', node);
        emittedCount++;
      });

      console.log(`[Meshtastic] ✅ Node scan complete - emitted ${emittedCount} nodes from catalog`);
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

      console.log(`[Meshtastic] Sending text: "${text}" on channel ${channel} (broadcast)`);
      console.log(`[Meshtastic] Send parameters:`, {
        text,
        destination: 'broadcast',
        wantAck,
        channel
      });

      // Send using the device
      // sendText(text, destination, wantAck, channel)
      // Use "broadcast" as destination to broadcast on the specified channel
      const result = await this.device.sendText(text, "broadcast", wantAck, channel);

      console.log(`[Meshtastic] sendText result:`, result);

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

      // Send to radio and request response
      console.log(`[Channel Config] 📡 Sending get channel request...`);
      const packetId = await this.device.sendPacket(
        adminBytes,
        Protobuf.Portnums.PortNum.ADMIN_APP,
        'self',
        0,
        true,   // wantAck
        true    // wantResponse - we need the channel config back
      );

      console.log(`[Channel Config] ✅ Request sent, packet ID: ${packetId}`);

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
}
