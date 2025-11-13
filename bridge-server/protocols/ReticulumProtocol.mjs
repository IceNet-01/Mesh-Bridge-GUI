/**
 * Reticulum Protocol Handler
 *
 * Implements BaseProtocol for Reticulum Network Stack (RNS)
 *
 * NOTE: This is a reference implementation. Reticulum is primarily a Python stack,
 * so this implementation uses child_process to interact with a Python RNS instance
 * or uses a serial protocol adapter if available.
 */

import { BaseProtocol } from './BaseProtocol.mjs';
import { spawn } from 'child_process';
import { SerialPort } from 'serialport';
import { createHash } from 'crypto';

export class ReticulumProtocol extends BaseProtocol {
  constructor(radioId, portPath, options = {}) {
    super(radioId, portPath, options);
    this.serialPort = null;
    this.rnsPython = null;
    this.identity = null;
    this.destinations = new Map(); // destination_hash -> destination_info
    this.buffer = Buffer.alloc(0);
    this.jsonBuffer = ''; // Buffer for incomplete JSON lines from Python
  }

  getProtocolName() {
    return 'reticulum';
  }

  async connect() {
    try {
      console.log(`[Reticulum] Connecting to ${this.portPath}...`);

      // Option 1: Direct serial connection (if using RNode or similar hardware)
      if (this.options.useDirectSerial) {
        await this.connectDirectSerial();
      } else {
        // Option 2: Use Python RNS bridge (recommended for full Reticulum features)
        await this.connectViaPython();
      }

      this.connected = true;
      console.log(`[Reticulum] Connected successfully to ${this.portPath}`);

      return true;
    } catch (error) {
      console.error(`[Reticulum] Connection failed:`, error);
      this.handleError(error);
      throw error;
    }
  }

  async connectDirectSerial() {
    // Direct serial connection for RNode hardware running in Reticulum mode
    this.serialPort = new SerialPort({
      path: this.portPath,
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    });

    return new Promise((resolve, reject) => {
      this.serialPort.on('open', () => {
        console.log('[Reticulum] Serial port opened');
        this.setupSerialHandlers();

        // Generate or load identity
        this.generateIdentity();

        // Set up initial node info
        this.updateNodeInfo({
          nodeId: this.identity.hash,
          longName: `Reticulum Node ${this.identity.hash.substring(0, 8)}`,
          shortName: 'RNS',
          hwModel: 'Reticulum'
        });

        resolve();
      });

      this.serialPort.on('error', (error) => {
        console.error('[Reticulum] Serial port error:', error);
        reject(error);
      });
    });
  }

  async connectViaPython() {
    // Spawn Python process to run RNS bridge
    // This requires a Python script (rns_bridge.py) that communicates via stdio
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const pythonScript = this.options.pythonBridge || join(__dirname, '..', 'rns_bridge.py');

    console.log(`[Reticulum] Starting Python RNS bridge: ${pythonScript}`);

    const args = [];
    if (this.options.rnsConfigPath) {
      args.push('--config', this.options.rnsConfigPath);
    }
    if (this.options.identityPath) {
      args.push('--identity', this.options.identityPath);
    }

    this.rnsPython = spawn('python3', [pythonScript, ...args], {
      cwd: this.options.rnsConfigPath || process.cwd(),
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
      this.connected = false;
      this.emit('disconnected');
    });

    this.rnsPython.on('error', (error) => {
      console.error(`[Reticulum] Failed to start Python bridge:`, error);
      this.handleError(error);
    });

    // Wait for initialization
    await this.waitForPythonInit();
  }

  setupSerialHandlers() {
    this.serialPort.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.processBuffer();
    });
  }

  processBuffer() {
    // Process Reticulum/RNode packets from serial buffer
    // Reticulum packets have a specific format
    while (this.buffer.length > 0) {
      // Look for packet header (example format)
      if (this.buffer[0] !== 0xC0) { // FEND character
        this.buffer = this.buffer.slice(1);
        continue;
      }

      // Find end of packet
      const endIndex = this.buffer.indexOf(0xC0, 1);
      if (endIndex === -1) break;

      // Extract packet
      const packetData = this.buffer.slice(1, endIndex);
      this.buffer = this.buffer.slice(endIndex + 1);

      // Process packet
      this.processPacket(packetData);
    }
  }

  processPacket(data) {
    try {
      // Decode Reticulum packet
      // This is a simplified example - actual Reticulum protocol is more complex
      if (data.length < 2) return;

      const packetType = data[0];
      const payload = data.slice(1);

      switch (packetType) {
        case 0x01: // Announce packet
          this.handleAnnounce(payload);
          break;
        case 0x02: // Data packet (message)
          this.handleDataPacket(payload);
          break;
        case 0x03: // Link request
          this.handleLinkRequest(payload);
          break;
        default:
          console.log(`[Reticulum] Unknown packet type: 0x${packetType.toString(16)}`);
      }
    } catch (error) {
      console.error('[Reticulum] Error processing packet:', error);
      this.handleError(error);
    }
  }

  handleAnnounce(data) {
    // Handle announce packets (nodes announcing their identity)
    try {
      const destHash = data.slice(0, 16).toString('hex');
      const name = data.slice(16).toString('utf8');

      this.destinations.set(destHash, {
        hash: destHash,
        name: name,
        lastSeen: new Date()
      });

      // Update channels (destinations in Reticulum)
      this.updateChannels(Array.from(this.destinations.values()).map((dest, idx) => ({
        index: idx,
        name: dest.name,
        psk: dest.hash, // Use hash as "PSK" for matching
        destinationHash: dest.hash
      })));

      console.log(`[Reticulum] New destination announced: ${name} (${destHash})`);
    } catch (error) {
      console.error('[Reticulum] Error handling announce:', error);
    }
  }

  handleDataPacket(data) {
    try {
      // Extract message from data packet
      if (data.length < 32) return;

      const fromHash = data.slice(0, 16).toString('hex');
      const toHash = data.slice(16, 32).toString('hex');
      const messageData = data.slice(32);
      const text = messageData.toString('utf8');

      const packet = {
        id: createHash('sha256').update(data).digest('hex').substring(0, 16),
        timestamp: new Date(),
        from: parseInt(fromHash.substring(0, 8), 16),
        to: parseInt(toHash.substring(0, 8), 16),
        channel: this.findDestinationChannel(toHash),
        portnum: 1,
        text: text,
        fromHash: fromHash,
        toHash: toHash
      };

      this.emitMessage(packet);
    } catch (error) {
      console.error('[Reticulum] Error handling data packet:', error);
      this.handleError(error);
    }
  }

  handleLinkRequest(data) {
    // Handle link establishment requests
    console.log('[Reticulum] Link request received');
    // Implement link handling if needed
  }

  handlePythonData(data) {
    // Parse JSON messages from Python bridge
    // Handle partial JSON by buffering incomplete lines
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

          switch (message.type) {
          case 'init':
            this.identity = message.data.identity;
            this.updateNodeInfo({
              nodeId: message.data.identity.hash,
              longName: message.data.identity.name || 'Reticulum Node',
              shortName: 'RNS',
              hwModel: 'Reticulum'
            });
            console.log(`[Reticulum] Initialized with identity: ${message.data.identity.hash.substring(0, 16)}...`);
            console.log(`[Reticulum] Destination: ${message.data.destination.name} (${message.data.destination.hash.substring(0, 16)}...)`);
            break;

          case 'message':
            // Handle received message
            this.handleReticulumMessage(message.data);
            break;

          case 'announce_sent':
            console.log(`[Reticulum] Announce sent for destination: ${message.data.destination_hash.substring(0, 16)}...`);
            break;

          case 'link_established':
            console.log(`[Reticulum] Link established: ${message.data.destination_hash.substring(0, 16)}...`);
            break;

          case 'send_success':
            console.log(`[Reticulum] Message sent successfully to ${message.data.destination_hash.substring(0, 16)}...`);
            break;

          case 'send_failed':
            console.error(`[Reticulum] Send failed: ${message.data.error}`);
            this.handleError(new Error(message.data.error));
            break;

          case 'pong':
            // Response to ping
            break;

          default:
            console.log(`[Reticulum] Unknown message type: ${message.type}`);
        }
        } catch (parseError) {
          console.error('[Reticulum] Error parsing JSON line:', parseError.message);
          console.error('[Reticulum] Problematic line:', trimmed);
        }
      }
    } catch (error) {
      console.error('[Reticulum] Error handling Python data:', error);
    }
  }

  handleReticulumMessage(data) {
    try {
      // Convert hash strings to numeric IDs for compatibility with bridge
      const fromId = parseInt(data.from_hash.substring(0, 8), 16);
      const toId = parseInt(data.to_hash.substring(0, 8), 16);

      const packet = {
        id: `rns-${Date.now()}-${fromId}`,
        timestamp: new Date(),
        from: fromId,
        to: toId,
        channel: 0, // Reticulum doesn't use channels, use 0
        portnum: 1,
        text: data.text,
        fromHash: data.from_hash,
        toHash: data.to_hash,
        rssi: data.rssi,
        snr: data.snr
      };

      console.log(`[Reticulum] Message received from ${data.from_hash.substring(0, 16)}...: "${data.text}"`);
      this.emitMessage(packet);
    } catch (error) {
      console.error('[Reticulum] Error handling Reticulum message:', error);
      this.handleError(error);
    }
  }

  async waitForPythonInit(timeout = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for Python RNS initialization (network discovery may take time)'));
      }, timeout);

      const checkInit = () => {
        if (this.identity) {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };

      checkInit();
    });
  }

  generateIdentity() {
    // Generate a simple identity hash for this node
    const randomData = crypto.randomBytes(32);
    this.identity = {
      hash: createHash('sha256').update(randomData).digest('hex').substring(0, 32),
      name: `RNS-${randomData.toString('hex').substring(0, 8)}`
    };
  }

  findDestinationChannel(destHash) {
    const destinations = Array.from(this.destinations.values());
    const index = destinations.findIndex(d => d.hash === destHash);
    return index >= 0 ? index : 0;
  }

  async disconnect() {
    try {
      console.log(`[Reticulum] Disconnecting from ${this.portPath}...`);

      if (this.serialPort && this.serialPort.isOpen) {
        await new Promise((resolve) => {
          this.serialPort.close(() => resolve());
        });
        this.serialPort = null;
      }

      if (this.rnsPython) {
        this.rnsPython.kill();
        this.rnsPython = null;
      }

      this.connected = false;
      console.log(`[Reticulum] Disconnected successfully`);
    } catch (error) {
      console.error('[Reticulum] Error during disconnect:', error);
      this.handleError(error);
      throw error;
    }
  }

  async sendMessage(text, channel, options = {}) {
    try {
      if (!this.connected) {
        throw new Error('Device not connected');
      }

      // For Reticulum, channel parameter can be either:
      // - A numeric index (for compatibility)
      // - A destination hash string (for direct addressing)
      let destinationHash;

      if (typeof channel === 'string') {
        // Direct destination hash provided
        destinationHash = channel;
      } else {
        // Find destination for this channel index
        const destinations = Array.from(this.destinations.values());
        const destination = destinations[channel];

        if (!destination) {
          // For Reticulum, we can broadcast to our own destination
          // This is useful for testing and local network communication
          destinationHash = this.identity?.hash;
          console.log(`[Reticulum] No destination for channel ${channel}, using own hash`);
        } else {
          destinationHash = destination.hash;
        }
      }

      if (!destinationHash) {
        throw new Error(`No destination available for sending`);
      }

      // Build and send packet
      if (this.serialPort) {
        await this.sendDirectSerial(text, destinationHash);
      } else if (this.rnsPython) {
        await this.sendViaPython(text, destinationHash);
      } else {
        throw new Error('No transport available (neither serial nor Python bridge)');
      }

      this.stats.messagesSent++;
      console.log(`[Reticulum] Message sent to ${destinationHash.substring(0, 16)}...: ${text.substring(0, 50)}...`);

      return true;
    } catch (error) {
      console.error('[Reticulum] Error sending message:', error);
      this.handleError(error);
      throw error;
    }
  }

  async sendDirectSerial(text, destHash) {
    // Build Reticulum data packet
    const fromHashBuf = Buffer.from(this.identity.hash, 'hex');
    const toHashBuf = Buffer.from(destHash, 'hex');
    const textBuf = Buffer.from(text, 'utf8');

    const packet = Buffer.concat([
      Buffer.from([0xC0, 0x02]), // FEND + DATA packet type
      fromHashBuf.slice(0, 16),
      toHashBuf.slice(0, 16),
      textBuf,
      Buffer.from([0xC0]) // FEND end
    ]);

    return new Promise((resolve, reject) => {
      this.serialPort.write(packet, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async sendViaPython(text, destHash) {
    const message = JSON.stringify({
      type: 'send',
      data: {
        destination_hash: destHash,
        text: text
      }
    }) + '\n';

    this.rnsPython.stdin.write(message);
  }

  channelsMatch(channel1, channel2) {
    // In Reticulum, channels match if destination hashes match
    return channel1.destinationHash === channel2.destinationHash;
  }

  getProtocolMetadata() {
    return {
      identityHash: this.identity?.hash,
      destinations: this.destinations.size
    };
  }
}
