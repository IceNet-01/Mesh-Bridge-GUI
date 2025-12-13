/**
 * Protocol Handler Exports
 *
 * Central export point for all radio protocol handlers
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
import { BluetoothProtocol } from './BluetoothProtocol.mjs';
import { WiFiProtocol } from './WiFiProtocol.mjs';

// Re-export for convenience
export { BaseProtocol, MeshtasticProtocol, BluetoothProtocol, WiFiProtocol };

/**
 * Factory function to create protocol handler
 * @param {string} protocol - Protocol type ('meshtastic', 'bluetooth', 'wifi', 'tcp')
 * @param {string} radioId - Radio ID
 * @param {string} portPath - Serial port path, Bluetooth device address, or IP address/hostname
 * @param {object} options - Protocol options
 * @returns {BaseProtocol} Protocol handler instance
 */
export function createProtocol(protocol, radioId, portPath, options = {}) {
  switch (protocol.toLowerCase()) {
    case 'meshtastic':
      return new MeshtasticProtocol(radioId, portPath, options);

    case 'bluetooth':
      return new BluetoothProtocol(radioId, portPath, options);

    case 'wifi':
    case 'tcp':
    case 'http':
      return new WiFiProtocol(radioId, portPath, options);

    default:
      throw new Error(`Unknown protocol: ${protocol}. Supported protocols: 'meshtastic', 'bluetooth', 'wifi'`);
  }
}

/**
 * Get list of supported per-radio protocols
 * @returns {Array<string>} Array of supported protocol names
 */
export function getSupportedProtocols() {
  return ['meshtastic', 'bluetooth', 'wifi'];
}
