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
import { Client, GatewayIntentBits } from 'discord.js';
import { createProtocol, getSupportedProtocols } from './protocols/index.mjs';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

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
    this.maxHistorySize = 1000;              // Keep last 1000 messages (increased for high uptime)
    this.seenMessageIds = new Set();         // Track message IDs for deduplication
    this.maxSeenMessages = 2000;             // Limit size of seen messages set (increased)
    this.seenMessageTimestamps = new Map();  // Track when message IDs were added for age-based cleanup

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

    // ===== ADVANCED FORWARDING OPTIONS =====
    // Forward node announcements (NODEINFO_APP packets) across bridge
    // Useful for: Bridging separate meshes so nodes become aware of each other
    // Warning: May create confusion if both radios are on same mesh
    this.forwardNodeInfo = false;     // Enable/disable node announcement forwarding
    this.forwardNodeInfoRateLimit = new Map(); // Track last forward time per node (prevent spam)

    // Forward encrypted messages by channel INDEX instead of PSK matching
    // When true: "Channel 0 → Channel 0" regardless of encryption keys
    // When false: Only forward if PSKs match
    // Use case: Bridging two separate encrypted meshes with different keys
    this.forwardEncryptedByIndex = false;  // Enable index-based encrypted forwarding

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

    // ===== HTTP PROXY CONFIGURATION =====
    // Configure proxy agent for fetch requests (respects https_proxy env var)
    this.httpsAgent = process.env.https_proxy || process.env.HTTPS_PROXY
      ? new HttpsProxyAgent(process.env.https_proxy || process.env.HTTPS_PROXY)
      : undefined;

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
    this.discordWebhook = '';                  // Discord webhook URL (one-way: mesh → Discord)
    this.discordUsername = 'Meshtastic Bridge'; // Bot username for Discord messages
    this.discordAvatarUrl = '';                // Optional avatar URL for Discord bot

    // Discord Bot (two-way: mesh ↔ Discord)
    this.discordBotEnabled = false;            // Enable/disable Discord bot
    this.discordBotToken = '';                 // Discord bot token
    this.discordChannelId = '';                // Discord channel ID to monitor
    this.discordClient = null;                 // Discord.js client instance
    this.discordSendEmergency = false;         // Auto-send emergency/SOS messages to Discord

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

    // ===== ADVERTISEMENT BOT CONFIGURATION =====
    // Periodically send advertisement messages to inform users about the bot
    this.adBotEnabled = false;                 // Enable/disable advertisement bot
    this.adBotInterval = 3600000;              // Default: 1 hour (in milliseconds)
    this.adBotMessages = [];                   // Array of messages to rotate through
    this.adBotTargetRadios = [];               // Target radios (empty = all radios)
    this.adBotChannel = 0;                     // Channel to send on (0 = public)
    this.adBotLastSent = new Map();            // Track last send time per radio
    this.adBotTimer = null;                    // Interval timer reference
    this.adBotMessageIndex = 0;                // Current message index for rotation

    // ===== CONSOLE OUTPUT CAPTURE =====
    // Capture all console output and broadcast to WebSocket clients for raw log viewing
    this.consoleBuffer = [];                   // Buffer for raw console output
    this.maxConsoleBuffer = 5000;              // Keep last 5000 lines (increased for high uptime)
    this.setupConsoleCapture();

    // Periodic cleanup task for memory management (runs every 10 minutes)
    setInterval(() => this.performMemoryCleanup(), 10 * 60 * 1000);

    // Load persistent configuration (AI state, etc.)
    this.loadConfig();

    console.log(`\n⚙️  BRIDGE CONFIGURATION:`);
    console.log(`   Smart channel matching: ${this.enableSmartMatching ? 'ENABLED (recommended)' : 'DISABLED'}`);
    console.log(`   Manual channel map: ${this.channelMap ? JSON.stringify(this.channelMap) : 'None (auto-detect)'}`);
    console.log(`   Forward node announcements: ${this.forwardNodeInfo ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Forward encrypted by index: ${this.forwardEncryptedByIndex ? 'ENABLED' : 'DISABLED'}`);
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
    console.log(`   Discord webhook: ${this.discordEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Discord bot: ${this.discordBotEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.discordBotEnabled) {
      console.log(`   Discord bot status: ${this.discordClient ? 'CONNECTED' : 'NOT CONNECTED'}`);
      if (!this.discordClient) {
        if (!this.discordBotToken) {
          console.log(`   Discord bot issue: Missing bot token`);
        } else if (!this.discordChannelId) {
          console.log(`   Discord bot issue: Missing channel ID`);
        } else {
          console.log(`   Discord bot issue: Connection failed (check token/permissions)`);
        }
      }
    }
    console.log(`   MQTT bridge: ${this.mqttEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.mqttEnabled) {
      console.log(`   MQTT broker: ${this.mqttBrokerUrl}`);
      console.log(`   MQTT topic prefix: ${this.mqttTopicPrefix}`);
    }
    console.log('');
  }

  /**
   * Setup console output capture to broadcast to WebSocket clients
   */
  setupConsoleCapture() {
    // Store original console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    // Helper to capture and broadcast console output
    const captureOutput = (level, args) => {
      // Convert arguments to string
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      // Add to buffer with timestamp
      const line = {
        timestamp: new Date().toISOString(),
        level,
        message
      };

      this.consoleBuffer.push(line);

      // Trim buffer if too large
      if (this.consoleBuffer.length > this.maxConsoleBuffer) {
        this.consoleBuffer = this.consoleBuffer.slice(-this.maxConsoleBuffer);
      }

      // Broadcast to all connected WebSocket clients
      this.broadcast({
        type: 'console-output',
        line
      });
    };

    // Override console methods
    console.log = (...args) => {
      originalLog(...args);
      captureOutput('log', args);
    };

    console.error = (...args) => {
      originalError(...args);
      captureOutput('error', args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      captureOutput('warn', args);
    };

    console.info = (...args) => {
      originalInfo(...args);
      captureOutput('info', args);
    };

    // Store originals for potential restoration
    this.originalConsole = {
      log: originalLog,
      error: originalError,
      warn: originalWarn,
      info: originalInfo
    };
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

        // Load Email configuration
        if (config.email) {
          if (config.email.enabled !== undefined) this.emailEnabled = config.email.enabled;
          if (config.email.host) this.emailHost = config.email.host;
          if (config.email.port !== undefined) this.emailPort = config.email.port;
          if (config.email.secure !== undefined) this.emailSecure = config.email.secure;
          if (config.email.user) this.emailUser = config.email.user;
          if (config.email.password) this.emailPassword = config.email.password;
          if (config.email.from) this.emailFrom = config.email.from;
          if (config.email.to) this.emailTo = config.email.to;
          if (config.email.subjectPrefix) this.emailSubjectPrefix = config.email.subjectPrefix;
          console.log(`📋 Loaded Email config: ${this.emailEnabled ? 'ENABLED' : 'DISABLED'}`);
        }

        // Load Discord configuration
        if (config.discord) {
          if (config.discord.enabled !== undefined) this.discordEnabled = config.discord.enabled;
          if (config.discord.webhook) this.discordWebhook = config.discord.webhook;
          if (config.discord.username) this.discordUsername = config.discord.username;
          if (config.discord.avatarUrl) this.discordAvatarUrl = config.discord.avatarUrl;

          // Load Discord bot configuration
          if (config.discord.botEnabled !== undefined) this.discordBotEnabled = config.discord.botEnabled;
          if (config.discord.botToken) this.discordBotToken = config.discord.botToken;
          if (config.discord.channelId) this.discordChannelId = config.discord.channelId;
          if (config.discord.sendEmergency !== undefined) this.discordSendEmergency = config.discord.sendEmergency;

          console.log(`📋 Loaded Discord config: Webhook=${this.discordEnabled ? 'ENABLED' : 'DISABLED'}, Bot=${this.discordBotEnabled ? 'ENABLED' : 'DISABLED'}, Emergency=${this.discordSendEmergency ? 'ENABLED' : 'DISABLED'}`);
        }

        // Load MQTT configuration
        if (config.mqtt) {
          if (config.mqtt.enabled !== undefined) this.mqttEnabled = config.mqtt.enabled;
          if (config.mqtt.brokerUrl) this.mqttBrokerUrl = config.mqtt.brokerUrl;
          if (config.mqtt.username) this.mqttUsername = config.mqtt.username;
          if (config.mqtt.password) this.mqttPassword = config.mqtt.password;
          if (config.mqtt.topicPrefix) this.mqttTopicPrefix = config.mqtt.topicPrefix;
          if (config.mqtt.qos !== undefined) this.mqttQos = config.mqtt.qos;
          if (config.mqtt.retain !== undefined) this.mqttRetain = config.mqtt.retain;
          console.log(`📋 Loaded MQTT config: ${this.mqttEnabled ? 'ENABLED' : 'DISABLED'}`);
        }

        // Load Advertisement Bot configuration
        if (config.advertisementBot) {
          if (config.advertisementBot.enabled !== undefined) this.adBotEnabled = config.advertisementBot.enabled;
          if (config.advertisementBot.interval !== undefined) this.adBotInterval = config.advertisementBot.interval;
          if (Array.isArray(config.advertisementBot.messages)) this.adBotMessages = config.advertisementBot.messages;
          if (Array.isArray(config.advertisementBot.targetRadios)) this.adBotTargetRadios = config.advertisementBot.targetRadios;
          if (config.advertisementBot.channel !== undefined) this.adBotChannel = config.advertisementBot.channel;
          console.log(`📋 Loaded Advertisement Bot config: ${this.adBotEnabled ? 'ENABLED' : 'DISABLED'}`);
        }
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
        email: {
          enabled: this.emailEnabled,
          host: this.emailHost,
          port: this.emailPort,
          secure: this.emailSecure,
          user: this.emailUser,
          password: this.emailPassword, // Stored securely in config file
          from: this.emailFrom,
          to: this.emailTo,
          subjectPrefix: this.emailSubjectPrefix
        },
        discord: {
          enabled: this.discordEnabled,
          webhook: this.discordWebhook,
          username: this.discordUsername,
          avatarUrl: this.discordAvatarUrl,
          botEnabled: this.discordBotEnabled,
          botToken: this.discordBotToken,
          channelId: this.discordChannelId,
          sendEmergency: this.discordSendEmergency
        },
        mqtt: {
          enabled: this.mqttEnabled,
          brokerUrl: this.mqttBrokerUrl,
          username: this.mqttUsername,
          password: this.mqttPassword, // Stored securely in config file
          topicPrefix: this.mqttTopicPrefix,
          qos: this.mqttQos,
          retain: this.mqttRetain
        },
        advertisementBot: {
          enabled: this.adBotEnabled,
          interval: this.adBotInterval,
          messages: this.adBotMessages,
          targetRadios: this.adBotTargetRadios,
          channel: this.adBotChannel
        }
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

      // Send console output buffer to new client
      ws.send(JSON.stringify({
        type: 'console-history',
        lines: this.consoleBuffer
      }));

      // Send current radio status with complete state
      const radiosStatus = Array.from(this.radios.entries()).map(([id, radio]) => ({
        id,
        port: radio.port,
        status: radio.status || 'connecting',
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

      // Connect to Discord bot if enabled
      if (this.discordBotEnabled && this.discordBotToken && this.discordChannelId) {
        this.connectDiscordBot();
      }

      // Auto-start AI assistant if it was previously enabled
      if (this.aiEnabled) {
        console.log('🤖 AI assistant was previously enabled, checking Ollama availability...');
        this.checkOllamaAndAutoStart();
      }

      // Start advertisement bot if enabled
      if (this.adBotEnabled) {
        console.log('📢 Advertisement bot enabled, starting...');
        this.setupAdvertisementBot();
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

        case 'reboot-radio':
          await this.rebootRadio(ws, message.radioId);
          break;

        case 'get-channel':
          await this.getChannel(ws, message.radioId, message.channelIndex);
          break;

        case 'set-channel':
          await this.setChannel(ws, message.radioId, message.channelConfig);
          break;

        case 'get-config':
          await this.getRadioConfig(ws, message.radioId, message.configType);
          break;

        case 'set-config':
          await this.setRadioConfig(ws, message.radioId, message.configType, message.config);
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

        // Advertisement Bot Management
        case 'adbot-get-config':
          await this.adBotGetConfig(ws);
          break;

        case 'adbot-set-config':
          await this.adBotSetConfig(ws, message.config);
          break;

        case 'adbot-test':
          await this.adBotTest(ws);
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

      // Generate stable radio ID based on port path
      // This ensures reconnections on the same port reuse the same ID (prevents duplicates)
      const portHash = portPath.replace(/[^a-zA-Z0-9]/g, '-');
      const radioId = `radio-${portHash}`;

      // Check if a radio already exists for this port
      for (const [existingId, existingRadio] of this.radios.entries()) {
        if (existingRadio.port === portPath) {
          console.log(`ℹ️  Radio already connected to ${portPath} (${existingId})`);
          return; // Don't create duplicate
        }
      }

      // Create protocol handler
      const protocolHandler = createProtocol(protocol, radioId, portPath);

      // Subscribe to protocol events
      protocolHandler.on('message', (packet) => {
        this.handleMessagePacket(radioId, portPath, packet, protocolHandler.getProtocolName());
      });

      protocolHandler.on('nodeinfo-packet', (packet) => {
        this.handleNodeInfoPacket(radioId, packet);
      });

      protocolHandler.on('nodeInfo', async (nodeInfo) => {
        const radio = this.radios.get(radioId);
        if (radio) {
          // Check if this is the first time we're setting nodeInfo (initial configuration)
          const isInitialConfig = !radio.nodeInfo;

          radio.nodeInfo = nodeInfo;

          // Parse nodeId correctly - handle different formats
          try {
            if (nodeInfo.nodeId) {
              if (nodeInfo.nodeId.startsWith('!')) {
                // Format: "!e3d5b1aa" (hex with ! prefix)
                radio.nodeNum = parseInt(nodeInfo.nodeId.substring(1), 16);
              } else {
                // Try parsing as-is
                radio.nodeNum = parseInt(nodeInfo.nodeId, 16);
              }
            }
          } catch (error) {
            console.error(`❌ Failed to parse nodeId "${nodeInfo.nodeId}":`, error);
            radio.nodeNum = null;
          }

          // Only log on initial configuration, not on periodic updates
          if (isInitialConfig) {
            console.log(`✅ Radio ${radioId} configured: ${nodeInfo.longName} (${nodeInfo.nodeId}), nodeNum: ${radio.nodeNum}`);
          }

          // Broadcast updated radio info to clients (for UI refresh)
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
        // Check if this is a telemetry update (has battery/temp but no real name)
        const isTelemetry = (meshNode.batteryLevel !== undefined || meshNode.temperature !== undefined) &&
                           (meshNode.longName === 'Unknown' || meshNode.shortName === '????');

        if (isTelemetry) {
          const details = [];
          if (meshNode.batteryLevel !== undefined) details.push(`🔋${meshNode.batteryLevel}%`);
          if (meshNode.temperature !== undefined) details.push(`🌡️${meshNode.temperature}°C`);
          console.log(`📊 Telemetry update for ${meshNode.nodeId}: ${details.join(' ')}`);
        }
        // Nodes are logged when first discovered, don't spam on every update

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

      // Handle disconnection (when serial port closes naturally)
      protocolHandler.on('disconnected', () => {
        console.log(`🔌 Radio ${radioId} disconnected (serial port closed)`);
        this.handleRadioDisconnect(radioId);
      });

      // Handle emergency/SOS waypoints
      protocolHandler.on('emergency', async (emergencyData) => {
        console.log(`🚨 Emergency detected from node ${emergencyData.from}`);

        // Send to Discord if enabled
        if (this.discordSendEmergency) {
          const waypointInfo = emergencyData.waypoint;
          let message = `🚨 **EMERGENCY / SOS ALERT** 🚨\n`;
          message += `From Node: ${emergencyData.from}\n`;
          if (waypointInfo.name) message += `Location: ${waypointInfo.name}\n`;
          if (waypointInfo.description) message += `Details: ${waypointInfo.description}\n`;
          if (waypointInfo.latitude && waypointInfo.longitude) {
            message += `Coordinates: ${waypointInfo.latitude}, ${waypointInfo.longitude}\n`;
            message += `Map: https://www.google.com/maps?q=${waypointInfo.latitude},${waypointInfo.longitude}`;
          }

          // Send via webhook if enabled
          if (this.discordEnabled && this.discordWebhook) {
            await this.sendToDiscord(message);
          }

          // Send via bot if enabled
          if (this.discordBotEnabled && this.discordClient) {
            await this.sendDiscordBotMessage(message);
          }
        }
      });

      // Store radio reference
      this.radios.set(radioId, {
        protocol: protocolHandler,
        protocolType: protocol,
        port: portPath,
        status: 'connecting',
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

      // Update radio status to connected
      const radio = this.radios.get(radioId);
      if (radio) {
        radio.status = 'connected';
      }

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

    // Convert channels Map to Array for JSON serialization
    const channels = radio.channels ? Array.from(radio.channels.values()) : [];

    return {
      id: radioId,
      name: radio.nodeInfo?.longName || `Radio ${radioId.substring(0, 8)}`,
      port: radio.port,
      protocol: radio.protocol?.getProtocolName() || radio.protocolType,
      status: radio.status || 'connecting',
      nodeInfo: radio.nodeInfo,
      messagesReceived: radio.messagesReceived,
      messagesSent: radio.messagesSent,
      errors: radio.errors,
      channels: channels,  // Include channel configurations
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
   * Perform periodic memory cleanup to prevent unbounded growth
   * Runs every 10 minutes to clean up old data
   */
  performMemoryCleanup() {
    try {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000); // 1 hour in milliseconds

      // Clean up old seen message IDs (older than 1 hour)
      let cleanedCount = 0;
      for (const [messageId, timestamp] of this.seenMessageTimestamps.entries()) {
        if (timestamp < oneHourAgo) {
          this.seenMessageIds.delete(messageId);
          this.seenMessageTimestamps.delete(messageId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Memory cleanup: Removed ${cleanedCount} old message IDs from deduplication cache`);
      }

      // Report current memory usage
      const memUsage = {
        consoleBuffer: this.consoleBuffer.length,
        messageHistory: this.messageHistory.length,
        seenMessageIds: this.seenMessageIds.size,
        connectedRadios: this.radios.size,
        wsClients: this.clients.size
      };

      console.log(`📊 Memory stats: Console=${memUsage.consoleBuffer}/${this.maxConsoleBuffer}, ` +
                  `Messages=${memUsage.messageHistory}/${this.maxHistorySize}, ` +
                  `Dedup=${memUsage.seenMessageIds}/${this.maxSeenMessages}, ` +
                  `Radios=${memUsage.connectedRadios}, Clients=${memUsage.wsClients}`);

    } catch (error) {
      console.error(`❌ Error during memory cleanup:`, error);
    }
  }

  /**
   * Truncate message to fit within Meshtastic's 512-byte limit
   * Accounts for UTF-8 encoding where some characters are multiple bytes
   * @param {string} message - Message to truncate
   * @param {number} maxBytes - Maximum bytes (default 480 to leave buffer)
   * @returns {string} - Truncated message
   */
  truncateForMeshtastic(message, maxBytes = 480) {
    if (!message) return '';

    // Quick check - if message is short, no need to truncate
    if (message.length < 200) {
      const byteSize = Buffer.byteLength(message, 'utf8');
      if (byteSize <= maxBytes) {
        return message;
      }
    }

    // Need to truncate - use smart truncation
    const encoder = new TextEncoder();
    let truncated = message;
    let bytes = encoder.encode(truncated);

    // If message is too long, truncate character by character until it fits
    if (bytes.length > maxBytes) {
      // Leave room for "..." indicator (3 bytes)
      const targetBytes = maxBytes - 6;

      // Binary search for optimal length
      let low = 0;
      let high = truncated.length;
      let bestLength = 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testString = truncated.substring(0, mid);
        const testBytes = encoder.encode(testString);

        if (testBytes.length <= targetBytes) {
          bestLength = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      truncated = message.substring(0, bestLength).trim() + '…';
    }

    return truncated;
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
          // Notify clients about duplicate detection for statistics
          this.broadcast({
            type: 'message-duplicate',
            messageId: packet.id
          });
          return;
        }

        // Mark message as seen with timestamp for age-based cleanup
        this.seenMessageIds.add(packet.id);
        this.seenMessageTimestamps.set(packet.id, Date.now());

        // Limit size of seen messages set to prevent memory leak
        if (this.seenMessageIds.size > this.maxSeenMessages) {
          const firstId = this.seenMessageIds.values().next().value;
          this.seenMessageIds.delete(firstId);
          this.seenMessageTimestamps.delete(firstId);
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
   * Handle node info announcement packets
   * Forwards node announcements to other radios if enabled
   */
  handleNodeInfoPacket(radioId, packet) {
    try {
      if (!this.forwardNodeInfo) {
        // Node info forwarding disabled
        return;
      }

      console.log(`📡 Node info packet from ${radioId}:`, {
        from: packet.from,
        longName: packet.data?.longName,
        channel: packet.channel
      });

      // Check if this is from one of our bridge radios (prevent forwarding our own announcements)
      const isFromOurBridgeRadio = Array.from(this.radios.values()).some(
        radio => radio.nodeNum === packet.from
      );

      if (isFromOurBridgeRadio) {
        console.log(`🔁 Node info from our own bridge radio ${packet.from}, skipping forward`);
        return;
      }

      // Rate limiting: Only forward each node's announcement once per 5 minutes
      const nodeId = packet.from.toString();
      const lastForward = this.forwardNodeInfoRateLimit.get(nodeId);
      const now = Date.now();

      if (lastForward && (now - lastForward) < 300000) { // 5 minutes
        console.log(`⏱️  Rate limit: Node ${nodeId} announcement forwarded ${Math.floor((now - lastForward) / 1000)}s ago, skipping`);
        return;
      }

      // Mark as forwarded
      this.forwardNodeInfoRateLimit.set(nodeId, now);

      // Clean up old entries (keep only last 100 nodes)
      if (this.forwardNodeInfoRateLimit.size > 100) {
        const firstKey = this.forwardNodeInfoRateLimit.keys().next().value;
        this.forwardNodeInfoRateLimit.delete(firstKey);
      }

      console.log(`🌉 Forwarding node info to other radios (node: ${packet.data?.shortName || packet.from})`);
      this.forwardNodeInfoToOtherRadios(radioId, packet);
    } catch (error) {
      console.error('❌ Error handling node info packet:', error, packet);
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
        case 'alerts':
        case 'nws':
          response = await this.cmdAlerts(cmdArgs);
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
        // Truncate response to fit within Meshtastic's byte limit
        const truncatedResponse = this.truncateForMeshtastic(response);
        console.log(`🤖 Sending response: ${truncatedResponse.substring(0, 100)}...`);

        try {
          await radio.protocol.sendMessage(truncatedResponse, channel, { wantAck: false });
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
      `${this.commandPrefix}weather [location] - Get weather + 48hr forecast`,
      `${this.commandPrefix}alerts [state] - Get NWS weather alerts`,
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
    return `🔖 Meshtastic Bridge GUI Alpha 25.11\n` +
           `Node.js ${process.version}\n` +
           `Platform: ${process.platform}`;
  }

  /**
   * Command: #weather [location] - Get current weather
   * Uses Open-Meteo API (free, no API key required, no rate limits)
   * Supports: city name, "city, state", state code
   * Examples: #weather Seattle | #weather Seattle, WA
   */
  async cmdWeather(args) {
    // Parse and validate location input
    let location;

    if (args.length === 0) {
      return `❌ Please provide a location\nEx: #weather Seattle, WA`;
    }

    // Join args and normalize
    location = args.join(' ').trim().replace(/\s+/g, ' ');

    // Validate location format
    if (!this.isValidLocation(location)) {
      return `❌ Invalid location\nEx: #weather Seattle, WA`;
    }

    try {
      // Create abort controller for 10 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Step 1: Geocode location to get coordinates
      const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;

      const geoResponse = await fetch(geocodeUrl, {
        headers: { 'User-Agent': 'MeshBridgeGUI/1.0' },
        signal: controller.signal
      });

      if (!geoResponse.ok) {
        clearTimeout(timeoutId);
        return `❌ Geocoding service error`;
      }

      const geoData = await geoResponse.json();

      if (!geoData.results || geoData.results.length === 0) {
        clearTimeout(timeoutId);
        return `❌ Location not found: ${location}`;
      }

      const place = geoData.results[0];
      const lat = place.latitude;
      const lon = place.longitude;
      const placeName = place.name + (place.admin1 ? `, ${place.admin1}` : '');

      // Step 2: Get weather for coordinates
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1`;

      const weatherResponse = await fetch(weatherUrl, {
        headers: { 'User-Agent': 'MeshBridgeGUI/1.0' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!weatherResponse.ok) {
        return `❌ Weather service error`;
      }

      const weatherData = await weatherResponse.json();
      const current = weatherData.current;

      // Map WMO weather codes to descriptions
      const weatherCodes = {
        0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy',
        45: 'Foggy', 48: 'Foggy', 51: 'Light Drizzle', 53: 'Drizzle',
        55: 'Heavy Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
        71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 80: 'Light Showers',
        81: 'Showers', 82: 'Heavy Showers', 95: 'Thunderstorm'
      };
      const condition = weatherCodes[current.weather_code] || 'Unknown';

      // Build compact response for Meshtastic (237 byte limit)
      let result = `🌤️ ${placeName}\n`;
      result += `${condition} ${Math.round(current.temperature_2m)}°F\n`;
      result += `💧${current.relative_humidity_2m}% 💨${Math.round(current.wind_speed_10m)}mph`;

      return result;

    } catch (error) {
      console.error('Weather fetch error:', error);

      // Provide short error messages for Meshtastic 237-byte limit
      if (error.name === 'AbortError') {
        return `❌ Request timeout`;
      } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        return `❌ DNS error`;
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        return `❌ Connection timeout`;
      } else {
        return `❌ Weather error`;
      }
    }
  }

  /**
   * Validates location format (city, state, zipcode)
   */
  isValidLocation(location) {
    if (!location || location.length === 0) {
      return false;
    }

    // Check for overly long input (potential abuse)
    if (location.length > 100) {
      return false;
    }

    // Allow alphanumeric, spaces, commas, hyphens, periods (for normal location names)
    const validPattern = /^[a-zA-Z0-9\s,.\-]+$/;
    if (!validPattern.test(location)) {
      return false;
    }

    // If it looks like a zipcode, validate format
    const zipcodePattern = /^\d{5}(-\d{4})?$/;
    if (/^\d/.test(location)) {
      return zipcodePattern.test(location);
    }

    return true;
  }

  /**
   * Command: #alerts [state|zipcode] - Get NWS weather alerts
   * Examples: #alerts CA | #alerts 98101 | #alerts WA
   */
  async cmdAlerts(args) {
    if (args.length === 0) {
      return `❌ Please provide a state code or location. Examples:\n` +
             `  #alerts CA\n` +
             `  #alerts WA\n` +
             `  #alerts NY`;
    }

    const location = args.join(' ').trim().toUpperCase();

    // Validate state code (2 letters)
    if (!/^[A-Z]{2}$/.test(location)) {
      return `❌ Please use a 2-letter state code (e.g., CA, WA, NY)`;
    }

    try {
      const url = `https://api.weather.gov/alerts/active?area=${location}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MeshBridgeGUI/1.0 (Emergency Alert System)',
          'Accept': 'application/geo+json',
        },
        agent: this.httpsAgent
      });

      if (!response.ok) {
        if (response.status === 404) {
          return `❌ Invalid state code: ${location}`;
        }
        return `❌ NWS service unavailable (${response.status})`;
      }

      const data = await response.json();
      const alerts = data.features || [];

      if (alerts.length === 0) {
        return `✅ No active weather alerts for ${location}`;
      }

      // Format top 3 alerts (to fit in message size limit)
      const topAlerts = alerts.slice(0, 3);
      let message = `🌩️ NWS Alerts for ${location} (${alerts.length}):\n`;

      topAlerts.forEach((feature, idx) => {
        const props = feature.properties;
        const severity = props.severity || 'Unknown';
        const event = props.event || 'Alert';
        const area = props.areaDesc || 'Unknown area';

        // Shorten area description if too long
        const shortArea = area.length > 30 ? area.substring(0, 27) + '...' : area;

        message += `${idx + 1}. ${event}\n`;
        message += `   ${shortArea}\n`;
        message += `   Severity: ${severity}\n`;
      });

      if (alerts.length > 3) {
        message += `\n+${alerts.length - 3} more alerts`;
      }

      return message;

    } catch (error) {
      console.error('NWS alerts fetch error:', error);
      return `❌ Couldn't fetch alerts: ${error.message}`;
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
        signal: controller.signal,
        agent: this.httpsAgent
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
    // Check if either Discord webhook OR bot is enabled
    if (!this.discordEnabled && !this.discordBotEnabled) {
      return '💬 Discord is disabled. Enable webhook or bot in bridge configuration.';
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

      let webhookSent = false;
      let botSent = false;

      // Send to Discord webhook if enabled
      if (this.discordEnabled && this.discordWebhook) {
        try {
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
            }),
            agent: this.httpsAgent
          });

          if (response.ok) {
            webhookSent = true;
            console.log(`💬 Discord webhook message sent`);
          } else {
            console.error(`Discord webhook API error: ${response.status}`);
          }
        } catch (error) {
          console.error('Discord webhook error:', error);
        }
      }

      // Send to Discord bot if enabled
      if (this.discordBotEnabled) {
        if (!this.discordBotToken) {
          console.log('💬 Discord bot enabled but no bot token configured');
        } else if (!this.discordChannelId) {
          console.log('💬 Discord bot enabled but no channel ID configured');
        } else if (!this.discordClient) {
          console.log('💬 Discord bot enabled but not connected. Check bot token and permissions.');
        } else {
          try {
            await this.sendDiscordBotMessage(`📡 **From ${nodeName}** (\`${fromNode.toString(16)}\`)\n${message}`);
            botSent = true;
            console.log(`💬 Discord bot message sent`);
          } catch (error) {
            console.error('Discord bot error:', error);
          }
        }
      }

      // Return appropriate response with better diagnostics
      if (webhookSent && botSent) {
        return `✅ Discord sent (webhook + bot)!`;
      } else if (webhookSent) {
        return `✅ Discord sent (webhook)!`;
      } else if (botSent) {
        return `✅ Discord sent (bot)!`;
      } else {
        // Provide helpful error message
        if (this.discordBotEnabled && !this.discordBotToken) {
          return '❌ Bot enabled but missing token. Configure in settings.';
        } else if (this.discordBotEnabled && !this.discordChannelId) {
          return '❌ Bot enabled but missing channel ID. Configure in settings.';
        } else if (this.discordBotEnabled && !this.discordClient) {
          return '❌ Bot not connected. Check token/permissions.';
        } else if (this.discordEnabled && !this.discordWebhook) {
          return '❌ Webhook enabled but URL missing. Configure in settings.';
        } else {
          return '❌ Discord send failed. Check configuration.';
        }
      }


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
    if (!this.emailEnabled && !this.discordEnabled && !this.discordBotEnabled) {
      return '📣 No notification methods enabled. Enable email, Discord webhook, or Discord bot in bridge configuration.';
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

    // Try Discord if webhook OR bot is enabled
    if (this.discordEnabled || this.discordBotEnabled) {
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

        // Notify clients about successful forwarding for statistics
        if (successCount > 0) {
          this.broadcast({
            type: 'message-forwarded',
            count: successCount
          });
        }
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

      // Check if index-based encrypted forwarding is enabled
      if (this.forwardEncryptedByIndex) {
        console.log(`   [INDEX MODE OVERRIDE] Forward encrypted by index enabled - forwarding to channel ${channel} regardless of PSK`);
      } else {
        console.log(`   Searching for matching channel on other radios...`);
      }

      // Forward to each radio that has matching channel configuration
      const forwardPromises = otherRadios.map(async ([targetRadioId, radio]) => {
        try {
          // ===== CROSS-PROTOCOL BRIDGING =====
          // Check if source and target are different protocols
          const sourceProtocol = sourceRadio.protocolType;
          const targetProtocol = radio.protocol;

          // ===== CHANNEL INDEX FORWARDING MODE =====
          if (this.forwardEncryptedByIndex) {
            // Forward to same channel index regardless of PSK
            console.log(`  📍 [INDEX MODE] Forwarding to ${targetRadioId} on channel ${channel} (PSK-agnostic)`);

            // Check if target radio has this channel index
            if (!radio.channels || !radio.channels.has(channel)) {
              console.warn(`⚠️  Target radio ${targetRadioId} doesn't have channel ${channel}, skipping`);
              return { radioId: targetRadioId, success: false, reason: 'channel_not_found' };
            }

            await radio.protocol.sendMessage(text, channel, { wantAck: false });
            console.log(`✅ Forwarded to ${targetRadioId} on channel ${channel} (index-based)`);
            return { radioId: targetRadioId, success: true, targetChannel: channel, mode: 'index' };
          }

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
            console.warn(`    OR enable "Forward Encrypted By Index" to forward channel ${channel}→${channel} regardless of PSK`);
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

      // Notify clients about successful forwarding for statistics
      if (successCount > 0) {
        this.broadcast({
          type: 'message-forwarded',
          count: successCount
        });
      }
    } catch (error) {
      console.error('❌ Error in forwardToOtherRadios:', error);
    }
  }

  /**
   * Forward node info announcement to other radios
   * NOTE: This is a placeholder - full implementation requires sending raw NODEINFO packets
   * which the current Meshtastic library doesn't easily support
   */
  async forwardNodeInfoToOtherRadios(sourceRadioId, packet) {
    try {
      console.log(`📡 [NODE INFO FORWARD] Would forward node announcement from ${packet.data?.shortName || packet.from}`);
      console.log(`   ⚠️  Note: Full node info forwarding requires low-level protocol access`);
      console.log(`   Current limitation: Meshtastic library doesn't expose sendNodeInfo() method`);
      console.log(`   Nodes on the other mesh will NOT see this announcement (feature incomplete)`);

      // TODO: Implement actual node info forwarding when library supports it
      // For now, this is logged but not forwarded
      // Future enhancement: Use raw protocol buffer messages to forward NODEINFO_APP packets
    } catch (error) {
      console.error('❌ Error in forwardNodeInfoToOtherRadios:', error);
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

      // Truncate text to fit within Meshtastic's byte limit
      const truncatedText = this.truncateForMeshtastic(text);

      console.log(`📤 Sending text via ${radioId} (${radio.protocolType}): "${truncatedText}" on channel ${channel}`);

      // Create a message record for the sent message IMMEDIATELY (before waiting for send to complete)
      const sentMessage = {
        id: `msg-sent-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date(), // Use Date object to match received messages
        radioId: radioId,
        protocol: radio.protocolType,
        from: radio.nodeInfo?.nodeId || radioId,
        to: 'broadcast',
        channel: channel,
        portnum: 1,
        text: truncatedText,
        sent: true, // Mark as sent (not received)
      };

      // Broadcast the sent message to all clients so it appears in message log immediately
      this.broadcast({
        type: 'message',
        message: sentMessage
      });

      // Send using the protocol handler (fire and forget - don't wait for completion)
      // The Meshtastic library's sendText may hang waiting for ACK even with wantAck:false
      radio.protocol.sendMessage(truncatedText, channel, { wantAck: false }).then(() => {
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
   * Reboot a radio device
   */
  async rebootRadio(ws, radioId) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      console.log(`🔄 Rebooting radio ${radioId} (${radio.protocolType})...`);

      // Reboot using protocol handler
      if (radio.protocol && typeof radio.protocol.rebootRadio === 'function') {
        await radio.protocol.rebootRadio();

        console.log(`✅ Reboot command sent to radio ${radioId}`);

        ws.send(JSON.stringify({
          type: 'reboot-success',
          radioId: radioId,
          message: 'Reboot command sent. Radio will restart shortly.'
        }));

        // Broadcast to all clients that radio is rebooting
        this.broadcast({
          type: 'radio-rebooting',
          radioId: radioId
        });

        // The radio will disconnect automatically after reboot
        // Client should attempt to reconnect after a few seconds

      } else {
        throw new Error('Reboot not supported for this radio type');
      }

    } catch (error) {
      console.error('❌ Reboot error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Reboot failed: ${error.message}`
      }));
    }
  }

  /**
   * Get channel configuration from a radio
   */
  async getChannel(ws, radioId, channelIndex) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      // First check if we already have this channel cached from initial connection
      // This avoids overwhelming the radio with repeated requests
      if (radio.channels && radio.channels.has(channelIndex)) {
        const cachedChannel = radio.channels.get(channelIndex);
        console.log(`📻 Returning cached channel ${channelIndex} for radio ${radioId}`);

        ws.send(JSON.stringify({
          type: 'get-channel-success',
          radioId: radioId,
          channelIndex: channelIndex,
          channel: cachedChannel,
          cached: true,
          message: 'Channel data from cache (loaded during initial connection).'
        }));
        return;
      }

      console.log(`📻 Requesting channel ${channelIndex} from radio ${radioId}...`);

      // Channel not cached, request from radio with rate limiting
      // Initialize rate limiter for this radio if not exists
      if (!radio.channelRequestLimiter) {
        radio.channelRequestLimiter = { queue: [], processing: false };
      }

      // Add request to queue
      radio.channelRequestLimiter.queue.push({ ws, channelIndex });

      // Process queue with delays to avoid overwhelming radio
      if (!radio.channelRequestLimiter.processing) {
        radio.channelRequestLimiter.processing = true;

        while (radio.channelRequestLimiter.queue.length > 0) {
          const request = radio.channelRequestLimiter.queue.shift();

          try {
            if (radio.protocol && typeof radio.protocol.getChannel === 'function') {
              await radio.protocol.getChannel(request.channelIndex);
              console.log(`✅ Channel ${request.channelIndex} request sent to radio ${radioId}`);

              request.ws.send(JSON.stringify({
                type: 'get-channel-success',
                radioId: radioId,
                channelIndex: request.channelIndex,
                message: 'Channel request sent. Response will arrive via channel-update event.'
              }));
            }
          } catch (err) {
            console.error(`❌ Failed to request channel ${request.channelIndex}:`, err);
            request.ws.send(JSON.stringify({
              type: 'error',
              error: `Get channel ${request.channelIndex} failed: ${err.message}`
            }));
          }

          // Wait 500ms between requests to avoid overwhelming radio
          if (radio.channelRequestLimiter.queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        radio.channelRequestLimiter.processing = false;
      }

    } catch (error) {
      console.error('❌ Get channel error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Get channel failed: ${error.message}`
      }));
    }
  }

  /**
   * Set channel configuration on a radio
   */
  async setChannel(ws, radioId, channelConfig) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      console.log(`📻 Setting channel configuration on radio ${radioId}...`);
      console.log(`📦 Channel config:`, JSON.stringify(channelConfig, null, 2));

      // Set channel using protocol handler
      if (radio.protocol && typeof radio.protocol.setChannel === 'function') {
        await radio.protocol.setChannel(channelConfig);

        console.log(`✅ Channel configuration sent to radio ${radioId}`);

        ws.send(JSON.stringify({
          type: 'set-channel-success',
          radioId: radioId,
          message: 'Channel configuration sent successfully.'
        }));

        // Broadcast to all clients that channel was updated
        this.broadcast({
          type: 'channel-configuration-updated',
          radioId: radioId
        });

      } else {
        throw new Error('Channel configuration not supported for this radio type');
      }

    } catch (error) {
      console.error('❌ Set channel error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Set channel failed: ${error.message}`
      }));
    }
  }

  /**
   * Get radio configuration
   */
  async getRadioConfig(ws, radioId, configType) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      console.log(`📻 Getting ${configType} configuration from radio ${radioId}...`);

      // Get config using protocol handler
      if (radio.protocol && typeof radio.protocol.getConfig === 'function') {
        await radio.protocol.getConfig(configType);

        console.log(`✅ Config request sent to radio ${radioId}`);

        ws.send(JSON.stringify({
          type: 'get-config-success',
          radioId: radioId,
          configType: configType,
          message: 'Configuration request sent. Response will arrive separately.'
        }));

      } else {
        throw new Error('Configuration retrieval not supported for this radio type');
      }

    } catch (error) {
      console.error('❌ Get config error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Get config failed: ${error.message}`
      }));
    }
  }

  /**
   * Set radio configuration
   */
  async setRadioConfig(ws, radioId, configType, config) {
    try {
      const radio = this.radios.get(radioId);
      if (!radio) {
        ws.send(JSON.stringify({
          type: 'error',
          error: `Radio ${radioId} not found`
        }));
        return;
      }

      console.log(`📻 Setting ${configType} configuration on radio ${radioId}...`);
      console.log(`📦 Config data:`, JSON.stringify(config, null, 2));

      // Set config using protocol handler
      if (radio.protocol && typeof radio.protocol.setConfig === 'function') {
        await radio.protocol.setConfig(configType, config);

        console.log(`✅ Configuration sent to radio ${radioId}`);

        ws.send(JSON.stringify({
          type: 'set-config-success',
          radioId: radioId,
          configType: configType,
          message: 'Configuration sent successfully.'
        }));

        // Broadcast to all clients that config was updated
        this.broadcast({
          type: 'radio-configuration-updated',
          radioId: radioId,
          configType: configType
        });

      } else {
        throw new Error('Configuration setting not supported for this radio type');
      }

    } catch (error) {
      console.error('❌ Set config error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Set config failed: ${error.message}`
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
        signal: AbortSignal.timeout(5000), // 5 second timeout
        agent: this.httpsAgent
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
      const response = await fetch(`${this.aiEndpoint}/api/tags`, {
        agent: this.httpsAgent
      });

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
      const response = await fetch(`${this.aiEndpoint}/api/tags`, {
        agent: this.httpsAgent
      });
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
        body: JSON.stringify({ name: model }),
        agent: this.httpsAgent
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
        signal: AbortSignal.timeout(5000),
        agent: this.httpsAgent
      });

      const running = response.ok;
      let version = null;

      if (running) {
        try {
          const versionResponse = await fetch(`${this.aiEndpoint}/api/version`, {
            agent: this.httpsAgent
          });
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
            avatarUrl: this.discordAvatarUrl,
            botEnabled: this.discordBotEnabled,
            botToken: this.discordBotToken ? '(configured)' : '', // Don't send full bot token
            channelId: this.discordChannelId,
            sendEmergency: this.discordSendEmergency
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

      // Save configuration to persist settings
      this.saveConfig();
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
      // Only update webhook if it's not the masked placeholder
      if (config.webhook && config.webhook !== '(configured)') {
        this.discordWebhook = config.webhook;
      }
      this.discordUsername = config.username || 'Meshtastic Bridge';
      this.discordAvatarUrl = config.avatarUrl || '';

      // Handle Discord bot configuration
      if (config.botEnabled !== undefined) this.discordBotEnabled = config.botEnabled;

      // Only update bot token if a new one is provided (not empty or placeholder)
      if (config.botToken && config.botToken !== '(configured)' && config.botToken.trim() !== '') {
        console.log(`🔑 Updating Discord bot token (${config.botToken.substring(0, 10)}...)`);
        this.discordBotToken = config.botToken;
      } else if (config.botToken === '') {
        console.log(`🔑 Empty bot token received, keeping existing token (${this.discordBotToken ? 'SET' : 'NOT SET'})`);
      }

      if (config.channelId !== undefined && config.channelId !== '') {
        console.log(`📺 Updating Discord channel ID: ${config.channelId}`);
        this.discordChannelId = config.channelId;
      }

      if (config.sendEmergency !== undefined) this.discordSendEmergency = config.sendEmergency;

      // Connect or disconnect bot based on settings
      console.log(`🤖 Discord bot config check: enabled=${this.discordBotEnabled}, hasToken=${!!this.discordBotToken}, hasChannelId=${!!this.discordChannelId}`);

      if (this.discordBotEnabled && this.discordBotToken && this.discordChannelId) {
        await this.connectDiscordBot();
      } else if (this.discordClient) {
        this.disconnectDiscordBot();
      }

      // Broadcast updated config to all clients
      this.broadcast({
        type: 'comm-config-changed',
        config: {
          discord: {
            enabled: this.discordEnabled,
            webhook: this.discordWebhook ? '(configured)' : '',
            username: this.discordUsername,
            avatarUrl: this.discordAvatarUrl,
            botEnabled: this.discordBotEnabled,
            botToken: this.discordBotToken ? '(configured)' : '',
            channelId: this.discordChannelId,
            sendEmergency: this.discordSendEmergency
          }
        }
      });

      ws.send(JSON.stringify({
        type: 'comm-discord-updated',
        success: true
      }));

      console.log(`💬 Discord configuration updated: ${this.discordEnabled ? 'enabled' : 'disabled'}`);

      // Save configuration to persist settings
      this.saveConfig();
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
        }),
        agent: this.httpsAgent
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

      // Save configuration to persist settings
      this.saveConfig();

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

      // Save configuration to persist settings
      this.saveConfig();

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
   * Get advertisement bot configuration
   */
  async adBotGetConfig(ws) {
    ws.send(JSON.stringify({
      type: 'adbot-config',
      config: {
        enabled: this.adBotEnabled,
        interval: this.adBotInterval,
        messages: this.adBotMessages,
        targetRadios: this.adBotTargetRadios,
        channel: this.adBotChannel
      }
    }));
  }

  /**
   * Set advertisement bot configuration
   */
  async adBotSetConfig(ws, config) {
    try {
      // Stop existing timer if running
      this.stopAdvertisementBot();

      // Update configuration
      if (config.enabled !== undefined) this.adBotEnabled = config.enabled;
      if (config.interval !== undefined) this.adBotInterval = config.interval;
      if (Array.isArray(config.messages)) this.adBotMessages = config.messages;
      if (Array.isArray(config.targetRadios)) this.adBotTargetRadios = config.targetRadios;
      if (config.channel !== undefined) this.adBotChannel = config.channel;

      console.log(`✅ Advertisement bot configuration updated (enabled: ${this.adBotEnabled})`);

      // Send confirmation
      ws.send(JSON.stringify({
        type: 'adbot-config-updated',
        success: true
      }));

      // Broadcast updated config to all clients
      this.broadcast({
        type: 'adbot-config-changed',
        config: {
          enabled: this.adBotEnabled,
          interval: this.adBotInterval,
          messages: this.adBotMessages,
          targetRadios: this.adBotTargetRadios,
          channel: this.adBotChannel
        }
      });

      // Restart bot if enabled
      if (this.adBotEnabled) {
        this.setupAdvertisementBot();
      }

      // Save configuration to persist settings
      this.saveConfig();

    } catch (error) {
      console.error('❌ Failed to update advertisement bot config:', error);
      ws.send(JSON.stringify({
        type: 'adbot-config-updated',
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Test advertisement bot by sending an immediate advertisement
   */
  async adBotTest(ws) {
    try {
      if (this.adBotMessages.length === 0) {
        ws.send(JSON.stringify({
          type: 'adbot-test-result',
          success: false,
          error: 'No advertisement messages configured'
        }));
        return;
      }

      // Send an advertisement immediately
      await this.sendAdvertisement();

      ws.send(JSON.stringify({
        type: 'adbot-test-result',
        success: true
      }));
    } catch (error) {
      console.error('❌ Advertisement bot test failed:', error);
      ws.send(JSON.stringify({
        type: 'adbot-test-result',
        success: false,
        error: error.message
      }));
    }
  }

  /**
   * Connect to Discord bot
   */
  async connectDiscordBot() {
    try {
      // Validate bot token before attempting connection
      if (!this.discordBotToken || this.discordBotToken.trim() === '') {
        console.error('❌ Cannot connect Discord bot: Bot token is not set');
        this.discordClient = null;
        return;
      }

      if (!this.discordChannelId || this.discordChannelId.trim() === '') {
        console.error('❌ Cannot connect Discord bot: Channel ID is not set');
        this.discordClient = null;
        return;
      }

      console.log('🤖 Connecting to Discord bot...');
      console.log(`🤖 Using channel ID: ${this.discordChannelId}`);

      // Disconnect existing client if any
      if (this.discordClient) {
        await this.disconnectDiscordBot();
      }

      // Create Discord client with required intents
      this.discordClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ]
      });

      // Handle clientReady event (renamed from 'ready' in Discord.js v14+)
      this.discordClient.once('clientReady', () => {
        console.log(`✅ Discord bot connected as ${this.discordClient.user.tag}`);
      });

      // Handle message events
      this.discordClient.on('messageCreate', async (message) => {
        // Ignore bot's own messages
        if (message.author.bot) return;

        // Only listen to the configured channel
        if (message.channelId !== this.discordChannelId) return;

        console.log(`📩 Discord message from ${message.author.username}: ${message.content}`);

        // Forward message to mesh network on channel 0
        try {
          const radios = Array.from(this.radios.values());
          if (radios.length === 0) {
            await message.reply('⚠️ No radios connected to bridge');
            return;
          }

          // Send to first radio (or all radios if you want broadcast)
          const radio = radios[0];
          await this.sendMessage(null, radio.port, 0, message.content);

          // React to message to show it was sent
          await message.react('✅');
        } catch (error) {
          console.error('❌ Error forwarding Discord message to mesh:', error);
          await message.react('❌');
        }
      });

      // Handle errors
      this.discordClient.on('error', (error) => {
        console.error('❌ Discord bot error:', error);
      });

      // Login to Discord
      console.log('🤖 Logging in to Discord...');
      await this.discordClient.login(this.discordBotToken);

    } catch (error) {
      console.error('❌ Failed to connect Discord bot:', error);

      // Provide helpful error message for common issues
      if (error.message && error.message.includes('disallowed intents')) {
        console.error(`\n⚠️  DISCORD BOT SETUP REQUIRED:`);
        console.error(`   Go to https://discord.com/developers/applications`);
        console.error(`   Select your bot → Bot → Privileged Gateway Intents`);
        console.error(`   Enable: ✅ Message Content Intent`);
        console.error(`   Enable: ✅ Server Members Intent (optional)`);
        console.error(`   Save changes and try again\n`);
      } else if (error.message && error.message.includes('TOKEN_INVALID')) {
        console.error(`\n⚠️  Invalid bot token. Get a new token from Discord Developer Portal\n`);
      }

      this.discordClient = null;
    }
  }

  /**
   * Disconnect Discord bot
   */
  async disconnectDiscordBot() {
    if (this.discordClient) {
      console.log('🤖 Disconnecting Discord bot...');
      this.discordClient.destroy();
      this.discordClient = null;
      console.log('✅ Discord bot disconnected');
    }
  }

  /**
   * Send message to Discord via webhook
   */
  async sendToDiscord(text, title = '📡 Meshtastic Bridge') {
    if (!this.discordWebhook) {
      return false;
    }

    try {
      const response = await fetch(this.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.discordUsername,
          avatar_url: this.discordAvatarUrl || undefined,
          content: text
        }),
        agent: this.httpsAgent
      });

      if (response.ok) {
        console.log(`💬 Discord webhook message sent`);
        return true;
      } else {
        console.error(`Discord webhook API error: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending Discord webhook message:', error);
      return false;
    }
  }

  /**
   * Send message to Discord via bot
   */
  async sendDiscordBotMessage(text, author = 'Mesh Network') {
    if (!this.discordClient || !this.discordChannelId) {
      return false;
    }

    try {
      const channel = await this.discordClient.channels.fetch(this.discordChannelId);
      if (channel && channel.isTextBased()) {
        await channel.send(`**${author}**: ${text}`);
        return true;
      }
    } catch (error) {
      // Provide helpful error messages for common issues
      if (error.code === 50001) {
        console.error(`\n❌ Discord Bot Error: Missing Access (Code 50001)`);
        console.error(`   Channel ID: ${this.discordChannelId}`);
        console.error(`\n⚠️  DISCORD BOT ACCESS REQUIRED:`);
        console.error(`   1. Make sure bot is invited to your Discord server:`);
        console.error(`      https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=68608&scope=bot`);
        console.error(`   2. In Discord server settings → Roles:`);
        console.error(`      Give your bot role these permissions:`);
        console.error(`      ✅ View Channels`);
        console.error(`      ✅ Send Messages`);
        console.error(`      ✅ Read Message History`);
        console.error(`   3. In the specific channel settings:`);
        console.error(`      Make sure bot has access to channel #${this.discordChannelId}\n`);
      } else if (error.code === 10003) {
        console.error(`\n❌ Discord Bot Error: Unknown Channel (Code 10003)`);
        console.error(`   Channel ID ${this.discordChannelId} doesn't exist or bot can't see it`);
        console.error(`   Double-check the channel ID is correct\n`);
      } else {
        console.error('❌ Error sending Discord bot message:', error);
      }
    }
    return false;
  }

  /**
   * Setup advertisement bot interval
   */
  setupAdvertisementBot() {
    // Clear any existing timer
    if (this.adBotTimer) {
      clearInterval(this.adBotTimer);
      this.adBotTimer = null;
    }

    if (!this.adBotEnabled || this.adBotMessages.length === 0) {
      console.log('⚠️  Advertisement bot enabled but no messages configured');
      return;
    }

    console.log(`📢 Advertisement bot starting with ${this.adBotMessages.length} message(s), interval: ${this.adBotInterval / 1000}s`);

    // Send first advertisement immediately
    setTimeout(() => this.sendAdvertisement(), 5000); // Wait 5 seconds after startup

    // Setup recurring advertisements
    this.adBotTimer = setInterval(() => {
      this.sendAdvertisement();
    }, this.adBotInterval);
  }

  /**
   * Send advertisement message
   */
  async sendAdvertisement() {
    if (!this.adBotEnabled || this.adBotMessages.length === 0) {
      return;
    }

    // Determine which radios to target
    const targetRadios = this.adBotTargetRadios.length > 0
      ? this.adBotTargetRadios
      : Array.from(this.radios.keys());

    if (targetRadios.length === 0) {
      console.log('⚠️  No radios available for advertisement');
      return;
    }

    // Get the next message to send (rotate through messages)
    const message = this.adBotMessages[this.adBotMessageIndex];
    this.adBotMessageIndex = (this.adBotMessageIndex + 1) % this.adBotMessages.length;

    console.log(`📢 Sending advertisement: "${message}"`);

    // Send from each target radio
    for (const radioId of targetRadios) {
      const radio = this.radios.get(radioId);
      if (!radio || radio.status !== 'connected') {
        continue;
      }

      try {
        // Use the sendText method to send the advertisement
        await this.sendText(null, radioId, message, this.adBotChannel);
        console.log(`✅ Advertisement sent from radio ${radioId} on channel ${this.adBotChannel}`);

        // Track last send time
        this.adBotLastSent.set(radioId, Date.now());
      } catch (error) {
        console.error(`❌ Failed to send advertisement from radio ${radioId}:`, error);
      }
    }
  }

  /**
   * Stop advertisement bot
   */
  stopAdvertisementBot() {
    if (this.adBotTimer) {
      clearInterval(this.adBotTimer);
      this.adBotTimer = null;
      console.log('📢 Advertisement bot stopped');
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

    // Stop advertisement bot
    this.stopAdvertisementBot();

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
