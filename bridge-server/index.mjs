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

import crypto from 'crypto';
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';
import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces } from 'os';
import nodemailer from 'nodemailer';
import mqtt from 'mqtt';
import { createProtocol, getSupportedProtocols } from './protocols/index.mjs';

// Make crypto available globally for @meshtastic libraries (if not already available)
// Node.js v20+ already has crypto on globalThis, so only set if undefined
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, '..', 'dist');
const configPath = join(__dirname, 'bridge-config.json');

class MeshtasticBridgeServer {
  constructor(port = 8080, host = '0.0.0.0') {
    this.wsPort = port;
    this.wsHost = host; // Bind address: '0.0.0.0' for LAN access, 'localhost' for local only
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
    // MODE 2: Smart PSK matching (enableSmartMatching = true)
    //   - Searches ALL channels on target radio for matching PSK
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
      'weather', 'radios', 'channels', 'stats', 'nodes', 'ai', 'ask',
      'email', 'discord', 'notify'
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

    // ===== EMAIL CONFIGURATION =====
    this.emailEnabled = false;                 // Enable/disable email notifications
    this.emailHost = '';                       // SMTP host (e.g., smtp.gmail.com)
    this.emailPort = 587;                      // SMTP port (587 for TLS, 465 for SSL)
    this.emailSecure = false;                  // Use SSL (true for port 465)
    this.emailUser = '';                       // SMTP username/email
    this.emailPassword = '';                   // SMTP password or app-specific password
    this.emailFrom = '';                       // From email address
    this.emailTo = '';                         // Default recipient email address
    this.emailSubjectPrefix = '[Meshtastic]';  // Email subject prefix

    // ===== DISCORD CONFIGURATION =====
    this.discordEnabled = false;               // Enable/disable Discord notifications
    this.discordWebhook = '';                  // Discord webhook URL
    this.discordUsername = 'Meshtastic Bridge'; // Bot username for Discord messages
    this.discordAvatarUrl = '';                // Optional avatar URL for Discord bot

    // ===== MQTT CONFIGURATION =====
    this.mqttEnabled = false;                  // Enable/disable MQTT bridge
    this.mqttBrokerUrl = '';                   // MQTT broker URL (e.g., mqtt://broker.hivemq.com:1883)
    this.mqttUsername = '';                    // MQTT username (if required)
    this.mqttPassword = '';                    // MQTT password (if required)
    this.mqttTopicPrefix = 'meshtastic';       // Topic prefix (e.g., meshtastic/channel0)
    this.mqttClientId = `mesh-bridge-${Date.now()}`; // Unique client ID
    this.mqttQos = 0;                          // QoS level (0, 1, or 2)
    this.mqttRetain = false;                   // Retain messages
    this.mqttClient = null;                    // MQTT client instance

    // Load persistent configuration (AI state, etc.)
    this.loadConfig();

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
    console.log(`   Email notifications: ${this.emailEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.emailEnabled) {
      console.log(`   Email recipient: ${this.emailTo}`);
    }
    console.log(`   Discord notifications: ${this.discordEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   MQTT bridge: ${this.mqttEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.mqttEnabled) {
      console.log(`   MQTT broker: ${this.mqttBrokerUrl}`);
      console.log(`   MQTT topic prefix: ${this.mqttTopicPrefix}`);
    }
    console.log('');
  }

  /**
   * Load persistent configuration from file
   */
  loadConfig() {
    try {
      if (existsSync(configPath)) {
        const configData = readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);

        // Load AI enabled state
        if (config.aiEnabled !== undefined) {
          this.aiEnabled = config.aiEnabled;
          console.log(`📋 Loaded AI state from config: ${this.aiEnabled ? 'ENABLED' : 'DISABLED'}`);
        }

        // Can add more config options here in the future (MQTT, email, etc.)
      }
    } catch (error) {
      console.error('⚠️  Error loading config file:', error.message);
      // Continue with defaults if config file is corrupted or missing
    }
  }

  /**
   * Save persistent configuration to file
   */
  saveConfig() {
    try {
      const config = {
        aiEnabled: this.aiEnabled,
        // Can add more config options here in the future
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`💾 Configuration saved to ${configPath}`);
    } catch (error) {
      console.error('❌ Error saving config file:', error.message);
    }
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

      // Send current radio status with complete state
      const radiosStatus = Array.from(this.radios.entries()).map(([id, radio]) => ({
        id,
        port: radio.port,
        status: 'connected',
        protocol: radio.protocolType || 'meshtastic',
        nodeInfo: radio.nodeInfo,
        channels: Array.from(radio.channels.entries()).map(([idx, ch]) => ({
          index: idx,
          name: ch.name,
          role: ch.role,
          psk: ch.psk
        })),
        batteryLevel: radio.telemetry?.batteryLevel,
        voltage: radio.telemetry?.voltage,
        channelUtilization: radio.telemetry?.channelUtilization,
        airUtilTx: radio.telemetry?.airUtilTx,
        messagesReceived: radio.messagesReceived || 0,
        messagesSent: radio.messagesSent || 0,
        errors: radio.errors || 0,
        info: radio.info
      }));

      if (radiosStatus.length > 0) {
        console.log(`📡 Sending ${radiosStatus.length} persisted radio(s) to new client`);
      }

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
    httpServer.listen(this.wsPort, this.wsHost, () => {
      const isLanMode = this.wsHost === '0.0.0.0';

      console.log(`✅ HTTP server listening on http://${this.wsHost}:${this.wsPort}`);
      console.log(`✅ WebSocket server listening on ws://${this.wsHost}:${this.wsPort}`);

      if (existsSync(distPath)) {
        console.log(`📂 Serving static files from: ${distPath}`);

        if (isLanMode) {
          // Get local IP addresses for LAN access
          const networkInterfaces = this.getNetworkInterfaces();
          console.log(`🌐 Access locally: http://localhost:${this.wsPort}`);
          if (networkInterfaces.length > 0) {
            console.log(`🌐 Access on LAN:`);
            networkInterfaces.forEach(iface => {
              console.log(`   http://${iface.address}:${this.wsPort} (${iface.name})`);
            });
          }
        } else {
          console.log(`🌐 Open http://localhost:${this.wsPort} in your browser`);
        }
      } else {
        console.log(`⚠️  No dist/ folder found - run 'npm run build' first for production mode`);
        console.log(`💡 For development, run 'npm run dev' in a separate terminal`);
      }

      console.log('📻 Ready to connect radios...');
      console.log('');

      // Connect to MQTT if enabled
      if (this.mqttEnabled && this.mqttBrokerUrl) {
        this.connectMQTT();
      }

      // Auto-start AI assistant if it was previously enabled
      if (this.aiEnabled) {
        console.log('🤖 AI assistant was previously enabled, checking Ollama availability...');
        this.checkOllamaAndAutoStart();
      }

      // Auto-scan and auto-connect to radios for headless operation
      const autoConnect = process.env.AUTO_CONNECT !== 'false'; // Default true
      if (autoConnect) {
        console.log('🔍 Auto-connect enabled, scanning for radios...');
        setTimeout(() => this.autoScanAndConnect(), 2000); // Wait 2s for server to stabilize

        // Re-scan periodically for new radios
        setInterval(() => this.autoScanAndConnect(), 30000); // Every 30 seconds
      } else {
        console.log('ℹ️  Auto-connect disabled. Waiting for manual connection via web UI...');
      }
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
   * Get network interfaces for LAN access information
   */
  getNetworkInterfaces() {
    const interfaces = [];
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip internal (loopback) and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          interfaces.push({
            name: name,
            address: net.address
          });
        }
      }
    }

    return interfaces;
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
          await this.connectRadio(ws, message.port, message.protocol || 'meshtastic');
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

        // Communication Management
        case 'comm-get-config':
          await this.commGetConfig(ws);
          break;

        case 'comm-set-email':
          await this.commSetEmail(ws, message.config);
          break;

        case 'comm-set-discord':
          await this.commSetDiscord(ws, message.config);
          break;

        case 'comm-test-email':
          await this.commTestEmail(ws);
          break;

        case 'comm-test-discord':
          await this.commTestDiscord(ws);
          break;

        // MQTT Management
        case 'mqtt-get-config':
          await this.mqttGetConfig(ws);
          break;

        case 'mqtt-set-config':
          await this.mqttSetConfig(ws, message.config);
          break;

        case 'mqtt-test':
          await this.testMQTT(ws);
          break;

        case 'mqtt-enable':
          await this.mqttSetEnabled(ws, message.enabled);
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
   * @param {WebSocket} ws - Optional WebSocket client to notify (null for headless mode)
   * @param {string} portPath - Serial port path
   * @param {string} protocol - Protocol type (default: 'meshtastic')
   */
  async connectRadio(ws, portPath, protocol = 'meshtastic') {
    try {
      console.log(`📻 Connecting to radio on ${portPath} using ${protocol} protocol...`);

      // Check if a radio already exists for this port
      for (const [existingId, existingRadio] of this.radios.entries()) {
        if (existingRadio.port === portPath) {
          console.log(`ℹ️  Radio already connected to ${portPath} (${existingId})`);
          return; // Don't create duplicate
        }
      }

      const radioId = `radio-${Date.now()}`;

      // Create protocol handler
      const protocolHandler = createProtocol(protocol, radioId, portPath);

      // Subscribe to protocol events
      protocolHandler.on('message', (packet) => {
        this.handleMessagePacket(radioId, portPath, packet, protocolHandler.getProtocolName());
      });

      protocolHandler.on('nodeInfo', async (nodeInfo) => {
        console.log(`🆔 Radio ${radioId} node info:`, nodeInfo);
        const radio = this.radios.get(radioId);
        if (radio) {
          radio.nodeInfo = nodeInfo;
          radio.nodeNum = parseInt(nodeInfo.nodeId);
          console.log(`✅ Radio ${radioId} node info updated`);

          // Check device time if available and auto-sync if wrong
          const metadata = protocolHandler.getProtocolMetadata();
          if (metadata.deviceTime) {
            const deviceDate = new Date(metadata.deviceTime);
            const currentDate = new Date();
            const timeDiff = Math.abs(currentDate - deviceDate) / 1000 / 60; // minutes

            console.log(`⏰ Radio ${radioId} device time: ${deviceDate.toLocaleString()}`);

            if (timeDiff > 60) { // More than 1 hour difference
              console.warn(`⚠️  WARNING: Radio ${radioId} clock is off by ${Math.round(timeDiff / 60)} hours!`);
              console.warn(`   Device time: ${deviceDate.toLocaleString()}`);
              console.warn(`   Current time: ${currentDate.toLocaleString()}`);
              console.warn(`   Attempting to automatically sync time...`);

              // Auto-sync time if method exists
              if (typeof protocolHandler.syncTime === 'function') {
                try {
                  await protocolHandler.syncTime();
                  console.log(`✅ Time sync initiated for ${radioId}`);
                } catch (error) {
                  console.error(`❌ Failed to sync time on ${radioId}:`, error.message);
                  console.warn(`   You may need to manually sync time using the Meshtastic app`);
                }
              } else {
                console.warn(`   Auto time-sync not supported for this protocol type`);
              }
            } else {
              console.log(`✅ Radio ${radioId} clock is accurate (within 1 hour)`);
            }
          }

          // Broadcast updated radio info to clients
          this.broadcast({
            type: 'radio-updated',
            radio: this.getRadioInfo(radioId)
          });
        }
      });

      protocolHandler.on('channels', (channels) => {
        console.log(`🔐 Radio ${radioId} channels updated: ${channels.length} channels`);
        const radio = this.radios.get(radioId);
        if (radio) {
          // Convert array to Map for compatibility
          radio.channels = new Map();
          channels.forEach(ch => {
            radio.channels.set(ch.index, ch);
          });

          // Log channel configuration
          console.log(`\n📋 ========== Radio ${radioId} Channel Configuration ==========`);
          channels.forEach(ch => {
            console.log(`   [${ch.index}] "${ch.name || '(unnamed)'}" PSK: ${ch.psk ? ch.psk.substring(0, 8) + '...' : '(none)'}`);
          });
          console.log(`============================================================\n`);

          // Broadcast updated radio info to clients
          this.broadcast({
            type: 'radio-updated',
            radio: this.getRadioInfo(radioId)
          });
        }
      });

      protocolHandler.on('telemetry', (telemetry) => {
        const radio = this.radios.get(radioId);
        if (radio) {
          radio.telemetry = telemetry;

          // Broadcast telemetry to clients
          this.broadcast({
            type: 'radio-telemetry',
            radioId: radioId,
            telemetry: telemetry
          });
        }
      });

      protocolHandler.on('node', (meshNode) => {
        console.log(`📍 Node ${meshNode.shortName} (${meshNode.nodeId}) seen by radio ${radioId}`);

        // Broadcast node info to clients
        this.broadcast({
          type: 'node-info',
          radioId: radioId,
          node: {
            ...meshNode,
            lastHeard: meshNode.lastHeard.toISOString(),
            position: meshNode.position ? {
              ...meshNode.position,
              time: meshNode.position.time?.toISOString()
            } : undefined,
            fromRadio: radioId
          }
        });
      });

      protocolHandler.on('config', (config) => {
        console.log(`⚙️  Radio ${radioId} config updated`);
        // Broadcast updated radio info to clients (includes protocolMetadata with loraConfig)
        this.broadcast({
          type: 'radio-updated',
          radio: this.getRadioInfo(radioId)
        });
      });

      protocolHandler.on('error', (error) => {
        console.error(`❌ Radio ${radioId} error:`, error);
        const radio = this.radios.get(radioId);
        if (radio) {
          radio.errors = (radio.errors || 0) + 1;
          // Broadcast updated radio stats
          this.broadcast({
            type: 'radio-updated',
            radio: this.getRadioInfo(radioId)
          });
        }
      });

      // Store radio reference
      this.radios.set(radioId, {
        protocol: protocolHandler,
        protocolType: protocol,
        port: portPath,
        nodeNum: null,
        nodeInfo: null,
        channels: new Map(),
        telemetry: {},
        messagesReceived: 0,
        messagesSent: 0,
        errors: 0,
        info: {
          port: portPath,
          connectedAt: new Date()
        }
      });

      // Notify clients that radio is connecting
      this.broadcast({
        type: 'radio-connecting',
        radio: {
          id: radioId,
          name: `Radio ${radioId.substring(0, 8)}`,
          port: portPath,
          protocol: protocol,
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

      // Connect the protocol handler
      console.log(`⚙️  Connecting radio ${radioId}...`);
      await protocolHandler.connect();
      console.log(`✅ Radio ${radioId} connected successfully`);

      // Notify all clients that connection is complete
      this.broadcast({
        type: 'radio-connected',
        radio: this.getRadioInfo(radioId)
      });

      // Radio is now ready and connected

    } catch (error) {
      console.error(`❌ Failed to connect to ${portPath}:`, error);

      // Clean up any radio entry that was created before the failure
      // Find radio with this port and remove it
      for (const [id, radio] of this.radios.entries()) {
        if (radio.port === portPath) {
          console.log(`🧹 Cleaning up failed radio ${id}`);
          this.radios.delete(id);

          // Notify clients of failure/disconnection
          this.broadcast({
            type: 'radio-disconnected',
            radioId: id
          });
        }
      }

      if (ws) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Connection failed: ${error.message}`
        }));
      }
    }
  }

  /**
   * Auto-scan for radios and connect to them (headless mode)
   */
  async autoScanAndConnect() {
    try {
      const ports = await SerialPort.list();

      // Filter for actual USB/ACM devices (same filter as listPorts)
      const filteredPorts = ports.filter(port => {
        if (port.path.match(/\/dev\/ttyS\d+$/)) {
          return false;
        }
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

      if (filteredPorts.length === 0) {
        console.log('🔍 Auto-scan: No USB/ACM serial devices found');
        return;
      }

      console.log(`🔍 Auto-scan: Found ${filteredPorts.length} USB/ACM serial port(s)`);

      // Try to connect to any ports we're not already connected to
      for (const port of filteredPorts) {
        // Check if already connected
        const alreadyConnected = Array.from(this.radios.values()).some(
          radio => radio.port === port.path
        );

        if (!alreadyConnected) {
          console.log(`🔌 Auto-connecting to ${port.path}...`);
          // Call connectRadio without websocket (headless mode)
          await this.connectRadio(null, port.path, 'meshtastic');
        }
      }
    } catch (error) {
      console.error('❌ Error in auto-scan:', error);
    }
  }

  /**
   * Get radio information for broadcasting to clients
   */
  getRadioInfo(radioId) {
    const radio = this.radios.get(radioId);
    if (!radio) return null;

    return {
      id: radioId,
      name: radio.nodeInfo?.longName || `Radio ${radioId.substring(0, 8)}`,
      port: radio.port,
      protocol: radio.protocol?.getProtocolName() || radio.protocolType,
      status: 'connected',
      nodeInfo: radio.nodeInfo,
      messagesReceived: radio.messagesReceived,
      messagesSent: radio.messagesSent,
      errors: radio.errors,
      ...(radio.telemetry || {}),
      protocolMetadata: radio.protocol?.getProtocolMetadata(),
      info: radio.info
    };
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
   * Handle message packets from radio (protocol-agnostic)
   * Packet is normalized by protocol handler
   */
  handleMessagePacket(radioId, portPath, packet, protocol) {
    try {
      console.log(`📨 Message packet from ${radioId} (${protocol}):`, {
        id: packet.id,
        from: packet.from,
        to: packet.to,
        channel: packet.channel,
        text: packet.text
      });

      // Increment message received counter for this radio
      const radio = this.radios.get(radioId);
      if (radio) {
        radio.messagesReceived = (radio.messagesReceived || 0) + 1;
      }

      // Extract text from normalized packet
      const text = packet.text;

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
          timestamp: new Date(), // Always use current time to maintain correct message order
          from: packet.from,
          to: packet.to,
          channel: packet.channel || 0,
          text: text,
          radioId: radioId,
          portPath: portPath,
          protocol: protocol,
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

        // Broadcast updated radio stats
        if (radio) {
          this.broadcast({
            type: 'radio-updated',
            radio: this.getRadioInfo(radioId)
          });
        }

        // Publish to MQTT if enabled (only for received messages, not our own)
        if (!isFromOurBridgeRadio && this.mqttEnabled) {
          this.publishToMQTT(packet.channel, {
            from: packet.from,
            text: text,
            rssi: packet.rssi,
            snr: packet.snr
          });
        }

        // BRIDGE: Forward to all OTHER radios ONLY if message is NOT from our bridge
        if (!isFromOurBridgeRadio) {
          console.log(`🌉 Forwarding message to other radios (source channel: ${packet.channel})`);
          this.forwardToOtherRadios(radioId, text, packet.channel);
        } else {
          console.log(`🔁 Not forwarding - message from our bridge radio`);
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
        // Rate limit exceeded - silently drop command
        console.log(`⚠️  Rate limit exceeded for node ${fromNode} - command dropped`);
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
        // Unknown command - silently drop
        console.log(`❓ Unknown command: ${cmd}`);
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
        case 'email':
          response = await this.cmdEmail(fromNode, cmdArgs);
          break;
        case 'discord':
          response = await this.cmdDiscord(fromNode, cmdArgs);
          break;
        case 'notify':
          response = await this.cmdNotify(fromNode, cmdArgs);
          break;
        default:
          response = `❓ Unknown command: ${cmd}\nTry ${this.commandPrefix}help`;
      }

      if (response) {
        console.log(`🤖 Sending response: ${response.substring(0, 100)}...`);
        try {
          await radio.protocol.sendMessage(response, channel, { wantAck: false });
        } catch (error) {
          console.error(`❌ Failed to send command response:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error handling command:', error);
      // Don't crash - commands should be fire-and-forget
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

    // Add communication commands if enabled
    if (this.emailEnabled) {
      commands.push(`${this.commandPrefix}email [message] - Send email`);
    }
    if (this.discordEnabled) {
      commands.push(`${this.commandPrefix}discord [message] - Send to Discord`);
    }
    if (this.emailEnabled || this.discordEnabled) {
      commands.push(`${this.commandPrefix}notify [message] - Send to all`);
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
   * Send email notification
   */
  async cmdEmail(fromNode, args) {
    // Check if email is enabled
    if (!this.emailEnabled) {
      return '📧 Email notifications are disabled. Enable in bridge configuration.';
    }

    // Parse message
    const message = args.join(' ').trim();
    if (!message) {
      return `📧 Usage: ${this.commandPrefix}email [your message]`;
    }

    try {
      console.log(`📧 Email request from node ${fromNode}: "${message}"`);

      // Get node info for sender identification
      const nodeName = this.getNodeName(fromNode) || `Node ${fromNode.toString(16)}`;

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: this.emailHost,
        port: this.emailPort,
        secure: this.emailSecure,
        auth: {
          user: this.emailUser,
          pass: this.emailPassword
        }
      });

      // Send email
      const info = await transporter.sendMail({
        from: this.emailFrom || this.emailUser,
        to: this.emailTo,
        subject: `${this.emailSubjectPrefix} Message from ${nodeName}`,
        text: `Message from ${nodeName} (${fromNode.toString(16)}):\n\n${message}\n\nSent via Meshtastic Bridge`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Meshtastic Bridge Message</h2>
          <p><strong>From:</strong> ${nodeName} (${fromNode.toString(16)})</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          <p style="color: #6B7280; font-size: 12px;">Sent via Meshtastic Bridge</p>
        </div>`
      });

      console.log(`📧 Email sent: ${info.messageId}`);
      return `✅ Email sent successfully!`;

    } catch (error) {
      console.error('Email error:', error);
      if (error.code === 'EAUTH') {
        return '❌ Email authentication failed. Check credentials.';
      }
      if (error.code === 'ECONNECTION') {
        return '❌ Cannot connect to email server. Check settings.';
      }
      return '❌ Email error. Check logs.';
    }
  }

  /**
   * Send Discord notification via webhook
   */
  async cmdDiscord(fromNode, args) {
    // Check if Discord is enabled
    if (!this.discordEnabled) {
      return '💬 Discord notifications are disabled. Enable in bridge configuration.';
    }

    // Parse message
    const message = args.join(' ').trim();
    if (!message) {
      return `💬 Usage: ${this.commandPrefix}discord [your message]`;
    }

    try {
      console.log(`💬 Discord request from node ${fromNode}: "${message}"`);

      // Get node info for sender identification
      const nodeName = this.getNodeName(fromNode) || `Node ${fromNode.toString(16)}`;

      // Send to Discord webhook
      const response = await fetch(this.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.discordUsername,
          avatar_url: this.discordAvatarUrl || undefined,
          embeds: [{
            title: '📡 Meshtastic Bridge Message',
            description: message,
            color: 5814783, // Blurple color
            fields: [
              {
                name: 'From',
                value: `${nodeName} (\`${fromNode.toString(16)}\`)`,
                inline: true
              },
              {
                name: 'Time',
                value: new Date().toLocaleString(),
                inline: true
              }
            ],
            footer: {
              text: 'Sent via Meshtastic Bridge'
            },
            timestamp: new Date().toISOString()
          }]
        })
      });

      if (!response.ok) {
        console.error(`Discord API error: ${response.status}`);
        return '❌ Discord send failed. Check webhook URL.';
      }

      console.log(`💬 Discord message sent`);
      return `✅ Discord message sent!`;

    } catch (error) {
      console.error('Discord error:', error);
      if (error.code === 'ECONNREFUSED') {
        return '❌ Cannot reach Discord. Check internet connection.';
      }
      return '❌ Discord error. Check logs.';
    }
  }

  /**
   * Send notification to both email and Discord
   */
  async cmdNotify(fromNode, args) {
    // Check if at least one notification method is enabled
    if (!this.emailEnabled && !this.discordEnabled) {
      return '📣 No notification methods enabled. Enable email or Discord in bridge configuration.';
    }

    // Parse message
    const message = args.join(' ').trim();
    if (!message) {
      return `📣 Usage: ${this.commandPrefix}notify [your message]`;
    }

    const results = [];

    // Try email if enabled
    if (this.emailEnabled) {
      const emailResult = await this.cmdEmail(fromNode, args);
      results.push(emailResult.includes('✅') ? 'Email ✅' : 'Email ❌');
    }

    // Try Discord if enabled
    if (this.discordEnabled) {
      const discordResult = await this.cmdDiscord(fromNode, args);
      results.push(discordResult.includes('✅') ? 'Discord ✅' : 'Discord ❌');
    }

    return `📣 Notification sent: ${results.join(', ')}`;
  }

  /**
   * Helper to get node name from node ID
   */
  getNodeName(nodeId) {
    // Look through all radios to find node info
    for (const [radioId, radio] of this.radios) {
      if (radio.device && radio.device.nodeDb) {
        const nodes = radio.device.nodeDb;
        for (const [id, node] of nodes) {
          if (id === nodeId && node.user) {
            return node.user.longName || node.user.shortName;
          }
        }
      }
    }
    return null;
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
   * Check if two channels have matching configuration (PSK only)
   * for secure bridging
   */
  channelsMatch(sourceChannel, targetChannel) {
    if (!sourceChannel || !targetChannel) {
      return false;
    }

    // Only PSK needs to match (this is the encryption key)
    // Name matching is no longer required
    return sourceChannel.psk === targetChannel.psk;
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
            await radio.protocol.sendMessage(text, targetChannel, { wantAck: false });
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

      // If we don't have channel config yet, SKIP forwarding to prevent sending unencrypted
      // or to wrong channels. Smart matching requires PSK from channel config.
      if (!sourceChannel) {
        console.warn(`⚠️  Cannot forward: Channel ${channel} config not yet received from ${sourceRadioId}`);
        console.warn(`   Source radio has ${sourceRadio.channels?.size || 0} channel configs loaded`);
        if (sourceRadio.channels && sourceRadio.channels.size > 0) {
          const availableChannels = Array.from(sourceRadio.channels.keys());
          console.warn(`   Available channel indices: [${availableChannels.join(', ')}]`);
          console.warn(`   ⚠️  You tried to send on channel ${channel} but it doesn't exist!`);
        } else {
          console.warn(`   Smart matching requires channel PSK to route correctly.`);
          console.warn(`   Waiting for channel config... (radio may still be initializing)`);
        }
        return;
      }

      console.log(`🔀 [SMART MATCH] Forwarding from source channel ${channel}:`);
      console.log(`   Name: "${sourceChannel.name}"`);
      console.log(`   PSK: ${sourceChannel.psk.substring(0, 16)}...`);
      console.log(`   Searching for matching channel on other radios...`);

      // Forward to each radio that has matching channel configuration
      const forwardPromises = otherRadios.map(async ([targetRadioId, radio]) => {
        try {
          // ===== CROSS-PROTOCOL BRIDGING =====
          // Check if source and target are different protocols
          const sourceProtocol = sourceRadio.protocolType;
          const targetProtocol = radio.protocolType;

          // ===== MESHTASTIC CHANNEL FORWARDING =====
          // Search ALL channels on target radio for matching PSK
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
            console.warn(`    To forward this channel, configure it on ${targetRadioId} with same PSK`);
            return { radioId: targetRadioId, success: false, reason: 'no_matching_channel' };
          }

          // If the matching channel is on a DIFFERENT index, log it
          if (matchingChannelIndex !== channel) {
            console.log(`🔀 Cross-index forward: source channel ${channel} → target channel ${matchingChannelIndex} (both "${sourceChannel.name}")`);
          }

          // Send message directly (if radio isn't ready, it will fail gracefully)
          await targetProtocol.sendMessage(text, matchingChannelIndex, { wantAck: false });
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
   * Send text message via a radio (protocol-agnostic)
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

      console.log(`📤 Sending text via ${radioId} (${radio.protocolType}): "${text}" on channel ${channel}`);

      // Create a message record for the sent message IMMEDIATELY (before waiting for send to complete)
      const sentMessage = {
        id: `msg-sent-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toISOString(),
        radioId: radioId,
        protocol: radio.protocolType,
        from: radio.nodeInfo?.nodeId || radioId,
        to: 'broadcast',
        channel: channel,
        portnum: 1,
        text: text,
        sent: true, // Mark as sent (not received)
      };

      // Broadcast the sent message to all clients so it appears in message log immediately
      this.broadcast({
        type: 'message',
        message: sentMessage
      });

      // Send using the protocol handler (fire and forget - don't wait for completion)
      // The Meshtastic library's sendText may hang waiting for ACK even with wantAck:false
      radio.protocol.sendMessage(text, channel, { wantAck: false }).then(() => {
        console.log(`✅ Text sent successfully on channel ${channel}`);

        // Increment sent message counter
        radio.messagesSent = (radio.messagesSent || 0) + 1;

        // Broadcast updated radio stats
        this.broadcast({
          type: 'radio-updated',
          radio: this.getRadioInfo(radioId)
        });

        ws.send(JSON.stringify({
          type: 'send-success',
          radioId: radioId
        }));
      }).catch((error) => {
        console.error('❌ Send completion error:', error);
        // Message send failed - no queuing, fail immediately
        console.error('❌ Failed to send:', error);
      });

    } catch (error) {
      console.error('❌ Send failed:', error);

      // Extract meaningful error message
      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Try to get a meaningful message from the error object
        errorMsg = error.message || error.error || JSON.stringify(error);
      } else {
        errorMsg = String(error);
      }

      ws.send(JSON.stringify({
        type: 'error',
        error: `Send failed: ${errorMsg}`
      }));
    }
  }

  // Message queue system removed - messages fail immediately if radio is unavailable

  /**
   * Disconnect a radio (protocol-agnostic)
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

      console.log(`📻 Disconnecting radio ${radioId} (${radio.protocolType})...`);

      // Disconnect using protocol handler
      if (radio.protocol) {
        await radio.protocol.disconnect();
      }

      this.radios.delete(radioId);

      // Clear any queued messages for this radio
      if (this.messageQueues.has(radioId)) {
        const queueLength = this.messageQueues.get(radioId).length;
        if (queueLength > 0) {
          console.log(`🗑️  Clearing ${queueLength} queued message(s) for disconnected radio`);
        }
        this.messageQueues.delete(radioId);
      }

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

      // Save configuration to persist across restarts
      this.saveConfig();

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
   * Check if Ollama is available and auto-start AI if enabled
   */
  async checkOllamaAndAutoStart() {
    try {
      // Check if Ollama is running and has the configured model
      const response = await fetch(`${this.aiEndpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        console.warn('⚠️  Ollama not responding, AI assistant disabled');
        this.aiEnabled = false;
        this.saveConfig();
        return;
      }

      const data = await response.json();
      const models = data.models || [];
      const hasModel = models.some(m => m.name === this.aiModel);

      if (!hasModel) {
        console.warn(`⚠️  Ollama model "${this.aiModel}" not found, AI assistant disabled`);
        console.warn(`   Available models: ${models.map(m => m.name).join(', ')}`);
        this.aiEnabled = false;
        this.saveConfig();
        return;
      }

      console.log(`✅ AI assistant auto-started with model: ${this.aiModel}`);
      console.log(`   Ollama endpoint: ${this.aiEndpoint}`);
    } catch (error) {
      if (error.cause?.code === 'ECONNREFUSED' || error.name === 'AbortError') {
        console.warn('⚠️  Ollama not available, AI assistant disabled');
      } else {
        console.error('❌ Error checking Ollama:', error.message);
      }
      this.aiEnabled = false;
      this.saveConfig();
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
        type: 'ai-models',
        models: data.models || []
      }));
    } catch (error) {
      // Only log error if it's not just Ollama not running
      if (error.cause?.code !== 'ECONNREFUSED') {
        console.error('❌ AI list models error:', error);
      }

      ws.send(JSON.stringify({
        type: 'ai-models',
        models: [] // Return empty list if Ollama not available
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
        status: {
          available: running,
          version: version
        }
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'ai-status',
        status: {
          available: false,
          error: error.message
        }
      }));
    }
  }

  /**
   * Get communication configuration
   */
  async commGetConfig(ws) {
    try {
      ws.send(JSON.stringify({
        type: 'comm-config',
        config: {
          email: {
            enabled: this.emailEnabled,
            host: this.emailHost,
            port: this.emailPort,
            secure: this.emailSecure,
            user: this.emailUser,
            from: this.emailFrom,
            to: this.emailTo,
            subjectPrefix: this.emailSubjectPrefix
          },
          discord: {
            enabled: this.discordEnabled,
            webhook: this.discordWebhook ? '(configured)' : '', // Don't send full webhook URL
            username: this.discordUsername,
            avatarUrl: this.discordAvatarUrl
          }
        }
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to get communication config: ${error.message}`
      }));
    }
  }

  /**
   * Set email configuration
   */
  async commSetEmail(ws, config) {
    try {
      this.emailEnabled = config.enabled;
      this.emailHost = config.host || '';
      this.emailPort = config.port || 587;
      this.emailSecure = config.secure || false;
      this.emailUser = config.user || '';
      if (config.password) {
        this.emailPassword = config.password;
      }
      this.emailFrom = config.from || '';
      this.emailTo = config.to || '';
      this.emailSubjectPrefix = config.subjectPrefix || '[Meshtastic]';

      // Broadcast updated config to all clients
      this.broadcast({
        type: 'comm-config-changed',
        config: {
          email: {
            enabled: this.emailEnabled,
            host: this.emailHost,
            port: this.emailPort,
            secure: this.emailSecure,
            user: this.emailUser,
            from: this.emailFrom,
            to: this.emailTo,
            subjectPrefix: this.emailSubjectPrefix
          }
        }
      });

      ws.send(JSON.stringify({
        type: 'comm-email-updated',
        success: true
      }));

      console.log(`📧 Email configuration updated: ${this.emailEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to update email config: ${error.message}`
      }));
    }
  }

  /**
   * Set Discord configuration
   */
  async commSetDiscord(ws, config) {
    try {
      this.discordEnabled = config.enabled;
      if (config.webhook) {
        this.discordWebhook = config.webhook;
      }
      this.discordUsername = config.username || 'Meshtastic Bridge';
      this.discordAvatarUrl = config.avatarUrl || '';

      // Broadcast updated config to all clients
      this.broadcast({
        type: 'comm-config-changed',
        config: {
          discord: {
            enabled: this.discordEnabled,
            webhook: this.discordWebhook ? '(configured)' : '',
            username: this.discordUsername,
            avatarUrl: this.discordAvatarUrl
          }
        }
      });

      ws.send(JSON.stringify({
        type: 'comm-discord-updated',
        success: true
      }));

      console.log(`💬 Discord configuration updated: ${this.discordEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to update Discord config: ${error.message}`
      }));
    }
  }

  /**
   * Test email configuration
   */
  async commTestEmail(ws) {
    try {
      if (!this.emailHost || !this.emailUser || !this.emailTo) {
        ws.send(JSON.stringify({
          type: 'comm-test-result',
          service: 'email',
          success: false,
          error: 'Email not configured. Please set host, user, and recipient.'
        }));
        return;
      }

      const transporter = nodemailer.createTransport({
        host: this.emailHost,
        port: this.emailPort,
        secure: this.emailSecure,
        auth: {
          user: this.emailUser,
          pass: this.emailPassword
        }
      });

      await transporter.sendMail({
        from: this.emailFrom || this.emailUser,
        to: this.emailTo,
        subject: `${this.emailSubjectPrefix} Test Email`,
        text: 'This is a test email from your Meshtastic Bridge.\n\nIf you received this, your email configuration is working correctly!',
        html: '<div style="font-family: Arial, sans-serif;"><h2 style="color: #4F46E5;">Test Email</h2><p>This is a test email from your Meshtastic Bridge.</p><p>If you received this, your email configuration is working correctly!</p></div>'
      });

      ws.send(JSON.stringify({
        type: 'comm-test-result',
        service: 'email',
        success: true
      }));

      console.log('📧 Test email sent successfully');
    } catch (error) {
      console.error('Email test error:', error);
      ws.send(JSON.stringify({
        type: 'comm-test-result',
        service: 'email',
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Test Discord configuration
   */
  async commTestDiscord(ws) {
    try {
      if (!this.discordWebhook) {
        ws.send(JSON.stringify({
          type: 'comm-test-result',
          service: 'discord',
          success: false,
          error: 'Discord webhook not configured. Please set webhook URL.'
        }));
        return;
      }

      const response = await fetch(this.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.discordUsername,
          avatar_url: this.discordAvatarUrl || undefined,
          embeds: [{
            title: '✅ Test Message',
            description: 'This is a test message from your Meshtastic Bridge.\n\nIf you can see this, your Discord configuration is working correctly!',
            color: 5814783,
            footer: {
              text: 'Meshtastic Bridge'
            },
            timestamp: new Date().toISOString()
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      ws.send(JSON.stringify({
        type: 'comm-test-result',
        service: 'discord',
        success: true
      }));

      console.log('💬 Test Discord message sent successfully');
    } catch (error) {
      console.error('Discord test error:', error);
      ws.send(JSON.stringify({
        type: 'comm-test-result',
        service: 'discord',
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Connect to MQTT broker
   */
  async connectMQTT() {
    if (!this.mqttEnabled || !this.mqttBrokerUrl) {
      console.log('MQTT not enabled or broker URL not configured');
      return;
    }

    if (this.mqttClient) {
      console.log('MQTT client already connected');
      return;
    }

    try {
      console.log(`🌐 Connecting to MQTT broker: ${this.mqttBrokerUrl}`);

      const options = {
        clientId: this.mqttClientId,
        clean: true,
        reconnectPeriod: 5000,
      };

      // Add credentials if provided
      if (this.mqttUsername) {
        options.username = this.mqttUsername;
      }
      if (this.mqttPassword) {
        options.password = this.mqttPassword;
      }

      this.mqttClient = mqtt.connect(this.mqttBrokerUrl, options);

      this.mqttClient.on('connect', () => {
        console.log('✅ Connected to MQTT broker');

        // Subscribe to incoming messages topic
        const incomingTopic = `${this.mqttTopicPrefix}/+/rx`;
        this.mqttClient.subscribe(incomingTopic, { qos: this.mqttQos }, (err) => {
          if (err) {
            console.error('❌ Failed to subscribe to MQTT topic:', err);
          } else {
            console.log(`📥 Subscribed to MQTT topic: ${incomingTopic}`);
          }
        });

        // Broadcast MQTT status to clients
        this.broadcast({
          type: 'mqtt-status',
          connected: true,
          broker: this.mqttBrokerUrl
        });
      });

      this.mqttClient.on('message', (topic, message) => {
        this.handleMQTTMessage(topic, message);
      });

      this.mqttClient.on('error', (error) => {
        console.error('❌ MQTT error:', error);
        this.broadcast({
          type: 'mqtt-error',
          error: error.message
        });
      });

      this.mqttClient.on('close', () => {
        console.log('📡 MQTT connection closed');
        this.broadcast({
          type: 'mqtt-status',
          connected: false
        });
      });

      this.mqttClient.on('reconnect', () => {
        console.log('🔄 Reconnecting to MQTT broker...');
      });

    } catch (error) {
      console.error('❌ Failed to connect to MQTT broker:', error);
      this.mqttClient = null;
    }
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnectMQTT() {
    if (this.mqttClient) {
      console.log('📡 Disconnecting from MQTT broker...');
      this.mqttClient.end();
      this.mqttClient = null;
      console.log('✅ Disconnected from MQTT broker');
    }
  }

  /**
   * Publish message to MQTT
   */
  async publishToMQTT(channelIndex, message) {
    if (!this.mqttClient || !this.mqttClient.connected) {
      console.log('⚠️  MQTT not connected, skipping publish');
      return;
    }

    try {
      const topic = `${this.mqttTopicPrefix}/channel${channelIndex}/tx`;
      const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        channel: channelIndex,
        from: message.from,
        text: message.text,
        rssi: message.rssi,
        snr: message.snr
      });

      this.mqttClient.publish(topic, payload, {
        qos: this.mqttQos,
        retain: this.mqttRetain
      }, (err) => {
        if (err) {
          console.error('❌ Failed to publish to MQTT:', err);
        } else {
          console.log(`📤 Published to MQTT topic: ${topic}`);
        }
      });
    } catch (error) {
      console.error('❌ Error publishing to MQTT:', error);
    }
  }

  /**
   * Handle incoming MQTT messages
   */
  async handleMQTTMessage(topic, messageBuffer) {
    try {
      const message = JSON.parse(messageBuffer.toString());
      console.log(`📥 MQTT message from ${topic}:`, message);

      // Extract channel from topic (format: prefix/channel0/rx)
      const topicParts = topic.split('/');
      const channelPart = topicParts[topicParts.length - 2]; // Get "channel0"
      const channelIndex = parseInt(channelPart.replace('channel', ''));

      if (isNaN(channelIndex)) {
        console.error('❌ Invalid channel in MQTT topic:', topic);
        return;
      }

      // Forward MQTT message to all radios on the appropriate channel
      const text = message.text || message.message || '';
      if (!text) {
        console.warn('⚠️  MQTT message has no text content');
        return;
      }

      console.log(`🌉 Forwarding MQTT message to radios on channel ${channelIndex}: "${text}"`);

      // Send to all connected radios
      for (const [radioId, radio] of this.radios.entries()) {
        try {
          await radio.protocol.sendMessage(text, channelIndex, { wantAck: false });
          console.log(`✅ Forwarded MQTT message to ${radioId}`);
        } catch (error) {
          console.error(`❌ Failed to forward MQTT message to ${radioId}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error handling MQTT message:', error);
    }
  }

  /**
   * Test MQTT connection
   */
  async testMQTT(ws) {
    try {
      if (!this.mqttBrokerUrl) {
        ws.send(JSON.stringify({
          type: 'mqtt-test-result',
          success: false,
          error: 'MQTT broker URL not configured'
        }));
        return;
      }

      // Try to connect temporarily
      const testClient = mqtt.connect(this.mqttBrokerUrl, {
        clientId: `mesh-bridge-test-${Date.now()}`,
        username: this.mqttUsername || undefined,
        password: this.mqttPassword || undefined,
        connectTimeout: 10000
      });

      testClient.on('connect', () => {
        console.log('✅ MQTT test connection successful');
        testClient.end();
        ws.send(JSON.stringify({
          type: 'mqtt-test-result',
          success: true
        }));
      });

      testClient.on('error', (error) => {
        console.error('❌ MQTT test connection failed:', error);
        testClient.end();
        ws.send(JSON.stringify({
          type: 'mqtt-test-result',
          success: false,
          error: error.message
        }));
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (testClient.connected) {
          testClient.end();
        } else {
          ws.send(JSON.stringify({
            type: 'mqtt-test-result',
            success: false,
            error: 'Connection timeout'
          }));
        }
      }, 10000);

    } catch (error) {
      console.error('❌ MQTT test error:', error);
      ws.send(JSON.stringify({
        type: 'mqtt-test-result',
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Get MQTT configuration
   */
  async mqttGetConfig(ws) {
    ws.send(JSON.stringify({
      type: 'mqtt-config',
      config: {
        enabled: this.mqttEnabled,
        brokerUrl: this.mqttBrokerUrl,
        username: this.mqttUsername,
        password: this.mqttPassword ? '********' : '', // Mask password
        topicPrefix: this.mqttTopicPrefix,
        qos: this.mqttQos,
        retain: this.mqttRetain,
        connected: this.mqttClient ? this.mqttClient.connected : false
      }
    }));
  }

  /**
   * Set MQTT configuration
   */
  async mqttSetConfig(ws, config) {
    try {
      // Disconnect existing connection if any
      await this.disconnectMQTT();

      // Update configuration
      if (config.brokerUrl !== undefined) this.mqttBrokerUrl = config.brokerUrl;
      if (config.username !== undefined) this.mqttUsername = config.username;
      if (config.password !== undefined && config.password !== '********') {
        this.mqttPassword = config.password;
      }
      if (config.topicPrefix !== undefined) this.mqttTopicPrefix = config.topicPrefix;
      if (config.qos !== undefined) this.mqttQos = config.qos;
      if (config.retain !== undefined) this.mqttRetain = config.retain;

      console.log('✅ MQTT configuration updated');

      // Send confirmation
      ws.send(JSON.stringify({
        type: 'mqtt-config-updated',
        success: true
      }));

      // Broadcast updated config to all clients
      this.broadcast({
        type: 'mqtt-config-changed',
        config: {
          enabled: this.mqttEnabled,
          brokerUrl: this.mqttBrokerUrl,
          username: this.mqttUsername,
          password: this.mqttPassword ? '********' : '',
          topicPrefix: this.mqttTopicPrefix,
          qos: this.mqttQos,
          retain: this.mqttRetain
        }
      });

      // Reconnect if enabled
      if (this.mqttEnabled) {
        await this.connectMQTT();
      }

    } catch (error) {
      console.error('❌ Failed to update MQTT config:', error);
      ws.send(JSON.stringify({
        type: 'mqtt-config-updated',
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Enable/disable MQTT
   */
  async mqttSetEnabled(ws, enabled) {
    try {
      this.mqttEnabled = enabled;
      console.log(`MQTT ${enabled ? 'enabled' : 'disabled'}`);

      if (enabled) {
        await this.connectMQTT();
      } else {
        await this.disconnectMQTT();
      }

      ws.send(JSON.stringify({
        type: 'mqtt-enabled-updated',
        success: true,
        enabled: this.mqttEnabled
      }));

      // Broadcast to all clients
      this.broadcast({
        type: 'mqtt-config-changed',
        config: {
          enabled: this.mqttEnabled,
          brokerUrl: this.mqttBrokerUrl,
          username: this.mqttUsername,
          password: this.mqttPassword ? '********' : '',
          topicPrefix: this.mqttTopicPrefix,
          qos: this.mqttQos,
          retain: this.mqttRetain,
          connected: this.mqttClient ? this.mqttClient.connected : false
        }
      });

    } catch (error) {
      console.error('❌ Failed to toggle MQTT:', error);
      ws.send(JSON.stringify({
        type: 'mqtt-enabled-updated',
        success: false,
        error: error.message
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
