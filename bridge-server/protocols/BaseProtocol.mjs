/**
 * Base Radio Protocol Interface
 *
 * All radio protocol implementations must extend this class and implement
 * the required methods for connecting, disconnecting, sending messages, etc.
 */

import { EventEmitter } from 'events';

export class BaseProtocol extends EventEmitter {
  constructor(radioId, portPath, options = {}) {
    super();
    this.radioId = radioId;
    this.portPath = portPath;
    this.options = options;
    this.connected = false;
    this.device = null;
    this.nodeInfo = null;
    this.channels = [];
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0
    };
  }

  /**
   * Get the protocol name
   * @returns {string} Protocol name (e.g., 'meshtastic', 'reticulum', 'rnode', 'meshcore')
   */
  getProtocolName() {
    throw new Error('getProtocolName() must be implemented by subclass');
  }

  /**
   * Connect to the radio device
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the radio device
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Send a text message to a specific channel/destination
   * @param {string} text - Message text
   * @param {number|string} channel - Channel index or destination identifier
   * @param {object} options - Additional options (wantAck, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async sendMessage(text, channel, options = {}) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  /**
   * Get node information
   * @returns {object} Node info with nodeId, longName, shortName, hwModel, etc.
   */
  getNodeInfo() {
    return this.nodeInfo;
  }

  /**
   * Get list of channels/destinations
   * @returns {Array} Array of channel objects
   */
  getChannels() {
    return this.channels;
  }

  /**
   * Get statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return this.stats;
  }

  /**
   * Get protocol-specific metadata
   * @returns {object} Protocol metadata
   */
  getProtocolMetadata() {
    return {};
  }

  /**
   * Normalize a received message packet to standard format
   * This is used internally to convert protocol-specific packets to a common format
   *
   * @param {object} packet - Protocol-specific packet
   * @returns {object} Normalized message object
   */
  normalizeMessagePacket(packet) {
    // Default implementation - subclasses should override if needed
    return {
      id: packet.id || Date.now().toString(),
      timestamp: packet.timestamp || new Date(),
      from: packet.from,
      to: packet.to,
      channel: packet.channel || 0,
      portnum: packet.portnum || 1,
      text: packet.text || '',
      rssi: packet.rssi,
      snr: packet.snr,
      hopLimit: packet.hopLimit,
      payload: packet
    };
  }

  /**
   * Check if two channels match for message forwarding
   * Default implementation - can be overridden by subclasses
   *
   * @param {object} channel1 - First channel
   * @param {object} channel2 - Second channel
   * @returns {boolean} True if channels match
   */
  channelsMatch(channel1, channel2) {
    // Default: match by index
    return channel1.index === channel2.index;
  }

  /**
   * Handle connection errors
   * @param {Error} error - Error object
   */
  handleError(error) {
    this.stats.errors++;
    this.emit('error', error);
  }

  /**
   * Emit a normalized message packet
   * @param {object} packet - Normalized packet
   */
  emitMessage(packet) {
    this.stats.messagesReceived++;
    this.emit('message', packet);
  }

  /**
   * Update node information
   * @param {object} info - Node information
   */
  updateNodeInfo(info) {
    this.nodeInfo = info;
    this.emit('nodeInfo', info);
  }

  /**
   * Update channels/destinations
   * @param {Array} channels - Array of channel objects
   */
  updateChannels(channels) {
    this.channels = channels;
    this.emit('channels', channels);
  }

  /**
   * Update telemetry/statistics
   * @param {object} telemetry - Telemetry data
   */
  updateTelemetry(telemetry) {
    this.emit('telemetry', telemetry);
  }
}
