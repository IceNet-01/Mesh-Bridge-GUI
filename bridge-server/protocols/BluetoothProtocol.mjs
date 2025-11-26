/**
 * Bluetooth Protocol Handler for Meshtastic
 *
 * Implements BaseProtocol for Meshtastic radios using BLE (Bluetooth Low Energy)
 * Uses @abandonware/noble for cross-platform BLE support (Linux, macOS, Windows)
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import noble from '@abandonware/noble';
import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import * as Protobuf from '@meshtastic/protobufs';

// Meshtastic BLE GATT Service and Characteristic UUIDs
const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
const TORADIO_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
const FROMRADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002';
const FROMNUM_UUID = 'ed9da18c-a800-4f66-a670-aa7547e34453';
const LOG_RECORD_UUID = '5a3d6e49-06e6-4423-9944-e9de8cdf9547';

export class BluetoothProtocol extends BaseProtocol {
  constructor(radioId, deviceAddress, options = {}) {
    super(radioId, deviceAddress, options);

    // BLE specific properties
    this.deviceAddress = deviceAddress; // Bluetooth MAC address or device ID
    this.peripheral = null;
    this.toRadioCharacteristic = null;
    this.fromRadioCharacteristic = null;
    this.fromNumCharacteristic = null;
    this.logRecordCharacteristic = null;

    // Meshtastic protocol properties
    this.channelMap = new Map();
    this.loraConfig = null;
    this.myNodeNum = null;
    this.nodeCatalog = new Map();

    // Timers for periodic tasks
    this.nodesScanInterval = null;
    this.radioTimeUpdateInterval = null;
    this.configRequestTimer = null;

    // Connection state
    this.isConfigured = false;
    this.configTimeout = 30000; // 30 seconds to configure

    // Message queue for initial configuration
    this.fromRadioQueue = [];
    this.isReadingConfig = false;
  }

  getProtocolName() {
    return 'bluetooth';
  }

  /**
   * Normalize node ID to consistent hex format with "!" prefix
   */
  normalizeNodeId(nodeNum) {
    if (typeof nodeNum !== 'number') {
      console.warn(`[Bluetooth] Invalid nodeNum type: ${typeof nodeNum}, value:`, nodeNum);
      return 'unknown';
    }
    return '!' + nodeNum.toString(16).padStart(8, '0');
  }

  /**
   * Update node catalog (same logic as MeshtasticProtocol)
   */
  updateNodeCatalog(nodeNum, update, source = 'Unknown') {
    if (typeof nodeNum !== 'number') {
      console.warn(`[Bluetooth] Cannot update catalog - invalid nodeNum:`, nodeNum);
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
      console.log(`[Bluetooth] 📝 Creating new catalog entry for ${nodeId} (source: ${source})`);
    }

    node._timestamps.lastSeen = new Date();
    node.lastHeard = new Date();

    // Merge update data
    Object.assign(node, update);

    this.nodeCatalog.set(nodeNum, node);
    return node;
  }

  /**
   * Connect to Bluetooth device
   */
  async connect() {
    try {
      console.log(`[Bluetooth] Connecting to device ${this.deviceAddress}...`);

      // Find the peripheral
      this.peripheral = await this.findPeripheral(this.deviceAddress);

      if (!this.peripheral) {
        throw new Error(`Device ${this.deviceAddress} not found`);
      }

      console.log(`[Bluetooth] Found peripheral: ${this.peripheral.advertisement.localName || 'Unknown'}`);

      // Connect to peripheral
      await this.connectPeripheral(this.peripheral);
      console.log(`[Bluetooth] Connected to peripheral`);

      // Discover services and characteristics
      await this.discoverServicesAndCharacteristics();
      console.log(`[Bluetooth] Discovered services and characteristics`);

      // Set up event handlers
      this.setupEventHandlers();

      // Request configuration from device
      await this.requestConfiguration();

      this.connected = true;
      console.log(`[Bluetooth] Successfully connected to ${this.deviceAddress}`);

      return true;
    } catch (error) {
      console.error(`[Bluetooth] Connection failed:`, error);
      await this.cleanup();
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Find a BLE peripheral by address or name
   */
  async findPeripheral(deviceIdentifier) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        noble.stopScanning();
        reject(new Error('Device scan timeout'));
      }, 30000); // 30 second timeout

      const onDiscover = (peripheral) => {
        // Match by address or local name
        const matches =
          peripheral.address.toLowerCase() === deviceIdentifier.toLowerCase() ||
          peripheral.id.toLowerCase() === deviceIdentifier.toLowerCase() ||
          (peripheral.advertisement.localName &&
           peripheral.advertisement.localName.toLowerCase().includes('meshtastic'));

        if (matches) {
          clearTimeout(timeout);
          noble.stopScanning();
          noble.removeListener('discover', onDiscover);
          resolve(peripheral);
        }
      };

      noble.on('discover', onDiscover);

      // Start scanning
      if (noble.state === 'poweredOn') {
        noble.startScanning([MESHTASTIC_SERVICE_UUID], false);
      } else {
        noble.once('stateChange', (state) => {
          if (state === 'poweredOn') {
            noble.startScanning([MESHTASTIC_SERVICE_UUID], false);
          } else {
            clearTimeout(timeout);
            reject(new Error(`Bluetooth adapter not ready: ${state}`));
          }
        });
      }
    });
  }

  /**
   * Connect to a peripheral
   */
  async connectPeripheral(peripheral) {
    return new Promise((resolve, reject) => {
      peripheral.connect((error) => {
        if (error) {
          reject(error);
        } else {
          // Handle disconnect events
          peripheral.once('disconnect', () => {
            console.log(`[Bluetooth] Peripheral disconnected`);
            this.connected = false;
            this.emit('disconnected');
          });
          resolve();
        }
      });
    });
  }

  /**
   * Discover Meshtastic GATT services and characteristics
   */
  async discoverServicesAndCharacteristics() {
    return new Promise((resolve, reject) => {
      this.peripheral.discoverServices([MESHTASTIC_SERVICE_UUID], (error, services) => {
        if (error) {
          return reject(error);
        }

        if (services.length === 0) {
          return reject(new Error('Meshtastic service not found'));
        }

        const service = services[0];

        service.discoverCharacteristics([], (error, characteristics) => {
          if (error) {
            return reject(error);
          }

          // Map characteristics
          for (const char of characteristics) {
            const uuid = char.uuid.toLowerCase();

            if (uuid === TORADIO_UUID.toLowerCase().replace(/-/g, '')) {
              this.toRadioCharacteristic = char;
              console.log(`[Bluetooth] Found TORADIO characteristic`);
            } else if (uuid === FROMRADIO_UUID.toLowerCase().replace(/-/g, '')) {
              this.fromRadioCharacteristic = char;
              console.log(`[Bluetooth] Found FROMRADIO characteristic`);
            } else if (uuid === FROMNUM_UUID.toLowerCase().replace(/-/g, '')) {
              this.fromNumCharacteristic = char;
              console.log(`[Bluetooth] Found FROMNUM characteristic`);
            } else if (uuid === LOG_RECORD_UUID.toLowerCase().replace(/-/g, '')) {
              this.logRecordCharacteristic = char;
              console.log(`[Bluetooth] Found LOG_RECORD characteristic`);
            }
          }

          if (!this.toRadioCharacteristic || !this.fromRadioCharacteristic || !this.fromNumCharacteristic) {
            return reject(new Error('Required Meshtastic characteristics not found'));
          }

          resolve();
        });
      });
    });
  }

  /**
   * Set up event handlers for characteristics
   */
  setupEventHandlers() {
    // Subscribe to FROMNUM notifications (indicates new data available)
    this.fromNumCharacteristic.subscribe((error) => {
      if (error) {
        console.error('[Bluetooth] Error subscribing to FROMNUM:', error);
        return;
      }
      console.log('[Bluetooth] Subscribed to FROMNUM notifications');
    });

    this.fromNumCharacteristic.on('data', (data) => {
      // FROMNUM changed - new packet available
      this.readFromRadio();
    });

    // Subscribe to log records if available
    if (this.logRecordCharacteristic) {
      this.logRecordCharacteristic.subscribe((error) => {
        if (error) {
          console.error('[Bluetooth] Error subscribing to logs:', error);
          return;
        }
      });

      this.logRecordCharacteristic.on('data', (data) => {
        try {
          const logRecord = fromBinary(Protobuf.Mesh.LogRecordSchema, new Uint8Array(data));
          console.log(`[Bluetooth Radio Log] ${logRecord.message}`);
        } catch (err) {
          // Ignore log parsing errors
        }
      });
    }
  }

  /**
   * Request configuration from the device
   */
  async requestConfiguration() {
    console.log('[Bluetooth] Requesting device configuration...');

    // Send config request (empty ToRadio message triggers config)
    const configRequest = create(Protobuf.Mesh.ToRadioSchema, {
      wantConfigId: BigInt(Date.now())
    });

    await this.writeToRadio(configRequest);

    // Start reading configuration packets
    this.isReadingConfig = true;
    await this.readConfigurationPackets();
  }

  /**
   * Read configuration packets from device
   */
  async readConfigurationPackets() {
    const startTime = Date.now();

    while (this.isReadingConfig && Date.now() - startTime < this.configTimeout) {
      await this.readFromRadio();
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between reads

      // Check if we've received all required config
      if (this.isConfigured) {
        this.isReadingConfig = false;
        console.log('[Bluetooth] Device configuration complete');

        // Set up periodic tasks
        this.setupPeriodicTasks();
        break;
      }
    }

    if (!this.isConfigured) {
      throw new Error('Device configuration timeout');
    }
  }

  /**
   * Set up periodic tasks (node scanning, time updates, etc.)
   */
  setupPeriodicTasks() {
    // Periodic node scan
    this.nodesScanInterval = setInterval(() => {
      this.scanAndEmitNodes();
    }, 60000); // 60 seconds

    // Periodic radio time updates
    this.radioTimeUpdateInterval = setInterval(() => {
      if (this.nodeInfo) {
        this.updateNodeInfo(this.nodeInfo);
      }
    }, 10000); // 10 seconds

    console.log('[Bluetooth] Periodic tasks enabled');
  }

  /**
   * Write a ToRadio message to the device
   */
  async writeToRadio(toRadio) {
    if (!this.toRadioCharacteristic) {
      throw new Error('TORADIO characteristic not available');
    }

    const binary = toBinary(Protobuf.Mesh.ToRadioSchema, toRadio);

    return new Promise((resolve, reject) => {
      this.toRadioCharacteristic.write(Buffer.from(binary), false, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Read a FromRadio message from the device
   */
  async readFromRadio() {
    if (!this.fromRadioCharacteristic) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.fromRadioCharacteristic.read((error, data) => {
        if (error) {
          reject(error);
          return;
        }

        if (!data || data.length === 0) {
          resolve(null);
          return;
        }

        try {
          const fromRadio = fromBinary(Protobuf.Mesh.FromRadioSchema, new Uint8Array(data));
          this.processFromRadio(fromRadio);
          resolve(fromRadio);
        } catch (err) {
          console.error('[Bluetooth] Error parsing FromRadio:', err);
          reject(err);
        }
      });
    });
  }

  /**
   * Process a FromRadio message
   */
  processFromRadio(fromRadio) {
    // Handle different message types
    if (fromRadio.myInfo) {
      this.handleMyInfo(fromRadio.myInfo);
    }

    if (fromRadio.nodeInfo) {
      this.handleNodeInfo(fromRadio.nodeInfo);
    }

    if (fromRadio.channel) {
      this.handleChannel(fromRadio);
    }

    if (fromRadio.config) {
      this.handleConfig(fromRadio.config);
    }

    if (fromRadio.moduleConfig) {
      this.handleModuleConfig(fromRadio.moduleConfig);
    }

    if (fromRadio.packet) {
      this.handleMeshPacket(fromRadio.packet);
    }

    if (fromRadio.configCompleteId) {
      console.log('[Bluetooth] Configuration complete');
      this.isConfigured = true;
    }
  }

  /**
   * Handle MyInfo packet
   */
  handleMyInfo(myInfo) {
    console.log('[Bluetooth] Received MyInfo:', myInfo);
    this.myNodeNum = Number(myInfo.myNodeNum);

    // Initialize node info
    this.nodeInfo = {
      nodeId: this.normalizeNodeId(this.myNodeNum),
      num: this.myNodeNum,
      firmwareVersion: myInfo.firmwareVersion || 'Unknown',
      hasGPS: false,
      lastHeard: new Date()
    };

    this.updateNodeInfo(this.nodeInfo);
  }

  /**
   * Handle NodeInfo packet
   */
  handleNodeInfo(nodeInfo) {
    const nodeNum = Number(nodeInfo.num);

    const update = {
      longName: nodeInfo.user?.longName || 'Unknown',
      shortName: nodeInfo.user?.shortName || '????',
      hwModel: nodeInfo.user?.hwModel || 'Unknown',
      macaddr: nodeInfo.user?.macaddr
    };

    const node = this.updateNodeCatalog(nodeNum, update, 'NodeInfo');

    if (node) {
      this.emit('node', node);

      // If this is our node, update nodeInfo
      if (nodeNum === this.myNodeNum) {
        Object.assign(this.nodeInfo, update);
        this.updateNodeInfo(this.nodeInfo);
      }
    }
  }

  /**
   * Handle Channel packet
   */
  handleChannel(fromRadio) {
    const channel = fromRadio.channel;
    const index = channel.index || 0;

    this.channelMap.set(index, {
      index: index,
      name: channel.settings?.name || `Channel ${index}`,
      role: channel.role || 0,
      psk: channel.settings?.psk || new Uint8Array(0)
    });

    console.log(`[Bluetooth] Channel ${index}: ${this.channelMap.get(index).name}`);

    // Emit channels update
    this.updateChannels(Array.from(this.channelMap.values()));
  }

  /**
   * Handle Config packet
   */
  handleConfig(config) {
    if (config.lora) {
      this.loraConfig = config.lora;
      console.log('[Bluetooth] Received LoRa config');
    }
  }

  /**
   * Handle ModuleConfig packet
   */
  handleModuleConfig(moduleConfig) {
    // Store module config if needed
    console.log('[Bluetooth] Received module config');
  }

  /**
   * Handle MeshPacket
   */
  handleMeshPacket(packet) {
    // Filter out our own messages
    if (this.myNodeNum && packet.from === this.myNodeNum) {
      return;
    }

    // Update node in catalog
    this.updateNodeCatalog(Number(packet.from), {
      lastHeard: new Date(),
      rssi: packet.rxRssi,
      snr: packet.rxSnr
    }, 'MeshPacket');

    // Handle different payload types
    if (packet.decoded?.portnum === Protobuf.Portnums.PortNum.TEXT_MESSAGE_APP) {
      const normalized = this.normalizeMessagePacket(packet);
      this.emitMessage(normalized);
    } else if (packet.decoded?.portnum === Protobuf.Portnums.PortNum.POSITION_APP) {
      this.handlePositionPacket(packet);
    } else if (packet.decoded?.portnum === Protobuf.Portnums.PortNum.TELEMETRY_APP) {
      this.handleTelemetryPacket(packet);
    }
  }

  /**
   * Handle position packet
   */
  handlePositionPacket(packet) {
    try {
      const position = fromBinary(Protobuf.Mesh.PositionSchema, packet.decoded.payload);

      const update = {
        latitude: position.latitudeI ? position.latitudeI / 1e7 : undefined,
        longitude: position.longitudeI ? position.longitudeI / 1e7 : undefined,
        altitude: position.altitude,
        _timestamps: { position: new Date() }
      };

      const node = this.updateNodeCatalog(Number(packet.from), update, 'Position');
      if (node) {
        this.emit('node', node);
      }
    } catch (err) {
      console.error('[Bluetooth] Error parsing position:', err);
    }
  }

  /**
   * Handle telemetry packet
   */
  handleTelemetryPacket(packet) {
    try {
      const telemetry = fromBinary(Protobuf.Mesh.TelemetrySchema, packet.decoded.payload);

      const update = {
        batteryLevel: telemetry.deviceMetrics?.batteryLevel,
        voltage: telemetry.deviceMetrics?.voltage,
        channelUtilization: telemetry.deviceMetrics?.channelUtilization,
        airUtilTx: telemetry.deviceMetrics?.airUtilTx,
        _timestamps: { telemetry: new Date() }
      };

      const node = this.updateNodeCatalog(Number(packet.from), update, 'Telemetry');
      if (node) {
        this.emit('node', node);

        // Emit telemetry for UI updates
        if (Number(packet.from) === this.myNodeNum) {
          this.updateTelemetry(telemetry.deviceMetrics);
        }
      }
    } catch (err) {
      console.error('[Bluetooth] Error parsing telemetry:', err);
    }
  }

  /**
   * Normalize message packet to standard format
   */
  normalizeMessagePacket(packet) {
    let text = '';

    try {
      if (packet.decoded?.payload) {
        text = new TextDecoder().decode(packet.decoded.payload);
      }
    } catch (err) {
      console.error('[Bluetooth] Error decoding message text:', err);
    }

    return {
      id: packet.id?.toString() || Date.now().toString(),
      timestamp: packet.rxTime ? new Date(Number(packet.rxTime) * 1000) : new Date(),
      from: this.normalizeNodeId(Number(packet.from)),
      to: this.normalizeNodeId(Number(packet.to)),
      channel: packet.channel || 0,
      portnum: packet.decoded?.portnum || 1,
      text: text,
      rssi: packet.rxRssi,
      snr: packet.rxSnr,
      hopLimit: packet.hopLimit,
      payload: packet
    };
  }

  /**
   * Scan and emit nodes from catalog
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
      console.error('[Bluetooth] Error scanning nodes:', error);
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected || !this.toRadioCharacteristic) {
        throw new Error('Device not connected');
      }

      if (!this.isConfigured || !this.nodeInfo) {
        throw new Error('Device not fully configured yet');
      }

      if (!this.channelMap.has(channel)) {
        throw new Error(`Channel ${channel} not found`);
      }

      const { wantAck = false } = options;

      console.log(`[Bluetooth] Sending text: "${text}" on channel ${channel}`);

      // Create mesh packet
      const meshPacket = create(Protobuf.Mesh.MeshPacketSchema, {
        from: this.myNodeNum,
        to: 0xFFFFFFFF, // Broadcast
        channel: channel,
        wantAck: wantAck,
        decoded: {
          portnum: Protobuf.Portnums.PortNum.TEXT_MESSAGE_APP,
          payload: new TextEncoder().encode(text)
        }
      });

      // Wrap in ToRadio
      const toRadio = create(Protobuf.Mesh.ToRadioSchema, {
        packet: meshPacket
      });

      await this.writeToRadio(toRadio);

      this.stats.messagesSent++;
      console.log(`[Bluetooth] Message sent successfully`);

      return true;
    } catch (error) {
      console.error('[Bluetooth] Error sending message:', error);
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    try {
      console.log(`[Bluetooth] Disconnecting from ${this.deviceAddress}...`);
      await this.cleanup();
      console.log(`[Bluetooth] Disconnected successfully`);
    } catch (error) {
      console.error('[Bluetooth] Error during disconnect:', error);
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    // Clear intervals
    if (this.nodesScanInterval) {
      clearInterval(this.nodesScanInterval);
      this.nodesScanInterval = null;
    }

    if (this.radioTimeUpdateInterval) {
      clearInterval(this.radioTimeUpdateInterval);
      this.radioTimeUpdateInterval = null;
    }

    if (this.configRequestTimer) {
      clearTimeout(this.configRequestTimer);
      this.configRequestTimer = null;
    }

    // Disconnect peripheral
    if (this.peripheral) {
      await new Promise((resolve) => {
        this.peripheral.disconnect(() => {
          resolve();
        });
      });
      this.peripheral = null;
    }

    this.toRadioCharacteristic = null;
    this.fromRadioCharacteristic = null;
    this.fromNumCharacteristic = null;
    this.logRecordCharacteristic = null;
    this.connected = false;
    this.isConfigured = false;
  }
}
