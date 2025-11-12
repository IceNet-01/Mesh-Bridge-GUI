/**
 * Protocol Handler Exports
 *
 * Central export point for all radio protocol handlers
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
import { ReticulumProtocol } from './ReticulumProtocol.mjs';
import { RNodeProtocol } from './RNodeProtocol.mjs';
import { MeshCoreProtocol } from './MeshCoreProtocol.mjs';

// Re-export for convenience
export { BaseProtocol, MeshtasticProtocol, ReticulumProtocol, RNodeProtocol, MeshCoreProtocol };

/**
 * Factory function to create protocol handler
 * @param {string} protocol - Protocol type ('meshtastic', 'reticulum', 'rnode', 'meshcore')
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

    case 'meshcore':
      return new MeshCoreProtocol(radioId, portPath, options);

    default:
      throw new Error(`Unknown protocol: ${protocol}`);
  }
}

/**
 * Get list of supported protocols
 * @returns {Array<string>} Array of supported protocol names
 */
export function getSupportedProtocols() {
  return ['meshtastic', 'reticulum', 'rnode', 'meshcore'];
}
