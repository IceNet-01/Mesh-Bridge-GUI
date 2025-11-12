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
    this.seenMessageIds = new Set(); // Track message IDs for deduplication
    this.maxSeenMessages = 1000; // Limit size of seen messages set

    // ===== MANUAL CHANNEL MAPPING FOR TESTING =====
    // Set to null to disable security checks and forward by index
    // Set to object for manual channel mapping:
    // { 0: 3, 1: 1 } means: incoming ch0→outgoing ch3, incoming ch1→outgoing ch1
    this.channelMap = null; // null = forward to same index (no security)

    // Set to true to enable security checks (PSK/name matching)
    // Set to false to bypass all security and use channelMap
    this.enableSecurity = false;

    console.log(`\n⚙️  BRIDGE CONFIGURATION:`);
    console.log(`   Security checks: ${this.enableSecurity ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Channel mapping: ${this.channelMap ? JSON.stringify(this.channelMap) : 'Same index (passthrough)'}`);
    console.log('');
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

      // Filter for actual USB/ACM devices (not virtual ttyS* ports)
      const filteredPorts = ports.filter(port => {
        // Exclude virtual serial ports (ttyS*)
        if (port.path.match(/\/dev\/ttyS\d+$/)) {
          return false;
        }

        // Include USB and ACM devices
        return (
          port.path.includes('USB') ||
          port.path.includes('ACM') ||
          port.manufacturer?.toLowerCase().includes('silicon') ||
          port.manufacturer?.toLowerCase().includes('uart') ||
          port.manufacturer?.toLowerCase().includes('ch340') ||
          port.manufacturer?.toLowerCase().includes('cp210') ||
          port.manufacturer?.toLowerCase().includes('ftdi')
        );
      });

      console.log(`📋 Found ${filteredPorts.length} USB/ACM serial ports (filtered ${ports.length - filteredPorts.length} virtual ports)`);

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
      console.log(`📻 MeshDevice created for ${radioId}, configuring...`);

      // Subscribe to connection status events BEFORE configuring
      device.events.onDeviceStatus.subscribe((status) => {
        console.log(`📊 Radio ${radioId} status:`, status);

        // Handle disconnection
        if (status === 2) { // DeviceDisconnected
          console.log(`📻 Radio ${radioId} disconnected, cleaning up...`);
          this.handleRadioDisconnect(radioId);
        }
      });

      // Subscribe to ALL mesh packets to see what's coming through
      device.events.onMeshPacket.subscribe((packet) => {
        console.log(`📦 [DEBUG] Raw MeshPacket from ${radioId}:`, {
          from: packet.from,
          to: packet.to,
          channel: packet.channel,
          decoded: packet.decoded ? {
            portnum: packet.decoded.portnum,
            payloadVariant: packet.decoded.payloadVariant
          } : null
        });
      });

      device.events.onMessagePacket.subscribe((packet) => {
        console.log(`💬 [DEBUG] onMessagePacket fired for ${radioId}!`);
        this.handleMessagePacket(radioId, portPath, packet);
      });

      device.events.onMyNodeInfo.subscribe((myNodeInfo) => {
        console.log(`🆔 Radio ${radioId} my node info:`, myNodeInfo);
        // Store our own node number to prevent forwarding loops
        const radio = this.radios.get(radioId);
        if (radio) {
          radio.nodeNum = myNodeInfo.myNodeNum;
          console.log(`✅ Radio ${radioId} node number set to ${myNodeInfo.myNodeNum}`);
        }
      });

      device.events.onNodeInfoPacket.subscribe((node) => {
        console.log(`ℹ️  Radio ${radioId} node info:`, node);
      });

      // Subscribe to channel configuration packets to track which channels are configured
      device.events.onChannelPacket.subscribe((channelPacket) => {
        const radio = this.radios.get(radioId);
        if (radio) {
          if (!radio.channels) {
            radio.channels = new Map();
          }
          const channelInfo = {
            index: channelPacket.index,
            role: channelPacket.role,
            name: channelPacket.settings?.name || '',
            psk: channelPacket.settings?.psk ? Buffer.from(channelPacket.settings.psk).toString('base64') : ''
          };
          radio.channels.set(channelPacket.index, channelInfo);
          console.log(`🔐 Radio ${radioId} channel ${channelPacket.index}:`, {
            name: channelInfo.name || '(unnamed)',
            role: channelInfo.role === 1 ? 'PRIMARY' : 'SECONDARY',
            pskLength: channelInfo.psk.length
          });
        }
      });

      // Store radio reference BEFORE configure() so onMyNodeInfo can find it
      this.radios.set(radioId, {
        device,
        transport,
        port: portPath,
        nodeNum: null, // Will be set when we receive myNodeInfo (during configure)
        channels: new Map(), // Will be populated when channel packets arrive during configure()
        info: {
          port: portPath,
          connectedAt: new Date()
        }
      });

      // Configure the device (required for message flow)
      console.log(`⚙️  Configuring radio ${radioId}...`);
      await device.configure();
      console.log(`✅ Radio ${radioId} configured successfully`);

      // Set up heartbeat to keep serial connection alive (15 min timeout otherwise)
      device.setHeartbeatInterval(30000); // Send heartbeat every 30 seconds
      console.log(`💓 Heartbeat enabled for radio ${radioId}`);

      console.log(`✅ Successfully connected to radio ${radioId} on ${portPath}`);

      // Log all configured channels after configuration completes
      const radio = this.radios.get(radioId);
      console.log(`\n📋 ========== Radio ${radioId} Channel Configuration ==========`);
      if (radio && radio.channels && radio.channels.size > 0) {
        radio.channels.forEach((ch, idx) => {
          const roleName = ch.role === 1 ? 'PRIMARY' : ch.role === 0 ? 'SECONDARY' : 'DISABLED';
          const pskDisplay = ch.psk ? `${ch.psk.substring(0, 8)}...` : '(none)';
          console.log(`   [${idx}] "${ch.name || '(unnamed)'}" [${roleName}] PSK: ${pskDisplay}`);
        });
      } else {
        console.log(`   ⚠️  No channels configured yet (this is unusual)`);
      }
      console.log(`============================================================\n`);

      // Notify all clients AFTER configuration is complete
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
   * PacketMetadata<string> structure: { id, rxTime, type, from, to, channel, data }
   */
  handleMessagePacket(radioId, portPath, packet) {
    try {
      console.log(`📨 Message packet from ${radioId}:`, {
        id: packet.id,
        from: packet.from,
        to: packet.to,
        channel: packet.channel,
        type: packet.type,
        dataType: typeof packet.data,
        data: packet.data
      });

      // The @meshtastic/core library already decodes text messages
      // packet.data contains the decoded string for text messages
      const text = packet.data;

      if (text && typeof text === 'string' && text.length > 0) {
        // Check if this message is FROM one of our bridge radios (forwarding loop prevention)
        const isFromOurBridgeRadio = Array.from(this.radios.values()).some(
          radio => radio.nodeNum === packet.from
        );

        if (isFromOurBridgeRadio) {
          console.log(`🔁 Message from our own bridge radio ${packet.from}, skipping forward to prevent loop`);
          // Still show in GUI but don't forward
        }

        // Check for duplicate message (both radios may receive the same broadcast)
        if (this.seenMessageIds.has(packet.id)) {
          console.log(`🔁 Duplicate message ${packet.id} ignored (already processed)`);
          return;
        }

        // Mark message as seen
        this.seenMessageIds.add(packet.id);

        // Limit size of seen messages set to prevent memory leak
        if (this.seenMessageIds.size > this.maxSeenMessages) {
          const firstId = this.seenMessageIds.values().next().value;
          this.seenMessageIds.delete(firstId);
        }

        const message = {
          id: packet.id || `msg-${Date.now()}`,
          timestamp: packet.rxTime instanceof Date ? packet.rxTime : new Date(),
          from: packet.from,
          to: packet.to,
          channel: packet.channel || 0,
          text: text,
          radioId: radioId,
          portPath: portPath,
          type: packet.type,
          forwarded: isFromOurBridgeRadio // Mark if this was forwarded by us
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

        // BRIDGE: Forward to all OTHER radios ONLY if message is NOT from our bridge
        if (!isFromOurBridgeRadio) {
          this.forwardToOtherRadios(radioId, text, packet.channel);
        }
      } else {
        console.log(`📦 Non-text packet or empty data:`, packet.data);
      }
    } catch (error) {
      console.error('❌ Error handling message packet:', error, packet);
    }
  }

  /**
   * Check if two channels have matching configuration (name and PSK)
   * for secure bridging
   */
  channelsMatch(sourceChannel, targetChannel) {
    if (!sourceChannel || !targetChannel) {
      return false;
    }

    // PSK MUST match (this is the encryption key)
    const pskMatch = sourceChannel.psk === targetChannel.psk;
    if (!pskMatch) {
      return false;
    }

    // If both channels have names, they must match
    // If both are unnamed, they match by PSK only (but log warning)
    const sourceName = sourceChannel.name || '';
    const targetName = targetChannel.name || '';

    // SECURITY: If names are present, they MUST match
    if (sourceName && targetName && sourceName !== targetName) {
      return false;
    }

    // If either is unnamed, only PSK matching applies (less secure, warn)
    if (!sourceName || !targetName) {
      console.warn(`⚠️  Matching channels by PSK only (missing names): "${sourceName}" vs "${targetName}"`);
    }

    return true;
  }

  /**
   * Forward a message to all radios except the source
   * Behavior depends on this.enableSecurity flag
   */
  async forwardToOtherRadios(sourceRadioId, text, channel) {
    try {
      const otherRadios = Array.from(this.radios.entries()).filter(
        ([radioId]) => radioId !== sourceRadioId
      );

      if (otherRadios.length === 0) {
        console.log(`⚠️  No other radios to forward to`);
        return;
      }

      // ===== SIMPLE MODE (NO SECURITY) =====
      if (!this.enableSecurity) {
        // Determine target channel: use map if provided, otherwise same index
        const targetChannel = this.channelMap ? (this.channelMap[channel] ?? channel) : channel;

        console.log(`🔀 [NO SECURITY] Forwarding from channel ${channel} → channel ${targetChannel}`);

        const forwardPromises = otherRadios.map(async ([targetRadioId, radio]) => {
          try {
            await radio.device.sendText(text, "broadcast", false, targetChannel);
            console.log(`✅ Forwarded to ${targetRadioId} on channel ${targetChannel}`);
            return { radioId: targetRadioId, success: true };
          } catch (error) {
            console.error(`❌ Failed to forward to ${targetRadioId}:`, error.message);
            return { radioId: targetRadioId, success: false, error: error.message };
          }
        });

        const results = await Promise.allSettled(forwardPromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        console.log(`📊 Forwarding complete: ${successCount}/${otherRadios.length} successful`);
        return;
      }

      // ===== SECURITY MODE (PSK/NAME MATCHING) =====
      const sourceRadio = this.radios.get(sourceRadioId);
      if (!sourceRadio) {
        console.error(`❌ Source radio ${sourceRadioId} not found`);
        return;
      }

      const sourceChannel = sourceRadio.channels?.get(channel);
      if (!sourceChannel) {
        console.warn(`⚠️  Source radio ${sourceRadioId} has no channel ${channel} configured`);
        return;
      }

      console.log(`🔀 [SECURITY MODE] Forwarding from source channel ${channel}:`);
      console.log(`   Name: "${sourceChannel.name}"`);
      console.log(`   PSK: ${sourceChannel.psk.substring(0, 16)}...`);
      console.log(`   Searching for matching channel on other radios...`);

      // Forward to each radio that has matching channel configuration
      const forwardPromises = otherRadios.map(async ([targetRadioId, radio]) => {
        try {
          // Search ALL channels on target radio for matching name+PSK
          let matchingChannelIndex = null;
          let matchingChannel = null;

          if (radio.channels) {
            console.log(`  🔍 Searching ${radio.channels.size} channels on ${targetRadioId} for match...`);
            for (const [idx, ch] of radio.channels.entries()) {
              const pskMatch = sourceChannel.psk === ch.psk;
              const nameMatch = sourceChannel.name === ch.name;
              console.log(`    Channel ${idx}: "${ch.name}" PSK:${ch.psk.substring(0,8)}... | PSK match: ${pskMatch}, Name match: ${nameMatch}`);

              if (this.channelsMatch(sourceChannel, ch)) {
                console.log(`    ✅ MATCH FOUND on channel ${idx}`);
                matchingChannelIndex = idx;
                matchingChannel = ch;
                break;
              }
            }
          }

          if (matchingChannelIndex === null) {
            console.warn(`🔒 SECURITY: Target radio ${targetRadioId} has no channel matching "${sourceChannel.name}" (PSK: ${sourceChannel.psk.substring(0,8)}...), skipping`);
            return { radioId: targetRadioId, success: false, reason: 'no_matching_channel' };
          }

          // If the matching channel is on a DIFFERENT index, log it
          if (matchingChannelIndex !== channel) {
            console.log(`🔀 Cross-channel forward: source channel ${channel} → target channel ${matchingChannelIndex} (both "${sourceChannel.name}")`);
          }

          await radio.device.sendText(text, "broadcast", false, matchingChannelIndex);
          console.log(`✅ Forwarded broadcast to ${targetRadioId} on channel ${matchingChannelIndex} ("${matchingChannel.name}")`);
          return { radioId: targetRadioId, success: true, targetChannel: matchingChannelIndex };
        } catch (error) {
          console.error(`❌ Failed to forward to ${targetRadioId}:`, error.message);
          return { radioId: targetRadioId, success: false, error: error.message };
        }
      });

      const results = await Promise.allSettled(forwardPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const blockedCount = results.filter(r =>
        r.status === 'fulfilled' && r.value.reason === 'no_matching_channel'
      ).length;

      console.log(`📊 Forwarding complete: ${successCount}/${otherRadios.length} successful`);
      if (blockedCount > 0) {
        console.log(`🔒 ${blockedCount} radio(s) blocked - no matching channel configuration (name+PSK)`);
      }
    } catch (error) {
      console.error('❌ Error in forwardToOtherRadios:', error);
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

      console.log(`📤 Sending text via ${radioId}: "${text}" on channel ${channel}`);

      // Send using the device
      // sendText(text, destination, wantAck, channel)
      // Use "broadcast" as destination to broadcast on the specified channel
      await radio.device.sendText(text, "broadcast", false, channel);

      console.log(`✅ Text broadcast successfully on channel ${channel}`);

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
