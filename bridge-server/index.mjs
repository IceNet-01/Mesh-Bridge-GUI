#!/usr/bin/env node

/**
 * Meshtastic Bridge Server
 *
 * This Node.js server bridges Meshtastic radios (via official @meshtastic libraries)
 * to the PWA frontend (via WebSocket).
 *
 * Architecture:
 * - Uses @meshtastic/transport-node-serial for serial communication
 * - Uses @meshtastic/core for protocol handling
 * - Handles all Meshtastic protocol details (protobuf, framing, etc.)
 * - Exposes simple WebSocket API for PWA to consume
 */

import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';
import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';

class MeshtasticBridgeServer {
  constructor(port = 8080) {
    this.wsPort = port;
    this.wss = null;
    this.radios = new Map(); // radioId -> { device, transport, port, info }
    this.clients = new Set(); // WebSocket clients
    this.messageHistory = [];
    this.maxHistorySize = 500;
  }

  /**
   * Start the WebSocket server
   */
  async start() {
    console.log('🚀 Meshtastic Bridge Server starting...');
    console.log('📦 Using latest @meshtastic packages from Meshtastic Web monorepo');

    // Create WebSocket server
    this.wss = new WebSocketServer({ port: this.wsPort });

    this.wss.on('connection', (ws) => {
      console.log('📱 PWA client connected');
      this.clients.add(ws);

      // Send recent message history to new client
      ws.send(JSON.stringify({
        type: 'history',
        messages: this.messageHistory
      }));

      // Send current radio status
      const radiosStatus = Array.from(this.radios.entries()).map(([id, radio]) => ({
        id,
        port: radio.port,
        status: 'connected',
        info: radio.info
      }));

      ws.send(JSON.stringify({
        type: 'radios',
        radios: radiosStatus
      }));

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('❌ Error handling client message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });

      ws.on('close', () => {
        console.log('📱 PWA client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    console.log(`✅ WebSocket server listening on ws://localhost:${this.wsPort}`);
    console.log('📻 Ready to connect radios...');
    console.log('');
    console.log('💡 Connect your PWA to: ws://localhost:8080');
  }

  /**
   * Handle messages from PWA clients
   */
  async handleClientMessage(ws, message) {
    try {
      switch (message.type) {
        case 'list-ports':
          await this.listPorts(ws);
          break;

        case 'connect':
          await this.connectRadio(ws, message.port);
          break;

        case 'disconnect':
          await this.disconnectRadio(ws, message.radioId);
          break;

        case 'send-text':
          await this.sendText(ws, message.radioId, message.text, message.channel);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${message.type}`
          }));
      }
    } catch (error) {
      console.error('❌ Error in handleClientMessage:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  }

  /**
   * List available serial ports
   */
  async listPorts(ws) {
    try {
      const ports = await SerialPort.list();

      // Filter for likely Meshtastic devices
      const filteredPorts = ports.filter(port =>
        port.path.includes('USB') ||
        port.path.includes('ACM') ||
        port.path.includes('tty') ||
        port.manufacturer?.toLowerCase().includes('silicon') ||
        port.manufacturer?.toLowerCase().includes('uart') ||
        port.manufacturer?.toLowerCase().includes('ch340') ||
        port.manufacturer?.toLowerCase().includes('cp210')
      );

      console.log(`📋 Found ${filteredPorts.length} potential serial ports`);

      ws.send(JSON.stringify({
        type: 'ports-list',
        ports: filteredPorts.map(p => ({
          path: p.path,
          manufacturer: p.manufacturer,
          serialNumber: p.serialNumber,
          vendorId: p.vendorId,
          productId: p.productId
        }))
      }));
    } catch (error) {
      console.error('❌ Error listing ports:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to list ports: ${error.message}`
      }));
    }
  }

  /**
   * Connect to a Meshtastic radio using modern @meshtastic libraries
   */
  async connectRadio(ws, portPath) {
    try {
      console.log(`📻 Connecting to radio on ${portPath}...`);

      const radioId = `radio-${Date.now()}`;

      // Create serial transport using the static create method
      const transport = await TransportNodeSerial.create(portPath, 115200);
      console.log(`✅ Transport connected for ${radioId}`);

      // Create Meshtastic device
      const device = new MeshDevice(transport);

      // Subscribe to connection status events
      device.events.onDeviceStatus.subscribe((status) => {
        console.log(`📊 Radio ${radioId} status:`, status);

        // Handle disconnection
        if (status === 2) { // DeviceDisconnected
          console.log(`📻 Radio ${radioId} disconnected, cleaning up...`);
          this.handleRadioDisconnect(radioId);
        }
      });

      device.events.onMessagePacket.subscribe((packet) => {
        this.handleMessagePacket(radioId, portPath, packet);
      });

      device.events.onNodeInfoPacket.subscribe((node) => {
        console.log(`ℹ️  Radio ${radioId} node info:`, node);
      });

      // Store radio reference
      this.radios.set(radioId, {
        device,
        transport,
        port: portPath,
        info: {
          port: portPath,
          connectedAt: new Date()
        }
      });

      console.log(`✅ Successfully connected to radio ${radioId} on ${portPath}`);

      // Notify all clients
      this.broadcast({
        type: 'radio-connected',
        radio: {
          id: radioId,
          port: portPath,
          status: 'connected',
          info: {
            port: portPath,
            connectedAt: new Date()
          }
        }
      });

    } catch (error) {
      console.error(`❌ Failed to connect to ${portPath}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Connection failed: ${error.message}`
      }));
    }
  }

  /**
   * Handle radio disconnection (graceful cleanup)
   */
  handleRadioDisconnect(radioId) {
    try {
      const radio = this.radios.get(radioId);
      if (radio) {
        console.log(`🔌 Cleaning up radio ${radioId}...`);

        // Remove from map
        this.radios.delete(radioId);

        // Notify all clients
        this.broadcast({
          type: 'radio-disconnected',
          radioId: radioId
        });

        console.log(`✅ Radio ${radioId} cleaned up successfully`);
      }
    } catch (error) {
      console.error(`❌ Error cleaning up radio ${radioId}:`, error);
    }
  }

  /**
   * Handle message packets from radio (using official library)
   */
  handleMessagePacket(radioId, portPath, packet) {
    try {
      console.log(`📨 Message packet from ${radioId}:`, {
        from: packet.from,
        to: packet.to,
        channel: packet.channel,
        portnum: packet.portnum,
        payloadLength: packet.payload?.length || 0
      });

      // Extract text from payload if it's a text message
      let text = null;

      if (packet.payload && packet.payload.length > 0) {
        try {
          // Try to decode as UTF-8 text
          text = new TextDecoder().decode(packet.payload);

          // Check if it's actually printable text
          if (!/^[\x20-\x7E\n\r\t]+$/.test(text)) {
            text = null; // Not printable text
          }
        } catch (e) {
          text = null;
        }
      }

      if (text) {
        const message = {
          id: packet.id || `msg-${Date.now()}`,
          timestamp: new Date(packet.rxTime ? packet.rxTime * 1000 : Date.now()),
          from: packet.from,
          to: packet.to,
          channel: packet.channel || 0,
          portnum: packet.portnum,
          text: text,
          radioId: radioId,
          portPath: portPath,
          rssi: packet.rxRssi,
          snr: packet.rxSnr,
          hopLimit: packet.hopLimit
        };

        console.log(`💬 Text message from ${packet.from}: "${text}"`);

        // Add to history
        this.messageHistory.push(message);
        if (this.messageHistory.length > this.maxHistorySize) {
          this.messageHistory.shift();
        }

        // Broadcast to all connected clients
        this.broadcast({
          type: 'message',
          message: message
        });
      } else {
        console.log(`📦 Non-text packet (portnum: ${packet.portnum})`);
      }
    } catch (error) {
      console.error('❌ Error handling message packet:', error);
    }
  }

  /**
   * Send text message via a radio
   */
  async sendText(ws, radioId, text, channel = 0) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      console.log(`📤 Sending text via ${radioId}: "${text}"`);

      // Send using the device
      await radio.device.sendText(text, channel);

      console.log(`✅ Text sent successfully`);

      ws.send(JSON.stringify({
        type: 'send-success',
        radioId: radioId
      }));

    } catch (error) {
      console.error('❌ Send failed:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Send failed: ${error.message}`
      }));
    }
  }

  /**
   * Disconnect a radio
   */
  async disconnectRadio(ws, radioId) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      console.log(`📻 Disconnecting radio ${radioId}...`);
      await radio.transport.disconnect();
      this.radios.delete(radioId);

      console.log(`✅ Disconnected radio ${radioId}`);

      this.broadcast({
        type: 'radio-disconnected',
        radioId: radioId
      });

    } catch (error) {
      console.error('❌ Disconnect error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Disconnect failed: ${error.message}`
      }));
    }
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (error) {
          console.error('❌ Error broadcasting to client:', error);
        }
      }
    });
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown() {
    console.log('\n🛑 Shutting down bridge server...');

    // Disconnect all radios
    for (const [radioId, radio] of this.radios.entries()) {
      try {
        await radio.transport.disconnect();
        console.log(`📻 Disconnected ${radioId}`);
      } catch (error) {
        console.error(`Error disconnecting ${radioId}:`, error);
      }
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    console.log('✅ Bridge server shut down');
    process.exit(0);
  }
}

// Main entry point
const port = process.env.BRIDGE_PORT || 8080;
const server = new MeshtasticBridgeServer(port);

server.start().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await server.shutdown();
});

process.on('SIGTERM', async () => {
  await server.shutdown();
});

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});

export default MeshtasticBridgeServer;
