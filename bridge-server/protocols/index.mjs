/**
 * Protocol Handler Exports
 *
 * Central export point for all radio protocol handlers
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
import { ReticulumProtocol } from './ReticulumProtocol.mjs';
import { AutoDetectProtocol } from './AutoDetectProtocol.mjs';

// Re-export for convenience
export { BaseProtocol, MeshtasticProtocol, ReticulumProtocol, AutoDetectProtocol };

/**
 * Factory function to create protocol handler
 * @param {string} protocol - Protocol type ('meshtastic', 'auto')
 * @param {string} radioId - Radio ID
 * @param {string} portPath - Serial port path
 * @param {object} options - Protocol options
 * @returns {BaseProtocol} Protocol handler instance
 *
 * NOTE: 'reticulum' is not created per-radio. Use ReticulumProtocol.getInstance() instead.
 */
export function createProtocol(protocol, radioId, portPath, options = {}) {
  switch (protocol.toLowerCase()) {
    case 'meshtastic':
      return new MeshtasticProtocol(radioId, portPath, options);

    case 'auto':
    case 'autodetect':
      return new AutoDetectProtocol(radioId, portPath, options);

    case 'reticulum':
      throw new Error('Reticulum is not instantiated per-radio. Use ReticulumProtocol.getInstance() and start() once globally.');

    case 'rnode':
      // RNode is hardware that provides transport FOR Reticulum, not a standalone protocol
      throw new Error('RNode is a transport for Reticulum, not a standalone protocol. Detected RNodes are automatically added as Reticulum transports.');

    case 'meshcore':
      // MeshCore is a separate mesh networking product (https://meshcore.co.uk/)
      throw new Error('MeshCore protocol not yet implemented. Use "auto" for automatic detection.');

    default:
      throw new Error(`Unknown protocol: ${protocol}. Supported: meshtastic, auto`);
  }
}

/**
 * Get list of supported per-radio protocols
 * @returns {Array<string>} Array of supported protocol names
 *
 * NOTE: 'reticulum' is global and started separately, not per-radio
 */
export function getSupportedProtocols() {
  return ['meshtastic', 'auto'];
}
