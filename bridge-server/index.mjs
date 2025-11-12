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
 * - Serves static frontend files from dist/ directory in production
 */

import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';
import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, '..', 'dist');

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

    // ===== CHANNEL FORWARDING CONFIGURATION =====
    // Two modes for channel forwarding:
    //
    // MODE 1: Simple index-based forwarding (enableSmartMatching = false)
    //   - Fast and simple
    //   - channelMap = null: Forward channel 0→0, 1→1, etc (passthrough)
    //   - channelMap = {0: 3, 1: 1}: Forward channel 0→3, 1→1, etc (custom mapping)
    //
    // MODE 2: Smart PSK/name matching (enableSmartMatching = true)
    //   - Searches ALL channels on target radio for matching PSK+name
    //   - Handles radios with channels on different indices
    //   - Example: Radio A has "skynet" on ch0, Radio B has "skynet" on ch3
    //            → Automatically forwards ch0→ch3 maintaining encryption
    //   - REQUIRED for private channel forwarding with mixed configurations
    //
    this.enableSmartMatching = true;  // Recommended: true for correct cross-index forwarding
    this.channelMap = null;           // Only used when enableSmartMatching = false

    // ===== COMMAND SYSTEM CONFIGURATION =====
    // Interactive bridge commands triggered by prefix (default: #)
    // Users can send commands like "#weather Seattle" or "#ping"
    // Bridge responds instead of forwarding the message
    //
    this.commandsEnabled = true;         // Enable/disable command system
    this.commandPrefix = '#';            // Command prefix (e.g., # for #ping, ! for !ping)
    this.commandRateLimit = 10;          // Max commands per minute per user
    this.commandUsage = new Map();       // Track command usage for rate limiting
    this.bridgeStartTime = Date.now();   // Track uptime

    // Enabled commands list - remove any you don't want
    this.enabledCommands = [
      'ping', 'help', 'status', 'time', 'uptime', 'version',
      'weather', 'radios', 'channels', 'stats', 'nodes', 'ai', 'ask'
    ];

    // ===== AI ASSISTANT CONFIGURATION =====
    // Optional AI assistant powered by local LLM (Ollama)
    // Responds to questions via #ai or #ask commands
    //
    this.aiEnabled = false;                    // Enable/disable AI assistant (requires Ollama)
    this.aiEndpoint = 'http://localhost:11434'; // Ollama API endpoint
    this.aiModel = 'llama3.2:1b';              // Default model (fast, ~700MB)
    this.aiMaxTokens = 50;                     // Limit response length
    this.aiMaxResponseLength = 200;            // Max chars (Meshtastic limit ~237)
    this.aiTimeout = 15000;                    // 15 second timeout
    this.aiRateLimit = 3;                      // Max 3 AI queries per minute per user
    this.aiUsage = new Map();                  // Track AI usage separately
    this.aiSystemPrompt = 'You are a helpful assistant for a mesh network. Keep ALL responses under 200 characters. Be extremely concise and direct. No explanations unless asked.';

    console.log(`\n⚙️  BRIDGE CONFIGURATION:`);
    console.log(`   Smart channel matching: ${this.enableSmartMatching ? 'ENABLED (recommended)' : 'DISABLED'}`);
    console.log(`   Manual channel map: ${this.channelMap ? JSON.stringify(this.channelMap) : 'None (auto-detect)'}`);
    console.log(`   Command system: ${this.commandsEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.commandsEnabled) {
      console.log(`   Command prefix: ${this.commandPrefix}`);
      console.log(`   Available commands: ${this.enabledCommands.length} commands`);
    }
    console.log(`   AI assistant: ${this.aiEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.aiEnabled) {
      console.log(`   AI model: ${this.aiModel}`);
      console.log(`   AI endpoint: ${this.aiEndpoint}`);
    }
    console.log('');
  }

  /**
   * Start the HTTP and WebSocket server
   */
  async start() {
    console.log('🚀 Meshtastic Bridge Server starting...');
    console.log('📦 Using latest @meshtastic packages from Meshtastic Web monorepo');

    // Create HTTP server for static files
    const httpServer = createServer((req, res) => {
      // Serve static files from dist/
      const staticFileServed = this.serveStaticFile(req, res);
      if (!staticFileServed) {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({ server: httpServer });

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

    // Start HTTP server
    httpServer.listen(this.wsPort, () => {
      console.log(`✅ HTTP server listening on http://localhost:${this.wsPort}`);
      console.log(`✅ WebSocket server listening on ws://localhost:${this.wsPort}`);

      if (existsSync(distPath)) {
        console.log(`📂 Serving static files from: ${distPath}`);
        console.log(`🌐 Open http://localhost:${this.wsPort} in your browser`);
      } else {
        console.log(`⚠️  No dist/ folder found - run 'npm run build' first for production mode`);
        console.log(`💡 For development, run 'npm run dev' in a separate terminal`);
      }

      console.log('📻 Ready to connect radios...');
      console.log('');
    });
  }

  /**
   * Serve static files from dist/ directory
   */
  serveStaticFile(req, res) {
    if (!existsSync(distPath)) {
      return false;
    }

    // Map URL to file path
    let filePath = req.url === '/' ? '/index.html' : req.url;

    // Remove query string
    const queryIndex = filePath.indexOf('?');
    if (queryIndex !== -1) {
      filePath = filePath.substring(0, queryIndex);
    }

    const fullPath = join(distPath, filePath);

    // Security: ensure file is within dist directory
    if (!fullPath.startsWith(distPath)) {
      return false;
    }

    if (!existsSync(fullPath)) {
      // For SPA routing, serve index.html for non-API routes
      if (!filePath.includes('.')) {
        const indexPath = join(distPath, 'index.html');
        if (existsSync(indexPath)) {
          const content = readFileSync(indexPath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
          return true;
        }
      }
      return false;
    }

    try {
      const content = readFileSync(fullPath);
      const ext = filePath.split('.').pop();
      const contentType = {
        'html': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'woff': 'font/woff',
        'woff2': 'font/woff2'
      }[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return true;
    } catch (error) {
      console.error(`❌ Error serving ${filePath}:`, error);
      return false;
    }
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

        // AI Management
        case 'ai-get-config':
          await this.aiGetConfig(ws);
          break;

        case 'ai-set-enabled':
          await this.aiSetEnabled(ws, message.enabled);
          break;

        case 'ai-list-models':
          await this.aiListModels(ws);
          break;

        case 'ai-set-model':
          await this.aiSetModel(ws, message.model);
          break;

        case 'ai-pull-model':
          await this.aiPullModel(ws, message.model);
          break;

        case 'ai-check-status':
          await this.aiCheckStatus(ws);
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

      // Notify clients IMMEDIATELY that radio is connecting
      this.broadcast({
        type: 'radio-connecting',
        radio: {
          id: radioId,
          name: `Radio ${radioId.substring(0, 8)}`,
          port: portPath,
          status: 'connecting',
          messagesReceived: 0,
          messagesSent: 0,
          errors: 0,
          info: {
            port: portPath,
            connectedAt: new Date()
          }
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
          name: `Radio ${radioId.substring(0, 8)}`,
          port: portPath,
          status: 'connected',
          messagesReceived: 0,
          messagesSent: 0,
          errors: 0,
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
        // ===== COMMAND DETECTION =====
        // Check if this is a command (starts with command prefix)
        if (this.commandsEnabled && text.trim().startsWith(this.commandPrefix)) {
          console.log(`🤖 Command detected: ${text}`);
          this.handleCommand(radioId, packet.channel, packet.from, text.trim());
          return; // Don't forward commands - consume them
        }

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
   * Handle command messages (messages starting with command prefix)
   */
  async handleCommand(radioId, channel, fromNode, commandText) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        console.error(`❌ Radio ${radioId} not found for command`);
        return;
      }

      // Check rate limiting
      if (this.isRateLimited(fromNode)) {
        console.log(`⚠️  Rate limit exceeded for node ${fromNode}`);
        await radio.device.sendText(
          `⚠️ Rate limit exceeded. Max ${this.commandRateLimit} commands per minute.`,
          'broadcast',
          false,
          channel
        );
        return;
      }

      // Parse command
      const command = commandText.substring(this.commandPrefix.length).trim().toLowerCase();
      const args = command.split(/\s+/);
      const cmd = args[0];
      const cmdArgs = args.slice(1);

      console.log(`🤖 Processing command: ${cmd} with args:`, cmdArgs);

      // Check if command is enabled
      if (!this.enabledCommands.includes(cmd)) {
        console.log(`⚠️  Command not enabled: ${cmd}`);
        await radio.device.sendText(
          `❓ Unknown command: ${cmd}\nTry ${this.commandPrefix}help for available commands`,
          'broadcast',
          false,
          channel
        );
        return;
      }

      // Route to appropriate command handler
      let response = '';
      switch (cmd) {
        case 'ping':
          response = await this.cmdPing();
          break;
        case 'help':
          response = await this.cmdHelp();
          break;
        case 'status':
          response = await this.cmdStatus();
          break;
        case 'time':
          response = await this.cmdTime();
          break;
        case 'uptime':
          response = await this.cmdUptime();
          break;
        case 'version':
          response = await this.cmdVersion();
          break;
        case 'weather':
          response = await this.cmdWeather(cmdArgs);
          break;
        case 'radios':
          response = await this.cmdRadios();
          break;
        case 'channels':
          response = await this.cmdChannels(radioId);
          break;
        case 'stats':
          response = await this.cmdStats();
          break;
        case 'nodes':
          response = await this.cmdNodes();
          break;
        case 'ai':
        case 'ask':
          response = await this.cmdAI(fromNode, cmdArgs);
          break;
        default:
          response = `❓ Unknown command: ${cmd}\nTry ${this.commandPrefix}help`;
      }

      if (response) {
        console.log(`🤖 Sending response: ${response.substring(0, 100)}...`);
        await radio.device.sendText(response, 'broadcast', false, channel);
      }

    } catch (error) {
      console.error('❌ Error handling command:', error);
    }
  }

  /**
   * Check if user is rate limited (returns true if exceeded limit)
   */
  isRateLimited(nodeId) {
    const now = Date.now();
    const usage = this.commandUsage.get(nodeId) || [];

    // Filter to only recent usage (last minute)
    const recentUsage = usage.filter(timestamp => now - timestamp < 60000);

    // Check if limit exceeded
    if (recentUsage.length >= this.commandRateLimit) {
      return true;
    }

    // Add current usage
    recentUsage.push(now);
    this.commandUsage.set(nodeId, recentUsage);

    // Clean up old entries periodically
    if (this.commandUsage.size > 100) {
      for (const [key, timestamps] of this.commandUsage.entries()) {
        const recent = timestamps.filter(t => now - t < 60000);
        if (recent.length === 0) {
          this.commandUsage.delete(key);
        }
      }
    }

    return false;
  }

  /**
   * Command: #ping - Check if bridge is alive
   */
  async cmdPing() {
    return '🏓 Pong! Bridge is alive and running.';
  }

  /**
   * Command: #help - List available commands
   */
  async cmdHelp() {
    const commands = [
      `${this.commandPrefix}ping - Check if bridge is alive`,
      `${this.commandPrefix}help - Show this help message`,
      `${this.commandPrefix}status - Bridge status & info`,
      `${this.commandPrefix}time - Current date/time`,
      `${this.commandPrefix}uptime - Bridge uptime`,
      `${this.commandPrefix}version - Software version`,
      `${this.commandPrefix}weather [city] - Get weather`,
      `${this.commandPrefix}radios - List connected radios`,
      `${this.commandPrefix}channels - List bridge channels`,
      `${this.commandPrefix}stats - Message statistics`,
      `${this.commandPrefix}nodes - List known nodes`
    ];

    // Add AI commands if enabled
    if (this.aiEnabled) {
      commands.push(`${this.commandPrefix}ai [question] - Ask AI assistant`);
      commands.push(`${this.commandPrefix}ask [question] - Ask AI assistant`);
    }

    return `📖 Bridge Commands:\n${commands.join('\n')}`;
  }

  /**
   * Command: #status - Bridge status and info
   */
  async cmdStatus() {
    const uptimeStr = this.getUptimeString();
    const radioCount = this.radios.size;
    const messageCount = this.messageHistory.length;

    return `📊 Bridge Status:\n` +
           `Radios: ${radioCount} connected\n` +
           `Messages: ${messageCount} in history\n` +
           `Uptime: ${uptimeStr}\n` +
           `Version: 2.0.0-alpha`;
  }

  /**
   * Command: #time - Current date and time
   */
  async cmdTime() {
    const now = new Date();
    return `🕐 ${now.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })}`;
  }

  /**
   * Command: #uptime - Bridge uptime
   */
  async cmdUptime() {
    return `⏱️ Bridge uptime: ${this.getUptimeString()}`;
  }

  /**
   * Command: #version - Software version
   */
  async cmdVersion() {
    return `🔖 Meshtastic Bridge GUI v2.0.0-alpha\n` +
           `Node.js ${process.version}\n` +
           `Platform: ${process.platform}`;
  }

  /**
   * Command: #weather [location] - Get weather report
   */
  async cmdWeather(args) {
    const location = args.length > 0 ? args.join(' ') : 'Seattle';

    try {
      // Using wttr.in - free weather service, no API key needed
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=%l:+%C+%t+💧%h+💨%w`;
      const response = await fetch(url);

      if (!response.ok) {
        return `❌ Weather service unavailable`;
      }

      const weather = await response.text();
      return `🌤️ ${weather.trim()}`;

    } catch (error) {
      console.error('Weather fetch error:', error);
      return `❌ Couldn't fetch weather for ${location}`;
    }
  }

  /**
   * Command: #radios - List connected radios
   */
  async cmdRadios() {
    if (this.radios.size === 0) {
      return '📻 No radios connected';
    }

    const radioList = Array.from(this.radios.entries()).map(([id, radio]) => {
      const shortId = id.substring(0, 8);
      const nodeNum = radio.nodeNum ? `!${radio.nodeNum.toString(16)}` : 'unknown';
      return `📻 ${shortId} (${nodeNum}) on ${radio.port}`;
    });

    return `Connected Radios (${this.radios.size}):\n${radioList.join('\n')}`;
  }

  /**
   * Command: #channels - List configured channels on this bridge
   */
  async cmdChannels(radioId) {
    const radio = this.radios.get(radioId);
    if (!radio || !radio.channels || radio.channels.size === 0) {
      return '⚠️ No channel info available';
    }

    const channelList = Array.from(radio.channels.entries()).map(([idx, ch]) => {
      const name = ch.name || '(unnamed)';
      const role = ch.role === 1 ? 'PRI' : ch.role === 0 ? 'SEC' : 'DIS';
      return `[${idx}] ${name} (${role})`;
    });

    return `🔐 Bridge Channels:\n${channelList.join('\n')}`;
  }

  /**
   * Command: #stats - Message statistics
   */
  async cmdStats() {
    const totalMessages = this.messageHistory.length;
    const uniqueNodes = new Set(this.messageHistory.map(m => m.from)).size;

    // Calculate messages per radio
    const radioStats = new Map();
    for (const msg of this.messageHistory) {
      const count = radioStats.get(msg.radioId) || 0;
      radioStats.set(msg.radioId, count + 1);
    }

    let statsText = `📊 Message Statistics:\n` +
                   `Total: ${totalMessages} messages\n` +
                   `Unique nodes: ${uniqueNodes}\n`;

    if (radioStats.size > 0) {
      statsText += `Per Radio:\n`;
      for (const [radioId, count] of radioStats.entries()) {
        const shortId = radioId.substring(0, 8);
        statsText += `  ${shortId}: ${count} msgs\n`;
      }
    }

    return statsText.trim();
  }

  /**
   * Command: #nodes - List known nodes
   */
  async cmdNodes() {
    // Get unique nodes from message history
    const nodes = new Map();

    for (const msg of this.messageHistory) {
      if (!nodes.has(msg.from)) {
        nodes.set(msg.from, {
          nodeNum: msg.from,
          lastSeen: msg.timestamp,
          messageCount: 1
        });
      } else {
        const node = nodes.get(msg.from);
        node.messageCount++;
        if (msg.timestamp > node.lastSeen) {
          node.lastSeen = msg.timestamp;
        }
      }
    }

    if (nodes.size === 0) {
      return '👥 No nodes seen yet';
    }

    const nodeList = Array.from(nodes.entries())
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .slice(0, 10) // Top 10 most recent
      .map(([nodeNum, info]) => {
        const hexId = `!${nodeNum.toString(16)}`;
        const timeAgo = this.getTimeAgo(info.lastSeen);
        return `${hexId} (${info.messageCount} msgs, ${timeAgo})`;
      });

    return `👥 Known Nodes (${nodes.size} total, showing 10):\n${nodeList.join('\n')}`;
  }

  /**
   * Command: #ai / #ask - Ask AI assistant (requires Ollama)
   */
  async cmdAI(fromNode, args) {
    // Check if AI is enabled
    if (!this.aiEnabled) {
      return '🤖 AI assistant is disabled. Enable it in bridge configuration.';
    }

    // Parse question
    const question = args.join(' ').trim();
    if (!question) {
      return `💭 Usage: ${this.commandPrefix}ai [your question]`;
    }

    // Check AI-specific rate limiting (stricter than regular commands)
    if (this.isAIRateLimited(fromNode)) {
      return `⚠️ AI rate limit exceeded. Max ${this.aiRateLimit} AI queries per minute.`;
    }

    try {
      console.log(`🤖 AI query from node ${fromNode}: "${question}"`);

      // Call Ollama API with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.aiTimeout);

      const response = await fetch(`${this.aiEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.aiModel,
          prompt: question,
          system: this.aiSystemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: this.aiMaxTokens
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`AI API error: ${response.status}`);
        return '❌ AI service error. Check Ollama is running.';
      }

      const data = await response.json();
      let answer = data.response.trim();

      // Truncate if too long (Meshtastic limit)
      if (answer.length > this.aiMaxResponseLength) {
        answer = answer.substring(0, this.aiMaxResponseLength - 3) + '...';
      }

      console.log(`🤖 AI response: "${answer}"`);
      return `🤖 ${answer}`;

    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('AI query timeout');
        return '⏱️ AI timeout. Try a simpler question.';
      }
      console.error('AI error:', error);
      if (error.code === 'ECONNREFUSED') {
        return '❌ AI offline. Is Ollama running?';
      }
      return '❌ AI error. Check logs.';
    }
  }

  /**
   * Check if user is AI rate limited (stricter than regular commands)
   */
  isAIRateLimited(nodeId) {
    const now = Date.now();
    const usage = this.aiUsage.get(nodeId) || [];

    // Filter to only recent usage (last minute)
    const recentUsage = usage.filter(timestamp => now - timestamp < 60000);

    // Check if limit exceeded
    if (recentUsage.length >= this.aiRateLimit) {
      return true;
    }

    // Add current usage
    recentUsage.push(now);
    this.aiUsage.set(nodeId, recentUsage);

    // Clean up old entries periodically
    if (this.aiUsage.size > 100) {
      for (const [key, timestamps] of this.aiUsage.entries()) {
        const recent = timestamps.filter(t => now - t < 60000);
        if (recent.length === 0) {
          this.aiUsage.delete(key);
        }
      }
    }

    return false;
  }

  /**
   * Get uptime as human-readable string
   */
  getUptimeString() {
    const uptimeMs = Date.now() - this.bridgeStartTime;
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    const seconds = Math.floor((uptimeMs % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get time ago as human-readable string
   */
  getTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
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
   * Behavior depends on this.enableSmartMatching flag
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

      // ===== SIMPLE INDEX-BASED FORWARDING =====
      if (!this.enableSmartMatching) {
        // Determine target channel: use map if provided, otherwise same index
        const targetChannel = this.channelMap ? (this.channelMap[channel] ?? channel) : channel;

        console.log(`🔀 [INDEX MODE] Forwarding from channel ${channel} → channel ${targetChannel}`);

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

      // ===== SMART PSK/NAME MATCHING MODE =====
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

      console.log(`🔀 [SMART MATCH] Forwarding from source channel ${channel}:`);
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
            console.warn(`⚠️  Target radio ${targetRadioId} has no channel matching "${sourceChannel.name}" (PSK: ${sourceChannel.psk.substring(0,8)}...), skipping`);
            console.warn(`    To forward this channel, configure it on ${targetRadioId} with same name+PSK`);
            return { radioId: targetRadioId, success: false, reason: 'no_matching_channel' };
          }

          // If the matching channel is on a DIFFERENT index, log it
          if (matchingChannelIndex !== channel) {
            console.log(`🔀 Cross-index forward: source channel ${channel} → target channel ${matchingChannelIndex} (both "${sourceChannel.name}")`);
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
      const skippedCount = results.filter(r =>
        r.status === 'fulfilled' && r.value.reason === 'no_matching_channel'
      ).length;

      console.log(`📊 Forwarding complete: ${successCount}/${otherRadios.length} successful`);
      if (skippedCount > 0) {
        console.log(`⚠️  ${skippedCount} radio(s) skipped - no matching channel configuration`);
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
   * AI Management: Get current AI configuration
   */
  async aiGetConfig(ws) {
    ws.send(JSON.stringify({
      type: 'ai-config',
      config: {
        enabled: this.aiEnabled,
        model: this.aiModel,
        endpoint: this.aiEndpoint,
        maxTokens: this.aiMaxTokens,
        rateLimit: this.aiRateLimit,
        timeout: this.aiTimeout
      }
    }));
  }

  /**
   * AI Management: Enable/disable AI assistant
   */
  async aiSetEnabled(ws, enabled) {
    try {
      this.aiEnabled = enabled;
      console.log(`🤖 AI assistant ${enabled ? 'enabled' : 'disabled'}`);

      ws.send(JSON.stringify({
        type: 'ai-set-enabled-success',
        enabled: this.aiEnabled
      }));

      // Broadcast to all clients
      this.broadcast({
        type: 'ai-config-changed',
        config: { enabled: this.aiEnabled }
      });
    } catch (error) {
      console.error('❌ AI set enabled error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to set AI enabled: ${error.message}`
      }));
    }
  }

  /**
   * AI Management: List available models from Ollama
   */
  async aiListModels(ws) {
    try {
      const response = await fetch(`${this.aiEndpoint}/api/tags`);

      if (!response.ok) {
        throw new Error('Ollama not responding');
      }

      const data = await response.json();

      ws.send(JSON.stringify({
        type: 'ai-models-list',
        models: data.models || []
      }));
    } catch (error) {
      console.error('❌ AI list models error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.code === 'ECONNREFUSED' ?
          'Ollama not running. Install from https://ollama.com' :
          `Failed to list models: ${error.message}`
      }));
    }
  }

  /**
   * AI Management: Set active model
   */
  async aiSetModel(ws, model) {
    try {
      // Verify model exists
      const response = await fetch(`${this.aiEndpoint}/api/tags`);
      const data = await response.json();
      const modelExists = data.models.some(m => m.name === model);

      if (!modelExists) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Model ${model} not installed. Pull it first.`
        }));
        return;
      }

      this.aiModel = model;
      console.log(`🤖 AI model changed to: ${model}`);

      ws.send(JSON.stringify({
        type: 'ai-set-model-success',
        model: this.aiModel
      }));

      // Broadcast to all clients
      this.broadcast({
        type: 'ai-config-changed',
        config: { model: this.aiModel }
      });
    } catch (error) {
      console.error('❌ AI set model error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to set model: ${error.message}`
      }));
    }
  }

  /**
   * AI Management: Pull (download/install) a model
   */
  async aiPullModel(ws, model) {
    try {
      console.log(`🤖 Pulling model: ${model} (this may take a while...)`);

      // Send initial acknowledgment
      ws.send(JSON.stringify({
        type: 'ai-pull-started',
        model: model
      }));

      // Pull model (streaming response)
      const response = await fetch(`${this.aiEndpoint}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model })
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.statusText}`);
      }

      // Stream progress updates
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const progress = JSON.parse(line);
            ws.send(JSON.stringify({
              type: 'ai-pull-progress',
              model: model,
              status: progress.status,
              completed: progress.completed,
              total: progress.total
            }));
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }

      console.log(`✅ Model ${model} pulled successfully`);
      ws.send(JSON.stringify({
        type: 'ai-pull-complete',
        model: model
      }));

    } catch (error) {
      console.error('❌ AI pull model error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to pull model: ${error.message}`
      }));
    }
  }

  /**
   * AI Management: Check if Ollama is running and responsive
   */
  async aiCheckStatus(ws) {
    try {
      const response = await fetch(`${this.aiEndpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });

      const running = response.ok;
      let version = null;

      if (running) {
        try {
          const versionResponse = await fetch(`${this.aiEndpoint}/api/version`);
          const versionData = await versionResponse.json();
          version = versionData.version;
        } catch (e) {
          // Ignore version errors
        }
      }

      ws.send(JSON.stringify({
        type: 'ai-status',
        running: running,
        version: version,
        endpoint: this.aiEndpoint
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'ai-status',
        running: false,
        error: error.message,
        endpoint: this.aiEndpoint
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
