/**
 * Reticulum Network Stack Manager (Singleton)
 *
 * Manages a single global Reticulum Network Stack instance with multiple transports.
 * Unlike other protocols, Reticulum is NOT instantiated per-radio. Instead, it's a
 * single network that can have multiple transports (RNode devices, UDP, TCP, etc.)
 *
 * Architecture:
 * - One Python RNS bridge process (started on demand)
 * - Multiple RNode devices as transports
 * - Software transports (UDP, TCP) from config
 * - Destinations and announces across all transports
 *
 * Usage:
 *   const reticulum = ReticulumProtocol.getInstance();
 *   await reticulum.start();
 *   await reticulum.addRNodeTransport('/dev/ttyUSB0');
 *   await reticulum.addRNodeTransport('/dev/ttyUSB1');
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';

// Singleton instance
let instance = null;

export class ReticulumProtocol extends EventEmitter {
  static getInstance() {
    if (!instance) {
      instance = new ReticulumProtocol();
    }
    return instance;
  }

  constructor() {
    if (instance) {
      throw new Error('ReticulumProtocol is a singleton. Use getInstance() instead.');
    }
    super();

    this.rnsPython = null;
    this.identity = null;
    this.destination = null;
    this.running = false;
    this.destinations = new Map(); // destination_hash -> destination_info
    this.rnode_transports = new Map(); // port -> transport_info
    this.jsonBuffer = ''; // Buffer for incomplete JSON lines from Python
    this.messageStats = {
      sent: 0,
      received: 0,
      announces: 0
    };
  }

  /**
   * Start the Reticulum Network Stack
   */
  async start(options = {}) {
    if (this.running) {
      console.log('[Reticulum] Already running');
      return true;
    }

    try {
      console.log('[Reticulum] Starting Reticulum Network Stack...');

      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      const pythonScript = options.pythonBridge || join(__dirname, '..', 'rns_bridge.py');
      console.log(`[Reticulum] Python bridge: ${pythonScript}`);

      const args = [];
      if (options.rnsConfigPath) {
        args.push('--config', options.rnsConfigPath);
      }
      if (options.identityPath) {
        args.push('--identity', options.identityPath);
      }

      this.rnsPython = spawn('python3', [pythonScript, ...args], {
        cwd: options.rnsConfigPath || process.cwd(),
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      this.rnsPython.stdout.on('data', (data) => {
        this.handlePythonData(data);
      });

      this.rnsPython.stderr.on('data', (data) => {
        const msg = data.toString();
        // Don't log normal RNS info messages as errors
        if (msg.includes('[RNS-Bridge INFO]')) {
          console.log(`[Reticulum] ${msg.trim()}`);
        } else if (msg.includes('[RNS-Bridge WARN]')) {
          console.warn(`[Reticulum] ${msg.trim()}`);
        } else if (msg.includes('[RNS-Bridge ERROR]')) {
          console.error(`[Reticulum] ${msg.trim()}`);
        } else {
          console.log(`[Reticulum Python] ${msg.trim()}`);
        }
      });

      this.rnsPython.on('close', (code) => {
        console.log(`[Reticulum] Python process exited with code ${code}`);
        this.running = false;
        this.emit('disconnected');
      });

      this.rnsPython.on('error', (error) => {
        console.error('[Reticulum] Python process error:', error);
        this.emit('error', error);
      });

      // Wait for initialization
      await this.waitForInit();

      this.running = true;
      console.log('[Reticulum] ✓ Reticulum Network Stack started');

      return true;
    } catch (error) {
      console.error(`[Reticulum] Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Stop the Reticulum Network Stack
   */
  async stop() {
    if (!this.running) {
      return;
    }

    console.log('[Reticulum] Stopping Reticulum Network Stack...');

    if (this.rnsPython) {
      this.sendCommand('shutdown', {});
      this.rnsPython.kill();
      this.rnsPython = null;
    }

    this.running = false;
    this.rnode_transports.clear();
    console.log('[Reticulum] ✓ Stopped');
  }

  /**
   * Add an RNode device as a transport
   */
  async addRNodeTransport(portPath, config = {}) {
    if (!this.running) {
      throw new Error('Reticulum not started. Call start() first.');
    }

    if (this.rnode_transports.has(portPath)) {
      console.warn(`[Reticulum] RNode transport already exists: ${portPath}`);
      return false;
    }

    console.log(`[Reticulum] Adding RNode transport: ${portPath}`);

    // Send command to Python bridge to add RNode
    this.sendCommand('add_rnode', {
      port: portPath,
      config: config
    });

    // Track locally
    this.rnode_transports.set(portPath, {
      port: portPath,
      config: config,
      connected: true,
      messages_sent: 0,
      messages_received: 0,
      added_at: new Date()
    });

    this.emit('transport_added', { type: 'rnode', port: portPath });
    return true;
  }

  /**
   * Remove an RNode transport
   */
  async removeRNodeTransport(portPath) {
    if (!this.rnode_transports.has(portPath)) {
      console.warn(`[Reticulum] RNode transport not found: ${portPath}`);
      return false;
    }

    console.log(`[Reticulum] Removing RNode transport: ${portPath}`);

    // Send command to Python bridge
    this.sendCommand('remove_rnode', {
      port: portPath
    });

    // Remove from tracking
    this.rnode_transports.delete(portPath);

    this.emit('transport_removed', { type: 'rnode', port: portPath });
    return true;
  }

  /**
   * Get list of all transports
   */
  getTransports() {
    const transports = [];

    // Add RNode transports
    for (const [port, info] of this.rnode_transports) {
      transports.push({
        type: 'rnode',
        port: port,
        connected: info.connected,
        messages_sent: info.messages_sent,
        messages_received: info.messages_received,
        config: info.config,
        added_at: info.added_at
      });
    }

    // TODO: Add software transports (UDP, TCP, etc.) from RNS config

    return transports;
  }

  /**
   * Send a message to a Reticulum destination
   */
  async sendMessage(text, destinationHash, options = {}) {
    if (!this.running) {
      throw new Error('Reticulum not running');
    }

    console.log(`[Reticulum] Sending message to ${destinationHash.substring(0, 16)}...`);

    this.sendCommand('send', {
      destination_hash: destinationHash,
      text: text,
      want_ack: options.wantAck || false
    });

    this.messageStats.sent++;
  }

  /**
   * Announce our destination to the network
   */
  async announce() {
    if (!this.running) {
      return;
    }

    console.log('[Reticulum] Announcing destination...');
    this.sendCommand('announce', {});
    this.messageStats.announces++;
  }

  /**
   * Request list of transports from Python bridge
   */
  async requestTransportsList() {
    if (!this.running) {
      return [];
    }

    this.sendCommand('list_transports', {});
  }

  /**
   * Send command to Python RNS bridge
   */
  sendCommand(type, data) {
    if (!this.rnsPython || !this.running) {
      console.warn('[Reticulum] Cannot send command: Python bridge not running');
      return;
    }

    const command = JSON.stringify({ type, data }) + '\n';
    this.rnsPython.stdin.write(command);
  }

  /**
   * Handle data from Python RNS bridge
   */
  handlePythonData(data) {
    try {
      if (!this.jsonBuffer) {
        this.jsonBuffer = '';
      }

      // Append new data to buffer
      this.jsonBuffer += data.toString();

      // Split by newlines and process complete lines
      const lines = this.jsonBuffer.split('\n');

      // Keep the last incomplete line in the buffer
      this.jsonBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip non-JSON lines (like RNS initialization messages)
        if (!trimmed.startsWith('{')) {
          console.log(`[Reticulum Python] ${trimmed}`);
          continue;
        }

        try {
          const message = JSON.parse(trimmed);
          this.handlePythonMessage(message);
        } catch (parseError) {
          console.error('[Reticulum] Error parsing JSON line:', parseError.message);
          console.error('[Reticulum] Problematic line:', trimmed.substring(0, 100));
        }
      }
    } catch (error) {
      console.error('[Reticulum] Error handling Python data:', error);
    }
  }

  /**
   * Handle parsed message from Python RNS bridge
   */
  handlePythonMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'init':
        this.handleInit(data);
        break;

      case 'message':
        this.handleMessage(data);
        break;

      case 'announce_sent':
        console.log(`[Reticulum] Announce sent for destination: ${data.destination_hash}`);
        break;

      case 'link_established':
        console.log(`[Reticulum] Link established: ${data.destination_hash}`);
        this.emit('link_established', data);
        break;

      case 'transport_added':
        console.log(`[Reticulum] Transport added: ${data.type} ${data.port}`);
        break;

      case 'transport_removed':
        console.log(`[Reticulum] Transport removed: ${data.type} ${data.port}`);
        break;

      case 'transport_error':
        console.error(`[Reticulum] Transport error: ${data.port} - ${data.error}`);
        this.emit('transport_error', data);
        break;

      case 'transports_list':
        this.emit('transports_list', data.transports);
        break;

      case 'send_success':
        console.log(`[Reticulum] Message sent successfully to ${data.destination_hash.substring(0, 16)}...`);
        break;

      case 'send_failed':
        console.error(`[Reticulum] Message send failed: ${data.error}`);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.warn(`[Reticulum] Unknown message type: ${type}`);
    }
  }

  /**
   * Handle initialization message from Python
   */
  handleInit(data) {
    this.identity = data.identity;
    this.destination = data.destination;

    console.log(`[Reticulum] Identity: ${this.identity.hash}`);
    console.log(`[Reticulum] Destination: ${this.destination.hash}`);

    this.emit('initialized', {
      identity: this.identity,
      destination: this.destination
    });
  }

  /**
   * Handle incoming message from Reticulum network
   */
  handleMessage(data) {
    try {
      this.messageStats.received++;

      console.log(`[Reticulum] Message received from ${data.from_hash.substring(0, 16)}...: "${data.text}"`);

      // Emit message event
      this.emit('message', {
        id: `rns-${Date.now()}-${data.from_hash.substring(0, 8)}`,
        timestamp: new Date(),
        from: data.from_hash,
        to: data.to_hash,
        text: data.text,
        rssi: data.rssi,
        snr: data.snr,
        protocol: 'reticulum'
      });
    } catch (error) {
      console.error('[Reticulum] Error handling message:', error);
    }
  }

  /**
   * Wait for Python RNS bridge initialization
   */
  async waitForInit(timeout = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for Reticulum initialization (network discovery may take time)'));
      }, timeout);

      const onInit = () => {
        clearTimeout(timer);
        this.removeListener('initialized', onInit);
        resolve();
      };

      this.once('initialized', onInit);
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      running: this.running,
      identity: this.identity,
      destination: this.destination,
      transports: this.getTransports().length,
      rnode_transports: this.rnode_transports.size,
      messages_sent: this.messageStats.sent,
      messages_received: this.messageStats.received,
      announces: this.messageStats.announces
    };
  }
}

// Export singleton instance getter
export default ReticulumProtocol;
