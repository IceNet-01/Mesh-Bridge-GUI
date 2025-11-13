/**
 * Protocol Handler Exports
 *
 * Central export point for all radio protocol handlers
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
import { ReticulumProtocol } from './ReticulumProtocol.mjs';
import { RNodeProtocol } from './RNodeProtocol.mjs';
import { AutoDetectProtocol } from './AutoDetectProtocol.mjs';

// Re-export for convenience
export { BaseProtocol, MeshtasticProtocol, ReticulumProtocol, RNodeProtocol, AutoDetectProtocol };

/**
 * Factory function to create protocol handler
 * @param {string} protocol - Protocol type ('meshtastic', 'reticulum', 'rnode', 'auto', 'meshcore')
 * @param {string} radioId - Radio ID
 * @param {string} portPath - Serial port path
 * @param {object} options - Protocol options
 * @returns {BaseProtocol} Protocol handler instance
 */
export function createProtocol(protocol, radioId, portPath, options = {}) {
  switch (protocol.toLowerCase()) {
    case 'meshtastic':
      return new MeshtasticProtocol(radioId, portPath, options);

    case 'reticulum':
      return new ReticulumProtocol(radioId, portPath, options);

    case 'rnode':
      return new RNodeProtocol(radioId, portPath, options);

    case 'auto':
    case 'autodetect':
      return new AutoDetectProtocol(radioId, portPath, options);

    case 'meshcore':
      // MeshCore is a separate mesh networking product (https://meshcore.co.uk/)
      // Support for actual MeshCore devices is not yet implemented
      throw new Error('MeshCore protocol not yet implemented. Use "auto" for automatic detection.');

    default:
      throw new Error(`Unknown protocol: ${protocol}. Supported: meshtastic, reticulum, rnode, auto`);
  }
}

/**
 * Get list of supported protocols
 * @returns {Array<string>} Array of supported protocol names
 */
export function getSupportedProtocols() {
  return ['meshtastic', 'reticulum', 'rnode', 'auto'];
}
