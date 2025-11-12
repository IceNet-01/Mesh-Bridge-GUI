# Meshtastic Bridge GUI

A modern **web-based** interface for managing Meshtastic radio bridge relay stations. Built with React, TypeScript, and Node.js with official Meshtastic libraries.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-2.0.0--alpha-orange.svg)
![Type](https://img.shields.io/badge/type-Web%20App-blue.svg)

## Version 2.0 - Alpha Release! 🚀

**NEW Architecture:**
- 🌐 **Web-Based GUI** - accessible from any modern browser
- ⚡ **Node.js Bridge Server** - using official @meshtastic/core library
- 🔌 **WebSocket Communication** - real-time updates between frontend and bridge
- 📱 **PWA Support** - installable as a progressive web app
- 🔄 **Auto Message Forwarding** - intelligent channel-aware bridging
- ✨ **Smart Channel Matching** - handles different channel configurations across radios
- 🛠️ **System Service Support** - runs as permanent service with auto-start on boot

## Features

🎯 **Core Functionality**
- 📡 Support for 2+ Meshtastic radios with automatic bridging
- 🔄 **Automatic bidirectional message forwarding** (no manual route configuration needed)
- 🔐 **Smart channel matching** - forwards messages based on PSK+name, not just index
- 🛡️ Message deduplication and loop prevention
- 🔌 Auto-detect USB-connected devices
- ⚡ Real-time message forwarding

📊 **Monitoring & Analytics**
- Real-time dashboard with live statistics
- Message traffic monitoring
- Per-radio message counters (received, forwarded)
- Connection status indicators
- Message history with filtering

⚙️ **Advanced Channel Handling**
- **Cross-index forwarding** - handles radios with channels on different indices
- **Private channel support** - forwards encrypted channels if configured on both bridge radios
- **Multi-mesh bridging** - can bridge between different encrypted meshes
- **Automatic PSK matching** - finds matching channels by encryption key and name

🤖 **Interactive Command System**
- **Bridge commands** - send commands like `#weather Seattle` or `#ping` from your radio
- **13 built-in commands** - weather, status, uptime, radios, channels, stats, ai, and more
- **Rate limiting** - prevents command spam (max 10/min per user)
- **No phone needed** - get info directly on radio screen
- **Fully configurable** - enable/disable commands, change prefix, customize

🧠 **AI Assistant** (NEW in 2.0)
- **Local AI queries** - ask questions via `#ai [question]` or `#ask [question]` from your radio
- **Powered by Ollama** - runs locally on your hardware (Raspberry Pi 4+ supported)
- **Mesh-optimized** - responses automatically shortened to fit Meshtastic message limits (~200 chars)
- **Multiple models** - choose from ultra-fast 1B models to more capable 3B models
- **Model management UI** - install, switch, and configure models directly from web interface
- **Rate limited** - max 3 AI queries per minute per user to conserve resources
- **No cloud required** - completely local, private, and works offline

🎨 **Modern UI**
- Clean, dark-themed interface
- Responsive design with Tailwind CSS
- Real-time updates via WebSocket
- Intuitive navigation

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** (required for bridge server)
- **Modern Browser**: Chrome, Firefox, Edge, Safari
- **Meshtastic Devices**: 2+ radios connected via USB
- **Git**: For cloning the repository

### Installation (Development Mode)

```bash
# Clone the repository
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI

# Install dependencies
npm install

# Start the application (both bridge server and web UI)
npm run start
```

**Development mode** starts two servers:
- **Bridge Server**: http://localhost:8080 (WebSocket)
- **Web UI (Vite)**: http://localhost:5173 (with hot-reload)

Open your browser to **http://localhost:5173**

### Run as System Service (Linux)

Install as a permanent service that starts on boot:

```bash
# Install and enable the service (requires sudo)
sudo npm run service:install

# Start the service
npm run service:start

# Access at http://localhost:8080
```

**Service Management:**
```bash
npm run service:start      # Start service
npm run service:stop       # Stop service
npm run service:restart    # Restart service
npm run service:status     # Check status
npm run service:logs       # View logs
```

Benefits:
- ✅ Starts automatically on system boot
- ✅ Auto-restarts if it crashes
- ✅ Radio connections persist even when browser is closed
- ✅ Single port (8080) for both WebSocket and web UI
- ✅ Automatic port cleanup on startup

### Production Build (Manual)

```bash
# Build the frontend
npm run build

# Run in production mode (serves both on port 8080)
npm run production
```

## How It Works

### Architecture

**Development Mode** (two servers):
```
┌─────────────────┐
│   Web Browser   │ ← You interact here
│  (localhost:5173)│    (Vite dev server with hot-reload)
└────────┬────────┘
         │ WebSocket
         │
┌────────▼────────┐
│  Bridge Server  │ ← Node.js WebSocket server
│ (localhost:8080)│
└────────┬────────┘
         │ Serial (USB)
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼───┐
│Radio1│  │Radio2│ ← Meshtastic devices
└──────┘  └──────┘
```

**Production Mode / Service** (single server):
```
┌─────────────────┐
│   Web Browser   │ ← You interact here
│  (localhost:8080)│
└────────┬────────┘
         │ HTTP + WebSocket
         │ (same port!)
┌────────▼────────┐
│  Bridge Server  │ ← Serves static files + WebSocket
│ (localhost:8080)│
└────────┬────────┘
         │ Serial (USB)
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼───┐
│Radio1│  │Radio2│ ← Meshtastic devices
└──────┘  └──────┘
```

### Message Forwarding

**Automatic Forwarding** (default behavior):
1. Message received on Radio 1, channel X
2. Bridge decrypts using channel X's PSK
3. Bridge searches Radio 2 for matching channel (same name + PSK)
4. If found, forwards to that channel (even if different index!)
5. Radio 2 re-encrypts and transmits

**Example Scenario:**
- Radio 1: Channel 0 = "LongFast" (AQ==), Channel 3 = "Private" (256-bit)
- Radio 2: Channel 3 = "LongFast" (AQ==), Channel 0 = "Private" (256-bit)
- Message on Radio 1 ch0 → Auto-forwards to Radio 2 ch3 ✅
- Message on Radio 1 ch3 → Auto-forwards to Radio 2 ch0 ✅

### Bridge Commands

The bridge includes an **interactive command system** that responds to messages with a special prefix (default: `#`). Instead of forwarding command messages, the bridge processes them and sends back a response.

**Available Commands:**
- `#ping` - Check if bridge is alive (responds with "Pong!")
- `#help` - List all available commands
- `#status` - Show bridge status (connected radios, uptime, message count)
- `#time` - Get current date and time
- `#uptime` - Show how long the bridge has been running
- `#version` - Show bridge software version and platform info
- `#weather [city]` - Get weather report for a location (default: Seattle)
- `#radios` - List all connected radios with node IDs
- `#channels` - List configured channels on the bridge
- `#stats` - View message statistics (total messages, nodes, per-radio counts)
- `#nodes` - List recently seen nodes on the mesh
- `#ai [question]` or `#ask [question]` - Query local AI assistant (requires Ollama, see AI Assistant section)

**Example Usage:**
```
You send:  #weather Portland
Bridge responds: 🌤️ Portland: Partly cloudy, 58°F, 💧75%, 💨10mph

You send: #status
Bridge responds: 📊 Bridge Status:
                 Radios: 2 connected
                 Messages: 342 in history
                 Uptime: 5h 23m
                 Version: 2.0.0-alpha

You send: #ping
Bridge responds: 🏓 Pong! Bridge is alive and running.

You send: #ai What is the capital of France?
Bridge responds: 🤖 Paris is the capital of France, located in the north-central part of the country.
```

**Features:**
- ✅ Commands are NOT forwarded (consumed by bridge)
- ✅ Rate limiting (max 10 commands/minute per user, max 3 AI queries/minute)
- ✅ Works on any channel
- ✅ No internet connection required (except for weather and AI)
- ✅ Responses visible on radio screen without phone

**Configuration:**
Commands can be enabled/disabled in `bridge-server/index.mjs`:
```javascript
this.commandsEnabled = true;         // Enable/disable all commands
this.commandPrefix = '#';            // Change prefix (e.g., '!' for !ping)
this.commandRateLimit = 10;          // Max commands per minute
this.enabledCommands = [             // Remove unwanted commands
  'ping', 'help', 'status', 'time',
  'uptime', 'version', 'weather',
  'radios', 'channels', 'stats', 'nodes'
];
```

## Usage

### 1. Connect Your Radios

**Development Mode:**
1. Launch the application (`npm run start`)
2. Open browser to http://localhost:5173
3. Click **"Scan for Radios"** or **"Connect Radio"**
4. Select each Meshtastic device from the list
5. Radios will appear in the sidebar instantly

**Production Mode / Service:**
1. Start the service (`npm run service:start` or `npm run production`)
2. Open browser to http://localhost:8080
3. Click **"Scan for Radios"** or **"Connect Radio"**
4. Select each Meshtastic device from the list
5. Radios will appear in the sidebar instantly

### 2. Message Forwarding

**Messages are automatically forwarded!** No manual configuration needed.

The bridge:
- ✅ Receives messages on any connected radio
- ✅ Searches other radios for matching channels (PSK + name)
- ✅ Forwards to all radios with matching channel configuration
- ✅ Prevents loops (won't forward messages it sent)
- ✅ Deduplicates messages (both radios often receive same broadcast)

### 3. Forwarding Private Channels

To bridge/repeat encrypted private channels:

1. **Configure the private channel on BOTH bridge radios**
   - Both must have same channel name
   - Both must have same PSK (encryption key)
   - Channel index can be different!

2. **Example Setup:**
   ```
   Bridge Radio A:
   - Channel 0: "skynet" (256-bit PSK xyz...)

   Bridge Radio B:
   - Channel 3: "skynet" (256-bit PSK xyz...)
   ```

3. **Result:** Messages on "skynet" channel will be forwarded between both radios, maintaining encryption!

### 4. Monitoring

- **Dashboard**: Overview of connected radios and recent messages
- **Messages**: Live feed of all messages passing through the bridge
- **Radios**: Detailed status of each connected radio
- **Logs**: System logs for troubleshooting

### 5. AI Assistant Setup

The AI Assistant allows users to query a local AI model via Meshtastic messages.

#### Prerequisites

1. **Install Ollama** (https://ollama.ai)
   ```bash
   # Linux/macOS
   curl -fsSL https://ollama.ai/install.sh | sh

   # Or download from https://ollama.ai
   ```

2. **Start Ollama**
   ```bash
   ollama serve
   ```

#### Using the AI Assistant

1. **Open Web UI** → Navigate to **"AI Assistant"** tab

2. **Check Ollama Status**
   - Green indicator = Ollama is running and ready
   - Red indicator = Ollama not running (start it with `ollama serve`)

3. **Install a Model**
   - Click **"Install"** on a recommended model (e.g., `llama3.2:1b`)
   - Wait for download to complete (600MB-2GB depending on model)
   - First download may take several minutes

4. **Enable AI Assistant**
   - Toggle **"Enable AI Assistant"** switch to ON
   - Select your installed model from the dropdown

5. **Send Queries from Radio**
   - From any Meshtastic radio: `#ai What is the weather?`
   - Or use: `#ask How far is the moon?`
   - Response appears on your radio screen (~2-10 seconds)

#### Recommended Models

Choose based on your hardware:

| Model | Size | Hardware | Response Time | Quality |
|-------|------|----------|---------------|---------|
| `llama3.2:1b` | 700MB | Pi 4+ (4GB RAM) | 2-4s | Good |
| `phi3:mini` | 2.2GB | Pi 5 (8GB RAM) | 4-6s | Excellent |
| `llama3.2:3b` | 2GB | Desktop/Pi 5 (8GB+) | 6-10s | Very Good |
| `tinyllama:latest` | 637MB | Pi 4+ (2GB RAM) | 1-2s | Basic |

#### AI Features

- **Automatic Response Shortening**: Responses are truncated to ~200 characters to fit Meshtastic message limits
- **Rate Limiting**: Max 3 AI queries per minute per user (prevents abuse)
- **Timeout**: 15-second timeout for slow responses
- **System Prompt**: Pre-configured to give concise, mesh-friendly responses
- **Privacy**: Completely local - no data sent to cloud services

#### Troubleshooting

**"AI offline. Is Ollama running?"**
- Start Ollama: `ollama serve`
- Check it's running: `curl http://localhost:11434/api/version`

**"AI timeout. Try a simpler question."**
- Question took too long to process (>15s)
- Try a shorter, simpler question
- Consider using a faster model

**Model download stuck:**
- Check internet connection
- Cancel and retry
- Check Ollama logs: `ollama logs`

## Configuration

### Bridge Server Settings

Edit `bridge-server/index.mjs` (lines 47-48):

```javascript
// Smart channel matching (recommended)
this.enableSmartMatching = true;  // Auto-find matching channels by PSK+name

// Manual channel mapping (for testing)
this.channelMap = null;  // e.g., {0: 3} to force ch0→ch3 forwarding
```

**Recommended:** Keep `enableSmartMatching = true` for proper channel handling.

## Recent Improvements (Alpha)

⚠️ **This is an ALPHA release** - expect bugs!

**Recently Fixed:**
- ✅ Radio connection now shows instant feedback (connecting → connected status)
- ✅ Radio metrics display correctly with all required fields
- ✅ Message deduplication working in both backend and UI
- ✅ Removed redundant "Build Routes" page (automatic forwarding explained clearly)
- ✅ Added systemd service support for production deployment

**Known Limitations:**
- Radio configuration takes 10-30 seconds (this is normal - device.configure() is slow)
- Limited to serial/USB connected radios (no network/BLE radios yet)
- Service installation currently Linux-only (Windows/macOS service support coming)

See [Issues](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues) for status and bug reports.

## Development

### Project Structure

```
Mesh-Bridge-GUI/
├── bridge-server/
│   └── index.mjs              # Node.js bridge (HTTP + WebSocket + Serial)
├── scripts/
│   ├── install-service.sh     # Service installation script
│   ├── uninstall-service.sh   # Service removal script
│   └── cleanup-ports.sh       # Port cleanup utility
├── src/
│   └── renderer/
│       ├── components/        # React UI components
│       ├── lib/               # WebSocket manager, utilities
│       ├── store/             # Zustand state management
│       ├── App.tsx            # Main app component
│       └── types.ts           # TypeScript types
├── dist/                      # Built frontend (after npm run build)
├── meshtastic-bridge.service  # Systemd service template
├── package.json
└── vite.config.ts
```

### Available Scripts

```bash
# Development
npm run start           # Start bridge + dev server (localhost:5173)
npm run dev             # Run web UI dev server only
npm run bridge          # Run bridge server only

# Building & Production
npm run build           # Build production frontend
npm run production      # Build + run in production mode (localhost:8080)
npm run preview         # Preview production build (Vite)

# Service Management (Linux)
npm run service:install     # Install systemd service (requires sudo)
npm run service:uninstall   # Remove systemd service (requires sudo)
npm run service:start       # Start the service
npm run service:stop        # Stop the service
npm run service:restart     # Restart the service
npm run service:status      # Check service status
npm run service:logs        # View live service logs
npm run service:enable      # Enable auto-start on boot
npm run service:disable     # Disable auto-start

# Utilities
npm run cleanup-ports   # Kill processes using port 8080
```

### Tech Stack

- **Backend**: Node.js with @meshtastic/core + @meshtastic/transport-node-serial
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **State Management**: Zustand
- **Build Tool**: Vite
- **Communication**: WebSocket (ws library)

## Troubleshooting

### Radios Won't Connect

1. **Check USB connection** - Ensure radios are plugged in and powered
2. **Serial port conflicts** - Close Meshtastic app, other bridges, or serial monitors
3. **Permission issues (Linux)** - Add user to dialout group:
   ```bash
   sudo usermod -a -G dialout $USER
   # Log out and back in for changes to take effect
   ```
4. **Port cleanup** - Kill stale processes: `npm run cleanup-ports`
5. **Check logs** - Look for errors in bridge server console or `npm run service:logs`
6. **Restart** - Try restarting the bridge: `npm run service:restart` or Ctrl+C and restart

### Messages Not Forwarding

1. **Check channel configurations**:
   - Both radios must have the channel configured with matching PSK+name
   - Channel index can differ, but PSK and name must match exactly
   - Look for channel config logs when radios connect

2. **Check logs for**:
   - `⚠️ No matching channel` warnings
   - PSK mismatch messages
   - `🔁 Message from our own bridge radio` (expected - prevents loops)
   - `✅ Forwarded broadcast to...` success messages

3. **Verify smart matching is enabled**:
   - Check `bridge-server/index.mjs` line 47
   - Should be: `this.enableSmartMatching = true`

### Port 8080 Already in Use

If port 8080 is occupied:
```bash
# Clean up stale processes
npm run cleanup-ports

# Or manually find and kill:
lsof -ti:8080 | xargs kill -9
```

### Service Won't Start (Linux)

```bash
# Check service status
npm run service:status

# View detailed logs
npm run service:logs

# Ensure service is installed
sudo npm run service:install

# Try restarting
npm run service:restart
```

### Radio Takes Long to Appear

This is normal! The `device.configure()` call takes 10-30 seconds. You'll see:
1. "Radio connecting" status appears instantly
2. Channel configuration logs appear as they're received
3. "Radio connected" status after configuration completes
4. Watch bridge console for progress

## Comparison with Headless Version

| Feature | GUI Version (2.0 Alpha) | Headless Version |
|---------|-------------------------|------------------|
| Visual Interface | ✅ Modern web UI | ❌ Command-line only |
| Multiple Radios | ✅ 2+ radios | ✅ 2 radios |
| Auto Forwarding | ✅ Automatic | ✅ Automatic |
| Smart Channel Matching | ✅ Yes (PSK+name) | ❌ Index-based only |
| Private Channel Support | ✅ Yes | ⚠️ Limited |
| Real-time Monitoring | ✅ Dashboard | ⚠️ Logs only |
| Configuration | ✅ Visual + code | ⚠️ Code only |
| Cross-platform | ✅ Win/Mac/Linux | ✅ Linux (primary) |
| Resource Usage | ~150-250 MB RAM | ~50-100 MB RAM |
| Boot Persistence | ✅ Systemd service (Linux) | ✅ Systemd service |
| Auto-restart on Crash | ✅ Yes (when using service) | ✅ Yes |
| Port Cleanup | ✅ Automatic | ⚠️ Manual |
| Maturity | ⚠️ Alpha | ✅ Stable |
| Use Case | Desktop/Server/Testing | Production/Server |

## Contributing

Contributions welcome! This is an alpha release and needs help with:

- 🐛 Bug fixes (especially UI issues)
- ✨ Feature improvements
- 📝 Documentation
- 🧪 Testing on different platforms

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [@meshtastic/core](https://github.com/meshtastic/web) official libraries
- Inspired by [meshtastic-bridge-headless](https://github.com/IceNet-01/meshtastic-bridge-headless)
- Thanks to the amazing Meshtastic community

## Support

- 🐛 [Report Bug](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues)
- 💡 [Request Feature](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues)
- 💬 [Discussions](https://github.com/IceNet-01/Mesh-Bridge-GUI/discussions)

---

**⚠️ ALPHA SOFTWARE** - This is actively developed alpha software. While core functionality works well, expect bugs and occasional breaking changes.

**Production Readiness:**
- ✅ Core bridging functionality is stable
- ✅ Smart channel matching works reliably
- ✅ Message deduplication is solid
- ✅ Service installation for permanent deployment
- ⚠️ UI/UX may have minor issues
- ⚠️ Limited testing on all platforms

**Recommended for:**
- Testing and development
- Home/personal mesh networks
- Learning about Meshtastic bridging
- Linux servers with systemd

**Use with caution for:**
- Critical infrastructure
- High-reliability requirements
- Production deployments without testing

Made with ❤️ for the Meshtastic community
