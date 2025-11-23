# Mesh Bridge - Meshtastic Relay Station

A powerful **web-based communication gateway** for Meshtastic radios. Features message bridging (2+ radios), AI assistant, email/Discord notifications, interactive commands, and real-time monitoring. Built with React, TypeScript, and Node.js with official Meshtastic libraries.

**Meshtastic-Only Version** - Focused exclusively on Meshtastic protocol support for optimal performance and reliability.

**Works great with just ONE radio!** While designed for bridging multiple radios, the AI assistant, email/Discord notifications, and command system make it incredibly useful even with a single device.

![License](https://img.shields.io/badge/license-Dual%20(Non--Commercial%2FCommercial)-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-Alpha%2025.11.2-orange.svg)
![Type](https://img.shields.io/badge/type-Web%20App-blue.svg)

## Screenshots

> **Note:** Add your own screenshots to showcase the application! Suggested screenshots to include:

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)
*Real-time monitoring of connected radios, message traffic, and system statistics*

### Message Monitor
![Messages](docs/screenshots/messages.png)
*Live feed of all mesh messages with timestamps and signal quality*

### Network Health
![Network Health](docs/screenshots/network-health.png)
*Channel utilization, signal quality analysis, and network insights*

### Emergency Response & Weather Alerts
![Emergency Response](docs/screenshots/emergency.png)
*SOS tracking, auto-response, and severe weather monitoring from NWS*

### Interactive Map
![Map View](docs/screenshots/map.png)
*Visualize node locations and mesh network topology*

### AI Assistant Configuration
![AI Settings](docs/screenshots/ai-settings.png)
*Configure local AI models with Ollama integration*

### TAK Tactical View
![Tactical View](docs/screenshots/tactical.png)
*Team Awareness Kit style tactical display with breadcrumb trails*

---

## Version Alpha 25.11.2 🚀

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
- 📡 Support for **1+ Meshtastic radios** (single radio gets AI, commands, notifications!)
- 🔄 **Automatic bidirectional message forwarding** (2+ radios only, no manual route configuration needed)
- 🔐 **Smart channel matching** - forwards messages based on PSK+name, not just index
- 🛡️ Message deduplication and loop prevention
- 🔌 Auto-detect USB-connected devices
- ⚡ Real-time message forwarding and monitoring

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
- **16 built-in commands** - weather, status, uptime, radios, channels, stats, ai, email, discord, and more
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

📧 **Communication Notifications** (NEW in 2.0)
- **Email notifications** - send emails from your radio via `#email [message]`
- **Discord integration** - post to Discord channels via `#discord [message]`
- **Multi-channel notify** - send to both with `#notify [message]`
- **SMTP support** - works with Gmail, Outlook, custom mail servers
- **Discord webhooks** - easy setup with webhook URLs
- **Web UI configuration** - configure and test from the interface
- **Perfect for alerts** - notify yourself from remote locations

🚨 **Emergency Response System** (NEW in 2.0)
- **SOS emergency tracking** - auto-detects emergency keywords (#sos, #emergency, #help, #911, mayday, etc.)
- **Auto-response** - automatically sends help instructions and requests GPS location
- **Status tracking** - manage emergencies through active, responding, and resolved states
- **Critical info display** - shows GPS coordinates, battery level, signal strength (SNR)
- **Emergency broadcasting** - broadcast emergencies to all nodes on the mesh
- **Google Maps integration** - view emergency locations directly in maps
- **NWS weather alerts** - fetch and auto-broadcast severe weather warnings from National Weather Service
- **Weather monitoring** - monitor by state or GPS coordinates with configurable intervals
- **Severity-based alerts** - color-coded alerts (Extreme, Severe, Moderate, Minor)
- **Audio alerts** - plays sound when new emergencies or severe weather detected
- **Safety protocols** - built-in emergency response documentation and procedures

🎨 **Modern UI**
- Clean, dark-themed interface
- Responsive design with Tailwind CSS
- Real-time updates via WebSocket
- Intuitive navigation

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** (required for bridge server)
- **Modern Browser**: Chrome, Firefox, Edge, Safari
- **Meshtastic Device(s)**: 1+ radio connected via USB (2+ for message bridging)
- **Git**: For cloning the repository
- **Ollama** (optional): For AI assistant features
- **SMTP Account** (optional): For email notifications
- **Discord Webhook** (optional): For Discord notifications

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
# Build the application first
npm run build

# Install and enable the service (requires sudo)
sudo ./install-service.sh
```

The installation script will:
- ✅ Create systemd service file
- ✅ Enable auto-start on boot
- ✅ Start the service immediately
- ✅ Display service status and logs

**Access the Interface:**
- **Locally**: http://localhost:8080
- **On LAN**: http://YOUR_LOCAL_IP:8080 (shown during startup)
- **Example**: http://192.168.1.100:8080

The server automatically binds to `0.0.0.0`, making it accessible from any device on your local network!

**Service Management:**
```bash
sudo systemctl start mesh-bridge      # Start service
sudo systemctl stop mesh-bridge       # Stop service
sudo systemctl restart mesh-bridge    # Restart service
sudo systemctl status mesh-bridge     # Check status
sudo journalctl -u mesh-bridge -f     # View live logs
```

**Uninstall Service:**
```bash
sudo ./uninstall-service.sh
```

Benefits:
- ✅ Starts automatically on system boot
- ✅ Auto-restarts if it crashes (10 second delay)
- ✅ Radio connections persist even when browser is closed
- ✅ Single port (8080) for both WebSocket and web UI
- ✅ Accessible on LAN for remote access
- ✅ Automatic port cleanup on startup
- ✅ Security hardening (NoNewPrivileges, PrivateTmp)

### Production Build (Manual)

```bash
# Build the frontend
npm run build

# Run in production mode (serves both on port 8080)
npm run production
```

## Network Access

### LAN/Remote Access

**The bridge server automatically binds to `0.0.0.0`**, making it accessible from any device on your local network!

**Access from other devices:**
1. Find your server's local IP address (shown on bridge startup)
2. Open browser on any device on the same network
3. Navigate to `http://YOUR_SERVER_IP:8080`
4. Full functionality works remotely!

**Example:**
```
Bridge Server running on: 192.168.1.100
Access from phone:        http://192.168.1.100:8080
Access from tablet:       http://192.168.1.100:8080
Access from laptop:       http://192.168.1.100:8080
Access locally:           http://localhost:8080
```

**Security Considerations:**
- The server is accessible to anyone on your LAN
- For internet access, use a reverse proxy (nginx, Caddy) with authentication
- Consider firewall rules if exposing to WAN
- HTTPS recommended for remote access (use reverse proxy)

**Finding Your IP Address:**
```bash
# Linux/macOS
hostname -I | awk '{print $1}'

# Or look for it in the bridge startup logs
npm run bridge
# Shows: 🌐 Access on LAN: http://192.168.1.100:8080 (eth0)
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

### Single Radio Mode

**This system is incredibly useful with just ONE radio!** You don't need multiple radios to benefit from this application.

**Single Radio Use Cases:**
- 🤖 **AI Assistant** - Ask questions via `#ai` commands and get responses on your radio screen
- 📧 **Email Gateway** - Send emails from remote locations via `#email` commands
- 💬 **Discord Integration** - Post status updates to Discord via `#discord` commands
- 🚨 **Emergency SOS** - Automatic detection and response for emergencies with `#sos`
- 🌩️ **Weather Alerts** - Receive severe weather warnings from National Weather Service
- 🌤️ **Information Services** - Get weather, time, status info via commands
- 📊 **Monitoring** - View all mesh traffic in a clean web interface
- 📝 **Message History** - Keep track of all messages with timestamps
- 🔍 **Node Discovery** - See all nodes on your mesh network
- 🗺️ **GPS Tracking** - View node locations on interactive maps

**Example Single Radio Workflow:**
```
You're hiking remotely with one radio:
• #ai What plants are safe to eat in Pacific Northwest?
• #weather Seattle
• #email Reached checkpoint 3, all good
• #sos fell and injured ankle, need assistance
  (Bridge auto-responds requesting GPS and coordinating help)
• Receive NWS alert: "⚠️ Flash Flood Warning for your area"
```

All commands work perfectly with one radio - no bridging required!

### Message Forwarding (2+ Radios)

**Automatic Forwarding** (default behavior when 2+ radios connected):
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
- `#email [message]` - Send email notification (requires email configuration)
- `#discord [message]` - Send Discord notification (requires Discord webhook)
- `#notify [message]` - Send to both email and Discord

**Example Usage:**
```
You send:  #weather Portland
Bridge responds: 🌤️ Portland: Partly cloudy, 58°F, 💧75%, 💨10mph

You send: #status
Bridge responds: 📊 Bridge Status:
                 Radios: 2 connected
                 Messages: 342 in history
                 Uptime: 5h 23m
                 Version: Alpha 25.11

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

### 1. Connect Your Radio(s)

**Development Mode:**
1. Launch the application (`npm run start`)
2. Open browser to http://localhost:5173
3. Click **"Scan for Radios"** or **"Connect Radio"**
4. Select your Meshtastic device(s) from the list
5. Radio(s) will appear in the sidebar instantly

**Production Mode / Service:**
1. Start the service (`npm run service:start` or `npm run production`)
2. Open browser to http://localhost:8080
3. Click **"Scan for Radios"** or **"Connect Radio"**
4. Select your Meshtastic device(s) from the list
5. Radio(s) will appear in the sidebar instantly

### 2. Single Radio Usage

**With just one radio connected**, you get access to these powerful features:

**AI Assistant:**
- Ask questions: `#ai How far is Mars from Earth?`
- Get information: `#ask What is a mesh network?`
- Responses appear on your radio screen

**Email Notifications:**
- Configure SMTP in "Communication" tab
- Send emails: `#email Sensor reading: 72°F, humidity 45%`
- Perfect for remote monitoring and alerts

**Discord Integration:**
- Configure webhook in "Communication" tab
- Post updates: `#discord Solar panel online, battery 100%`
- Great for status updates and team communication

**Information Commands:**
- `#weather [city]` - Weather reports
- `#time` - Current date and time
- `#status` - System status
- `#help` - List all commands

**Message Monitoring:**
- View all mesh traffic in real-time
- Track message history
- See connected nodes
- Monitor signal quality

### 3. Message Forwarding (2+ Radios)

**Messages are automatically forwarded!** No manual configuration needed.

The bridge:
- ✅ Receives messages on any connected radio
- ✅ Searches other radios for matching channels (PSK + name)
- ✅ Forwards to all radios with matching channel configuration
- ✅ Prevents loops (won't forward messages it sent)
- ✅ Deduplicates messages (both radios often receive same broadcast)

### 4. Forwarding Private Channels (2+ Radios)

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

### 5. Monitoring

- **Dashboard**: Overview of connected radio(s) and recent messages
- **Messages**: Live feed of all messages from your radio(s)
- **Radios**: Detailed status of each connected radio
- **Map**: Visualize node locations on an interactive map
- **TAK**: Team Awareness Kit style tactical view
- **Site Planner**: Plan and visualize mesh network coverage
- **Emergency/SOS**: Monitor SOS emergencies and broadcast severe weather alerts
- **Logs**: System logs for troubleshooting
- **AI Assistant**: Configure and manage local AI models
- **Communication**: Configure email and Discord notifications
- **MQTT**: Configure MQTT broker integration

### 6. AI Assistant Setup

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

### 7. Communication Notifications Setup

Configure email and Discord notifications to send messages from your radio to external platforms.

#### Email Configuration

1. **Open Web UI** → Navigate to **"Communication"** tab

2. **Configure SMTP Settings**
   - **Host**: Your SMTP server (e.g., `smtp.gmail.com`)
   - **Port**: 587 (TLS) or 465 (SSL)
   - **Username**: Your email address
   - **Password**: App-specific password (for Gmail, generate at https://myaccount.google.com/apppasswords)
   - **From**: Sender email address
   - **To**: Recipient email address

3. **Enable Email** toggle to ON

4. **Test Configuration** - Click "Test Email" button

5. **Send from Radio**
   - From any Meshtastic radio: `#email System check - all sensors normal`
   - Email will be sent with node name and message

#### Discord Configuration

1. **Create Discord Webhook**
   - Open Discord → Server Settings → Integrations → Webhooks
   - Click "New Webhook" → Copy webhook URL

2. **Configure in Web UI**
   - Open "Communication" tab
   - Paste webhook URL
   - Set bot username (optional)

3. **Enable Discord** toggle to ON

4. **Test Configuration** - Click "Test Discord" button

5. **Send from Radio**
   - From any Meshtastic radio: `#discord Temperature alert: 95°F`
   - Message will post to Discord channel

#### Use Cases

- **Remote monitoring**: `#email Solar panel voltage low: 11.2V`
- **Emergency alerts**: `#notify URGENT: Medical assistance needed`
- **Status updates**: `#discord Weather station online, all sensors operational`
- **Automation triggers**: Have scripts or integrations react to Discord messages

#### Troubleshooting

**"Email authentication failed"**
- Use app-specific password, not regular account password
- For Gmail: Enable 2FA, then generate app password
- Check username is full email address

**"Cannot connect to email server"**
- Verify SMTP host and port are correct
- Check firewall/network allows outbound SMTP
- Try port 587 (TLS) or 465 (SSL)

**"Discord send failed"**
- Verify webhook URL is complete and correct
- Check webhook hasn't been deleted in Discord
- Test webhook URL directly with curl or Postman

### 8. Emergency Response System

The Emergency Response System provides comprehensive safety features including SOS emergency tracking and severe weather alerts.

#### SOS Emergency Tracking

The system automatically monitors all mesh messages for emergency keywords and provides immediate response coordination.

**Monitored Keywords:**
- `#sos`, `sos`
- `#emergency`, `emergency`
- `#help`
- `#911`, `911`
- `#rescue`, `rescue`
- `#urgent`, `urgent`
- `mayday`

**How It Works:**

1. **Detection** - When someone sends a message containing an emergency keyword:
   ```
   User sends: "#sos fell and injured, need help"
   ```

2. **Auto-Response** - Bridge automatically responds with help instructions:
   - Requests GPS location if not already shared
   - Requests battery status
   - Provides calm reassurance
   - Notifies that help is being coordinated

3. **Emergency Tracking** - Web UI displays:
   - Active emergency with pulsing red indicator
   - Node name and location (if GPS available)
   - Battery level and signal strength
   - Time since emergency started
   - Number of responses sent

4. **Operator Actions** - Emergency coordinators can:
   - Mark emergency as "Responding" (help en route)
   - Broadcast emergency to all nodes
   - Send custom instructions
   - View location in Google Maps
   - Mark emergency as "Resolved"

**Emergency States:**
- 🔴 **Active** (red, pulsing) - Immediate attention needed
- 🟡 **Responding** (yellow) - Help is on the way
- 🟢 **Resolved** (green) - Successfully handled

**Settings:**
- **Auto-Response**: Automatically send help instructions (default: ON)
- **Alert Sound**: Play audio alert for new emergencies (default: ON)

#### NWS Weather Alerts

Fetches severe weather warnings from the National Weather Service and can auto-broadcast to the mesh network.

**Setup:**

1. **Open Web UI** → Navigate to **"Emergency / SOS"** tab

2. **Enable Weather Monitoring** - Toggle to ON

3. **Choose Monitoring Method**:
   - **By State**: Select your state from dropdown (all 50 US states supported)
   - **By GPS Coordinates**: Enter latitude/longitude for precise location

4. **Configure Settings**:
   - **Update Interval**: How often to check for new alerts (default: 5 minutes)
   - **Auto-Broadcast Severe Alerts**: Automatically send extreme weather warnings to mesh (default: ON)

5. **Monitor Alerts**:
   - Active weather alerts appear in the interface
   - Click alert to view full details and instructions
   - Manually broadcast any alert with "Broadcast Alert" button

**Alert Severity Levels:**
- 🔴 **Extreme** - Tornado Warning, Hurricane Warning, Extreme Wind Warning
- 🟠 **Severe** - Severe Thunderstorm Warning, Flash Flood Warning
- 🟡 **Moderate** - Flood Watch, Winter Storm Watch
- 🔵 **Minor** - Special Weather Statements

**Auto-Broadcast Triggers:**
- Severity = Extreme
- Severity = Severe AND Urgency = Immediate
- Specific events: Tornado Warning, Flash Flood Warning, Hurricane Warning, etc.

**Broadcast Format:**
```
🌩️ NWS ALERT: Tornado Warning
📍 King County, WA
⚠️ Extreme - Immediate
Tornado spotted 5 miles south of Seattle moving northeast...
📋 Take shelter immediately in basement or interior room...
⏰ Expires: 3:45 PM
```

**Use Cases:**
- **Hurricane prep**: Auto-notify mesh network of approaching storms
- **Tornado safety**: Immediate warnings to all nodes in affected area
- **Flash flood alerts**: Critical for hiking/camping groups
- **Severe thunderstorms**: Keep outdoor events informed
- **Winter storms**: Alert remote locations before power/communication loss

**Features:**
- Automatic deduplication (won't broadcast same alert multiple times)
- Configurable monitoring location
- Manual broadcast override for any alert
- Detailed safety instructions included
- Expiration tracking

#### Emergency Protocol Documentation

The Emergency/SOS tab includes built-in protocol documentation:

**For Users Needing Help:**
1. Send message with keyword: `#sos` or `#emergency`
2. Share GPS location (Settings → Position → Send Now)
3. Include details: injury, location, number of people
4. Stay calm and await response
5. Conserve device battery if possible

**For Emergency Coordinators:**
- Receive immediate alert with position
- Send help instructions and status updates
- Coordinate rescue if needed
- Monitor battery and signal status
- Track emergency through resolution

#### Troubleshooting

**"Weather alerts not updating"**
- Check internet connection (NWS API requires internet)
- Verify update interval hasn't been set too high
- Click "Refresh" button to force update
- Check browser console for API errors

**"Auto-broadcast not working"**
- Ensure "Auto-Broadcast Severe Alerts" toggle is ON
- Verify at least one radio is connected
- Check that alerts meet severity threshold (Extreme or Severe+Immediate)
- Review logs for broadcast confirmation

**"Emergency not detected"**
- Verify keyword is in the monitored list
- Check message actually sent (not draft)
- Look for emergency in "Emergency Events" section
- Ensure Emergency/SOS tab is loaded (uses real-time monitoring)

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

### Version 25.11.2 (Latest) - Critical Bug Fixes

**Major Fixes:**
- ✅ **Fixed Meshtastic v2.6.7 Compatibility** - Resolved "Device.nodes not ready" initialization loop
  - Updated to use internal node catalog instead of non-existent device.nodes Map
  - Radio connections now complete successfully without retry failures
  - Temperature and telemetry data now displays correctly
- ✅ **Fixed Sent Message Timestamps** - Corrected "December 31, 1969" timestamp bug
  - Standardized timestamp format across sent and received messages
  - All messages now display with correct Date objects instead of ISO strings
- ✅ **Fixed Critical Timestamp Handling** - Resolved telemetry data loss
  - Fixed `.getTime()` calls on serialized Date objects throughout UI components
  - Telemetry snapshots, emergency tracking, and message filtering now work correctly
  - Network health metrics and environmental sensors display accurate data
- ✅ **Fixed Message Forwarding** - Corrected targetProtocol reference bug
  - Smart channel matching now forwards messages properly between radios
- ✅ **UI Performance Improvements**
  - Fixed broken Tailwind CSS dynamic classes in production builds
  - Optimized Dashboard with memoization for chart calculations
  - Corrected useEffect dependency arrays to prevent infinite loops
  - Added memory leak prevention with proper cleanup of setInterval timers
  - Implemented localStorage quota management for persistent data

### Previously Added Features

**Recently Added:**
- ✅ **Emergency Response System** - SOS tracking with auto-response and emergency coordination
- ✅ **NWS Weather Alerts** - Severe weather monitoring and auto-broadcast to mesh network
- ✅ **TAK Tactical View** - Team Awareness Kit style tactical display
- ✅ **Site Planner** - Mesh network coverage planning and visualization
- ✅ **MQTT Integration** - Connect to MQTT brokers for IoT integration
- ✅ **Map View** - Interactive map with node locations

**Previously Fixed:**
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
│   ├── index.mjs              # Node.js bridge (HTTP + WebSocket + Serial)
│   └── protocols/             # Protocol handlers
│       └── MeshtasticProtocol.mjs
├── src/
│   └── renderer/
│       ├── components/        # React UI components
│       │   ├── Dashboard.tsx
│       │   ├── RadioList.tsx
│       │   ├── NodeList.tsx
│       │   ├── MessageMonitor.tsx
│       │   ├── MapView.tsx
│       │   ├── TacticalView.tsx
│       │   ├── SitePlanner.tsx
│       │   ├── EmergencyResponse.tsx    # NEW: SOS & Weather Alerts
│       │   ├── AISettings.tsx
│       │   ├── CommunicationSettings.tsx
│       │   └── MQTTSettings.tsx
│       ├── lib/               # WebSocket manager, utilities
│       │   ├── webSocketManager.ts
│       │   └── weatherService.ts         # NEW: NWS API integration
│       ├── store/             # Zustand state management
│       ├── App.tsx            # Main app component
│       └── types.ts           # TypeScript types
├── dist/                      # Built frontend (after npm run build)
├── install-service.sh         # Service installation script
├── uninstall-service.sh       # Service removal script
├── mesh-bridge.service        # Systemd service template
├── package.json
└── vite.config.ts
```

### Available Scripts

```bash
# Development
npm run start           # Start bridge + dev server (localhost:5173)
npm run dev             # Run web UI dev server only
npm run bridge          # Run bridge server only (localhost:8080, LAN accessible)

# Building & Production
npm run build           # Build production frontend
npm run production      # Build + run in production mode (port 8080, LAN accessible)
npm run preview         # Preview production build (Vite)

# Service Management (Linux)
sudo ./install-service.sh       # Install systemd service and start it
sudo ./uninstall-service.sh     # Remove systemd service
sudo systemctl start mesh-bridge     # Start the service
sudo systemctl stop mesh-bridge      # Stop the service
sudo systemctl restart mesh-bridge   # Restart the service
sudo systemctl status mesh-bridge    # Check service status
sudo journalctl -u mesh-bridge -f    # View live service logs
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
| Radio Support | ✅ 1+ radios | ✅ 2 radios (required) |
| Auto Forwarding | ✅ Automatic (2+ radios) | ✅ Automatic |
| Smart Channel Matching | ✅ Yes (PSK+name) | ❌ Index-based only |
| Private Channel Support | ✅ Yes | ⚠️ Limited |
| AI Assistant | ✅ Yes (Ollama) | ❌ No |
| Email Notifications | ✅ Yes (SMTP) | ❌ No |
| Discord Integration | ✅ Yes (Webhooks) | ❌ No |
| SOS Emergency Tracking | ✅ Yes (auto-detect) | ❌ No |
| Weather Alerts (NWS) | ✅ Yes (auto-broadcast) | ❌ No |
| Interactive Commands | ✅ 16 commands | ❌ No |
| Real-time Monitoring | ✅ Dashboard | ⚠️ Logs only |
| Configuration | ✅ Visual + code | ⚠️ Code only |
| Cross-platform | ✅ Win/Mac/Linux | ✅ Linux (primary) |
| Resource Usage | ~150-250 MB RAM | ~50-100 MB RAM |
| Boot Persistence | ✅ Systemd service (Linux) | ✅ Systemd service |
| Auto-restart on Crash | ✅ Yes (when using service) | ✅ Yes |
| Port Cleanup | ✅ Automatic | ⚠️ Manual |
| Maturity | ⚠️ Alpha | ✅ Stable |
| Use Case | Desktop/Server/Single Radio | Production Bridging Only |

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

This project is available under a **Dual License**:
- **Non-Commercial License** (free) - for personal, educational, research, and non-profit use
- **Commercial License** - requires a separate agreement for commercial use

See the [LICENSE](LICENSE) file for complete terms and conditions.

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
- Single radio with AI/email/Discord features
- Multi-radio message bridging
- Emergency response coordination and SOS tracking
- Severe weather monitoring and alerting
- Search and rescue operations
- Outdoor recreation safety (hiking, camping, climbing)
- Event coordination with weather monitoring
- Learning about Meshtastic
- Remote monitoring and notifications
- Linux servers with systemd

**Use with caution for:**
- Critical infrastructure
- High-reliability requirements
- Production deployments without testing

Made with ❤️ for the Meshtastic community
