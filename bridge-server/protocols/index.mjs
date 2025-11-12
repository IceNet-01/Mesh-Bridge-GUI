/**
 * Protocol Handler Exports
 *
 * Central export point for all radio protocol handlers
 */

export { BaseProtocol } from './BaseProtocol.mjs';
export { MeshtasticProtocol } from './MeshtasticProtocol.mjs';
export { ReticulumProtocol } from './ReticulumProtocol.mjs';
export { RNodeProtocol } from './RNodeProtocol.mjs';
export { MeshCoreProtocol } from './MeshCoreProtocol.mjs';

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
