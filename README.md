# Meshtastic Bridge PWA

A modern, lightweight **Progressive Web App** for managing Meshtastic radio bridge relay stations. Built with React, TypeScript, and Web Serial API.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Opera-lightgrey.svg)
![Version](https://img.shields.io/badge/version-2.0.0-green.svg)
![Type](https://img.shields.io/badge/type-PWA-purple.svg)

## Version 2.0 - PWA Architecture! 🚀

**Major Redesign:**
- 🌐 **No Installation Required** - runs directly in your browser!
- ⚡ **Lightning Fast** - no Electron overhead (~100MB saved)
- 🔌 **Web Serial API** - direct USB access from browser
- 📱 **Installable PWA** - add to home screen like a native app
- 🔄 **Offline Support** - works without internet connection
- ✨ Latest @meshtastic/js (2.6.0-0) with JSR support
- 🎯 Modern Zustand state management

## Features

🎯 **Core Functionality**
- 📡 Support for 2+ Meshtastic radios with flexible bridging
- 🔄 Real-time bidirectional message forwarding
- 🛡️ Message deduplication and loop prevention
- 🔌 Auto-detect USB-connected devices
- ⚡ Auto-reconnect on connection loss

📊 **Monitoring & Analytics**
- Real-time dashboard with live statistics
- Message traffic monitoring and filtering
- Per-radio metrics (received, sent, errors)
- Health status indicators (battery, signal, channel utilization)
- Message rate tracking

⚙️ **Configuration**
- Visual bridge route configuration
- Support for multiple bridge routes
- Configurable deduplication window
- Adjustable reconnect parameters
- Enable/disable individual routes

🎨 **Modern UI**
- Beautiful dark-themed interface
- Responsive design with Tailwind CSS
- Real-time updates
- Interactive charts and graphs
- Intuitive navigation

🔧 **Developer Features**
- Built with TypeScript for type safety
- Cross-platform (Windows, macOS, Linux)
- Auto-update functionality
- Comprehensive logging system

## 🚀 One-Line Installation

### Linux/macOS
```bash
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git && cd Mesh-Bridge-GUI && ./install.sh
```

### Windows (PowerShell/CMD)
```batch
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git && cd Mesh-Bridge-GUI && install.bat
```

**That's it!** The installer automatically:
- ✅ Installs Node.js 20 LTS if needed (asks first)
- ✅ Installs all dependencies
- ✅ Builds the application
- ✅ Adds `mesh-bridge` command to your PATH

Then run from anywhere:
```bash
mesh-bridge
```

Open browser to: **http://localhost:5173**

---

## Quick Start

### Prerequisites

- **Modern Browser**: Chrome 89+, Edge 89+, or Brave 89+ (Desktop)
- **Meshtastic Device**: Connected via USB
- **Git**: For cloning the repository
- **Node.js 18+**: Auto-installed by installer if missing

### Installation Options

#### Option 1: Automated Install (Recommended)

**Linux/macOS:**
```bash
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI
./install.sh
```

**Windows:**
```batch
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI
install.bat
```

The installer will:
- Check for Node.js and offer to install it automatically if missing
- Install all npm dependencies
- Build the production application
- Add `mesh-bridge` command to your PATH

**Run from anywhere:**
```bash
mesh-bridge
```

**Or from project directory:**
```bash
npm run dev
```

#### Option 2: Manual Installation

```bash
# Prerequisites: Node.js 18+ and npm
# Clone the repository
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI

# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
# Navigate to http://localhost:5173
```

#### Option 3: Build & Deploy

```bash
# Build for production
npm run build

# The dist/ folder contains the static PWA
# Deploy to any static hosting (Netlify, Vercel, GitHub Pages, etc.)

# Or preview locally
npm run preview
```

## Usage

### Connecting Your First Radio

1. **Launch the Application**
   - Open Meshtastic Bridge GUI

2. **Connect a Radio**
   - Click the "Connect Radio" button in the sidebar
   - The app will scan for available USB serial ports
   - Select your Meshtastic device from the list
   - Click "Connect"

3. **Repeat for Additional Radios**
   - Connect as many radios as you need (2+ recommended for bridging)

### Setting Up Bridge Routes

1. **Navigate to Configuration**
   - Click "Configuration" in the sidebar

2. **Create a Bridge Route**
   - Click "Add Route"
   - Select source radios (messages will be received from these)
   - Select target radios (messages will be forwarded to these)
   - Click "Save Route"

3. **Enable the Bridge**
   - Make sure the "Enable Bridge" toggle is ON
   - Your bridge is now active!

### Monitoring

- **Dashboard**: Overview of all radios, message stats, and recent activity
- **Radios**: Detailed status of each connected radio
- **Messages**: Live feed of all messages with filtering
- **Logs**: System logs for troubleshooting

## Configuration Options

### Global Settings

- **Enable Bridge**: Master switch for all forwarding
- **Deduplication Window**: Time window (seconds) to detect duplicate messages
- **Auto-Reconnect**: Automatically reconnect lost radios
- **Reconnect Delay**: Initial delay before reconnection attempt
- **Max Reconnect Attempts**: Maximum number of reconnection tries

### Bridge Routes

Each route can have:
- Multiple source radios
- Multiple target radios
- Individual enable/disable toggle
- Forwarding happens from any source to all targets

## Development

### Project Structure

```
Mesh-Bridge-GUI/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Application entry
│   │   ├── radioManager.ts # Radio connection logic
│   │   ├── updater.ts     # Auto-update functionality
│   │   ├── preload.ts     # IPC bridge
│   │   └── types.ts       # TypeScript types
│   └── renderer/          # React frontend
│       ├── components/    # UI components
│       ├── App.tsx        # Main app component
│       ├── index.css      # Styles
│       └── types.ts       # Frontend types
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Available Scripts

```bash
# Development
npm run dev              # Run in development mode
npm run dev:renderer     # Run only renderer (React)
npm run dev:main         # Build only main process

# Building
npm run build           # Build both main and renderer
npm run build:renderer  # Build renderer only
npm run build:main      # Build main process only

# Packaging
npm run package         # Create distributable packages
```

### Tech Stack

- **Framework**: Electron 28+
- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Radio Communication**: @meshtastic/js
- **Build Tool**: Vite
- **Package Builder**: electron-builder

## Uninstallation

To completely remove the application and all traces:

**Linux/macOS:**
```bash
cd Mesh-Bridge-GUI
./uninstall.sh
```

**Windows:**
```batch
cd Mesh-Bridge-GUI
uninstall.bat
```

The uninstaller removes:
- ✅ All node modules and dependencies
- ✅ All build artifacts and caches
- ✅ `mesh-bridge` command from PATH
- ✅ All temporary files

For complete removal including browser data, see [INSTALL.md](INSTALL.md) for instructions.

## Troubleshooting

### Radio Won't Connect

1. Check USB connection
2. Ensure no other application is using the serial port
3. Try unplugging and reconnecting the device
4. Use "Force Close All Ports" button in the Radios tab
5. Check logs for detailed error messages

### Messages Not Forwarding

1. Verify bridge is enabled (Configuration → Enable Bridge)
2. Check that bridge routes are configured correctly
3. Ensure both source and target radios are connected
4. Check individual route enable/disable status
5. Look for duplicate message filtering in logs

### Application Won't Start

1. Check system requirements (Node.js 18+)
2. Run the uninstaller, then reinstaller:
   ```bash
   ./uninstall.sh && ./install.sh
   ```
3. Check logs in the Logs tab for detailed error messages

### Installation Issues

If installation fails:
1. Ensure you have git installed
2. Check internet connection (needed to download Node.js and dependencies)
3. On Linux/macOS, make sure installer is executable: `chmod +x install.sh`
4. Try manual installation (see Option 2 above)
5. Check [INSTALL.md](INSTALL.md) for detailed troubleshooting

## Auto-Updates

The application automatically checks for updates:
- On startup (after 3 seconds)
- Every hour while running

When an update is available:
1. You'll receive a notification
2. Choose to download now or later
3. When downloaded, restart to install
4. Updates install automatically on quit

You can also manually check: Help → Check for Updates (in production builds)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on top of the [meshtastic-bridge-headless](https://github.com/IceNet-01/meshtastic-bridge-headless) project
- Uses [@meshtastic/js](https://github.com/meshtastic/js) for radio communication
- Inspired by the amazing Meshtastic community

## Support

- 🐛 [Report Bug](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues)
- 💡 [Request Feature](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues)
- 💬 [Discussions](https://github.com/IceNet-01/Mesh-Bridge-GUI/discussions)

## Comparison with Headless Version

| Feature | GUI Version | Headless Version |
|---------|------------|------------------|
| Visual Interface | ✅ Modern UI | ❌ Command-line only |
| Multiple Radios | ✅ 2+ radios | ✅ 2 radios |
| Real-time Monitoring | ✅ Dashboard, charts | ⚠️ Logs only |
| Configuration | ✅ Visual editor | ⚠️ Manual editing |
| Auto-updates | ✅ Built-in | ❌ Manual |
| Cross-platform | ✅ Win/Mac/Linux | ✅ Linux (primary) |
| Resource Usage | ~100-200 MB RAM | ~50-100 MB RAM |
| Boot Persistence | ❌ Run manually | ✅ Systemd service |
| Use Case | Desktop/Laptop | Server/Raspberry Pi |

---

Made with ❤️ for the Meshtastic community
