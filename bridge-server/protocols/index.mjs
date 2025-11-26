/**
 * Protocol Handler Exports
 *
 * Central export point for all radio protocol handlers
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
import { BluetoothProtocol } from './BluetoothProtocol.mjs';

// Re-export for convenience
export { BaseProtocol, MeshtasticProtocol, BluetoothProtocol };

/**
 * Factory function to create protocol handler
 * @param {string} protocol - Protocol type ('meshtastic', 'bluetooth')
 * @param {string} radioId - Radio ID
 * @param {string} portPath - Serial port path or Bluetooth device address
 * @param {object} options - Protocol options
 * @returns {BaseProtocol} Protocol handler instance
 */
export function createProtocol(protocol, radioId, portPath, options = {}) {
  switch (protocol.toLowerCase()) {
    case 'meshtastic':
      return new MeshtasticProtocol(radioId, portPath, options);

    case 'bluetooth':
      return new BluetoothProtocol(radioId, portPath, options);

    default:
      throw new Error(`Unknown protocol: ${protocol}. Supported protocols: 'meshtastic', 'bluetooth'`);
  }
}

/**
 * Get list of supported per-radio protocols
 * @returns {Array<string>} Array of supported protocol names
 */
export function getSupportedProtocols() {
  return ['meshtastic', 'bluetooth'];
}
