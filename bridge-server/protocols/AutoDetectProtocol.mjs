/**
 * Auto-Detect Protocol Handler
 *
 * Implements BaseProtocol with automatic protocol detection and adaptation.
 * This is NOT an implementation of the MeshCore mesh networking product.
 *
 * Auto-detects and uses Meshtastic, Reticulum, or RNode protocols
 * and provides a unified interface for the bridge server.
 *
 * Note: MeshCore is a separate mesh networking product (https://meshcore.co.uk/)
 * with its own firmware and protocol. Support for actual MeshCore devices
 * would require a separate MeshCoreProtocol implementation.
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
import { ReticulumProtocol } from './ReticulumProtocol.mjs';
import { RNodeProtocol } from './RNodeProtocol.mjs';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export class AutoDetectProtocol extends BaseProtocol {
  constructor(radioId, portPath, options = {}) {
    super(radioId, portPath, options);
    this.underlyingProtocol = null;
    this.protocolType = null;
    this.config = null;
  }

  getProtocolName() {
    // Return the actual detected protocol, not 'auto'
    // AutoDetect is just the detection layer
    return this.protocolType || 'auto';
  }

  async connect() {
    try {
      console.log(`[AutoDetect] Connecting to ${this.portPath}...`);

      // Try to load Mesh Core configuration
      await this.loadConfiguration();

      // Auto-detect or use configured protocol
      if (this.config && this.config.protocol) {
        console.log(`[AutoDetect] Using configured protocol: ${this.config.protocol}`);
        this.protocolType = this.config.protocol;
        // Create and connect underlying protocol handler
        await this.connectUnderlyingProtocol();
      } else {
        console.log(`[AutoDetect] Auto-detecting protocol...`);
        this.protocolType = await this.detectProtocol();
        // detectProtocol() already connected and set this.underlyingProtocol
        // Just set up event forwarding
        this.setupEventForwarding();
      }

      this.connected = true;
      console.log(`[AutoDetect] Connected successfully using ${this.protocolType} protocol`);

      return true;
    } catch (error) {
      console.error(`[AutoDetect] Connection failed:`, error);
      this.handleError(error);
      throw error;
    }
  }

  async loadConfiguration() {
    try {
      // Look for meshcore.json config file in same directory as port
      const configPaths = [
        this.options.configPath,
        join(dirname(this.portPath), 'meshcore.json'),
        join(process.cwd(), 'meshcore.json'),
        '/etc/meshcore/config.json'
      ].filter(Boolean);

      for (const configPath of configPaths) {
        if (existsSync(configPath)) {
          console.log(`[AutoDetect] Loading configuration from ${configPath}`);
          const configData = readFileSync(configPath, 'utf8');
          this.config = JSON.parse(configData);
          return;
        }
      }

      console.log(`[AutoDetect] No configuration file found, using defaults`);
      this.config = {};
    } catch (error) {
      console.warn(`[AutoDetect] Error loading configuration:`, error);
      this.config = {};
    }
  }

  async detectProtocol() {
    console.log('[AutoDetect] Starting protocol detection...');

    // Determine if this is a physical serial port or virtual
    const isVirtualPort = this.portPath.includes('virtual') ||
                         this.portPath.includes('software') ||
                         this.portPath.startsWith('reticulum-');

    // Try each protocol in order of likelihood
    // Skip Reticulum for physical serial ports (it's software-only or RNode-specific)
    const protocols = isVirtualPort
      ? ['reticulum', 'meshtastic', 'rnode']  // For virtual ports, try Reticulum first
      : ['meshtastic', 'rnode'];               // For physical ports, skip Reticulum

    console.log(`[AutoDetect] Port type: ${isVirtualPort ? 'Virtual/Software' : 'Physical Serial'}`);
    console.log(`[AutoDetect] Will try protocols: ${protocols.join(', ')}`);

    for (const protocol of protocols) {
      console.log(`[AutoDetect] Trying ${protocol}...`);

      try {
        const testProtocol = this.createProtocolHandler(protocol);
        await testProtocol.connect();

        // Success! Keep this connection and use it
        console.log(`[AutoDetect] Detected ${protocol} protocol`);
        this.underlyingProtocol = testProtocol;
        return protocol;
      } catch (error) {
        console.log(`[AutoDetect] ${protocol} detection failed:`, error.message);
        // Continue to next protocol
      }
    }

    throw new Error('Unable to detect compatible protocol');
  }

  createProtocolHandler(protocolType) {
    const protocolOptions = this.config[protocolType] || {};

    switch (protocolType) {
      case 'meshtastic':
        return new MeshtasticProtocol(this.radioId, this.portPath, protocolOptions);

      case 'reticulum':
        return new ReticulumProtocol(this.radioId, this.portPath, protocolOptions);

      case 'rnode':
        return new RNodeProtocol(this.radioId, this.portPath, protocolOptions);

      default:
        throw new Error(`Unknown protocol type: ${protocolType}`);
    }
  }

  setupEventForwarding() {
    // Forward all events from underlying protocol
    this.underlyingProtocol.on('message', (packet) => {
      this.stats.messagesReceived++;
      this.emit('message', packet);
    });

    this.underlyingProtocol.on('nodeInfo', (info) => {
      this.nodeInfo = info;
      this.emit('nodeInfo', this.nodeInfo);
    });

    this.underlyingProtocol.on('channels', (channels) => {
      this.channels = channels;
      this.emit('channels', channels);
    });

    this.underlyingProtocol.on('telemetry', (telemetry) => {
      this.emit('telemetry', telemetry);
    });

    this.underlyingProtocol.on('error', (error) => {
      this.handleError(error);
    });
  }

  async connectUnderlyingProtocol() {
    this.underlyingProtocol = this.createProtocolHandler(this.protocolType);
    this.setupEventForwarding();
    // Connect the underlying protocol
    await this.underlyingProtocol.connect();
  }

  async disconnect() {
    try {
      console.log(`[AutoDetect] Disconnecting from ${this.portPath}...`);

      if (this.underlyingProtocol) {
        await this.underlyingProtocol.disconnect();
        this.underlyingProtocol = null;
      }

      this.connected = false;
      console.log(`[AutoDetect] Disconnected successfully`);
    } catch (error) {
      console.error('[AutoDetect] Error during disconnect:', error);
      this.handleError(error);
      throw error;
    }
  }

  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected || !this.underlyingProtocol) {
        throw new Error('Device not connected');
      }

      // Delegate to underlying protocol
      const result = await this.underlyingProtocol.sendMessage(text, channel, options);

      this.stats.messagesSent++;
      console.log(`[AutoDetect] Message sent via ${this.protocolType}: ${text.substring(0, 50)}...`);

      return result;
    } catch (error) {
      console.error('[AutoDetect] Error sending message:', error);
      this.handleError(error);
      throw error;
    }
  }

  getNodeInfo() {
    return this.nodeInfo || (this.underlyingProtocol ? this.underlyingProtocol.getNodeInfo() : null);
  }

  getChannels() {
    return this.channels.length > 0 ? this.channels :
           (this.underlyingProtocol ? this.underlyingProtocol.getChannels() : []);
  }

  getStats() {
    const baseStats = super.getStats();
    const underlyingStats = this.underlyingProtocol ? this.underlyingProtocol.getStats() : {};

    return {
      ...baseStats,
      underlying: underlyingStats
    };
  }

  channelsMatch(channel1, channel2) {
    if (this.underlyingProtocol) {
      return this.underlyingProtocol.channelsMatch(channel1, channel2);
    }
    return super.channelsMatch(channel1, channel2);
  }

  getProtocolMetadata() {
    return {
      activeProtocol: this.protocolType,
      underlyingMetadata: this.underlyingProtocol ?
        this.underlyingProtocol.getProtocolMetadata() : {}
    };
  }

  // Additional Mesh Core specific methods

  /**
   * Get the active underlying protocol type
   */
  getActiveProtocol() {
    return this.protocolType;
  }

  /**
   * Get list of supported protocols
   */
  getSupportedProtocols() {
    return ['meshtastic', 'reticulum', 'rnode'];
  }

  /**
   * Switch to a different protocol (requires reconnection)
   */
  async switchProtocol(newProtocol) {
    console.log(`[AutoDetect] Switching protocol from ${this.protocolType} to ${newProtocol}`);

    if (this.connected) {
      await this.disconnect();
    }

    this.protocolType = newProtocol;

    if (this.config) {
      this.config.protocol = newProtocol;
    }

    await this.connect();
  }

  /**
   * Translate message between protocols
   * Useful for cross-protocol bridging
   */
  translateMessage(message, targetProtocol) {
    // Base implementation - can be enhanced with protocol-specific translations
    return {
      ...message,
      protocol: targetProtocol,
      originalProtocol: message.protocol,
      translated: true
    };
  }
}
