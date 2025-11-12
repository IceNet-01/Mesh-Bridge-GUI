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

### Installation

```bash
# Clone the repository
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI

# Install dependencies
npm install

# Start the application (both bridge server and web UI)
npm run start
```

The application will start:
- **Bridge Server**: http://localhost:8080 (WebSocket)
- **Web UI**: http://localhost:5173

Open your browser to **http://localhost:5173**

### Production Build

```bash
# Build the frontend
npm run build

# Start bridge server
npm run bridge

# Serve the built frontend
npm run preview
```

## How It Works

### Architecture

```
┌─────────────────┐
│   Web Browser   │ ← You interact here
│  (localhost:5173)│
└────────┬────────┘
         │ WebSocket
         │
┌────────▼────────┐
│  Bridge Server  │ ← Node.js server
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

## Usage

### 1. Connect Your Radios

1. Launch the application (`npm run start`)
2. Open browser to http://localhost:5173
3. Click **"Scan for Radios"** or **"Connect Radio"**
4. Select each Meshtastic device from the list
5. Radios will appear in the sidebar automatically

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

## Known Issues (Alpha)

⚠️ **This is an ALPHA release** - expect bugs!

- ⏱️ Radio connection can be slow (radios appear after configuration completes)
- 📊 Radio metrics page may not display correctly
- 🔁 Messages may appear twice in the message stream (deduplication working but UI shows duplicates)
- ⚙️ "Build Routes" configuration page is currently redundant (routing happens automatically)

These will be fixed in future releases. See [Issues](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues) for status.

## Development

### Project Structure

```
Mesh-Bridge-GUI/
├── bridge-server/
│   └── index.mjs          # Node.js bridge server (WebSocket + Serial)
├── src/
│   └── renderer/
│       ├── components/    # React UI components
│       ├── lib/           # WebSocket manager, utilities
│       ├── store/         # Zustand state management
│       ├── App.tsx        # Main app component
│       └── types.ts       # TypeScript types
├── package.json
└── vite.config.ts
```

### Available Scripts

```bash
# Development
npm run start           # Start bridge server AND web UI (recommended)
npm run dev             # Run web UI only
npm run bridge          # Run bridge server only

# Building
npm run build           # Build production frontend
npm run preview         # Preview production build
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

1. Check USB connection
2. Ensure no other application is using the serial port (close Meshtastic app, other bridges)
3. Try unplugging and reconnecting the devices
4. Check bridge server logs in terminal for errors
5. Restart the bridge server: `npm run start`

### Messages Not Forwarding

1. **Check channel configurations**:
   - Run `npm run start` and look for channel configuration logs
   - Both radios must have the channel configured with matching PSK+name

2. **Check logs for**:
   - "No matching channel" warnings
   - PSK mismatch errors
   - "Message from our own bridge radio" (expected - prevents loops)

3. **Enable verbose logging**:
   - Check bridge server console output
   - Look for `🔀 [SMART MATCH]` forwarding logs

### Radio Connection Delay

This is a known issue in alpha. Radios may take 10-30 seconds to appear in UI while they configure. Watch the bridge server console for configuration progress.

### Double Messages

Known issue - deduplication is working on the bridge side, but UI may show duplicates. Will be fixed in next release.

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
| Boot Persistence | ❌ Run manually | ✅ Systemd service |
| Maturity | ⚠️ Alpha | ✅ Stable |
| Use Case | Desktop/Testing | Production/Server |

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

**⚠️ ALPHA SOFTWARE** - Use at your own risk. Not recommended for production use yet.

Made with ❤️ for the Meshtastic community
