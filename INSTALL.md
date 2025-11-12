# Installation Guide

## Quick Start

### Prerequisites

- **Node.js 18 or higher** ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **USB-connected Meshtastic radios**
- **Modern web browser** (Chrome, Firefox, Edge, Safari)

### Installation

```bash
# Clone the repository
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI

# Install dependencies
npm install

# Start the application
npm run start
```

That's it! The application will start:
- Bridge server on `http://localhost:8080` (WebSocket)
- Web interface on `http://localhost:5173`

Open your browser to **http://localhost:5173**

## Detailed Installation

### Step 1: Install Node.js

If you don't have Node.js installed:

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**macOS:**
```bash
# Using Homebrew
brew install node

# Or download from https://nodejs.org/
```

**Windows:**
- Download installer from https://nodejs.org/
- Run the installer (includes npm)
- Restart your terminal/command prompt

Verify installation:
```bash
node --version  # Should show v18.0.0 or higher
npm --version   # Should show 9.0.0 or higher
```

### Step 2: Clone the Repository

```bash
git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git
cd Mesh-Bridge-GUI
```

### Step 3: Install Dependencies

```bash
npm install
```

This will install:
- Bridge server dependencies (@meshtastic/core, serialport, ws)
- Frontend dependencies (React, Vite, Tailwind CSS)
- Development tools (TypeScript, build tools)

### Step 4: Run the Application

**Development mode** (recommended):
```bash
npm run start
```

This starts both:
1. Bridge server (Node.js with WebSocket on port 8080)
2. Development web server (Vite on port 5173)

**Production mode:**
```bash
# Build the frontend
npm run build

# Run bridge server
npm run bridge

# In another terminal, serve the built frontend
npm run preview
```

## Available Commands

```bash
npm run start       # Start bridge + web UI (development)
npm run dev         # Start web UI only (development)
npm run bridge      # Start bridge server only
npm run build       # Build production frontend
npm run preview     # Preview production build
```

## Configuration

### Bridge Server Configuration

Edit `bridge-server/index.mjs` (lines 47-48):

```javascript
// Enable smart channel matching (recommended for private channels)
this.enableSmartMatching = true;

// Manual channel mapping (for testing)
this.channelMap = null;  // e.g., {0: 3} to map channel 0→3
```

### Port Configuration

If you need to change ports, edit:

**Bridge server port** (default 8080):
- Edit `bridge-server/index.mjs`, line with `new MeshtasticBridgeServer(8080)`

**Web UI port** (default 5173):
- Edit `vite.config.ts`, add `server: { port: 3000 }`

## Troubleshooting

### "Command not found: npm"

Node.js is not installed or not in PATH. Install Node.js following Step 1 above.

### "EACCES: permission denied" (Linux/macOS)

Don't use `sudo npm install`. Instead, fix npm permissions:
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

Then retry `npm install`.

### "Port 5173 already in use"

Another process is using port 5173. Either:
- Kill the other process
- Change the port in `vite.config.ts`

### "Port 8080 already in use"

Another process is using port 8080. Either:
- Kill the other process
- Change the port in `bridge-server/index.mjs`

### Serial Port Access Issues

**Linux:**
```bash
# Add your user to dialout group for serial port access
sudo usermod -a -G dialout $USER

# Log out and back in for changes to take effect
```

**macOS:**
No special permissions needed.

**Windows:**
- Ensure you have the latest USB drivers
- Try running terminal as Administrator if issues persist

### Dependencies Won't Install

```bash
# Clean npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Errors

```bash
# Clean build artifacts
rm -rf dist .vite

# Reinstall and rebuild
npm install
npm run build
```

## Uninstallation

To completely remove the application:

```bash
cd Mesh-Bridge-GUI

# Remove all dependencies and build artifacts
rm -rf node_modules package-lock.json dist .vite

# Optional: Remove the entire directory
cd ..
rm -rf Mesh-Bridge-GUI
```

### Browser Data

If you installed the PWA (Progressive Web App) to your browser/desktop:

**Unregister Service Worker:**

1. **Chrome/Edge/Brave:**
   - Visit `chrome://serviceworker-internals/`
   - Find entries for `localhost:5173`
   - Click "Unregister" for each

2. **Firefox:**
   - Visit `about:serviceworkers`
   - Find entries for `localhost:5173`
   - Click "Unregister"

**Clear Site Data:**

1. **Chrome/Edge/Brave:**
   - Open DevTools (F12)
   - Go to **Application** tab
   - Under **Storage**, click **Clear site data**

2. **Firefox:**
   - Open DevTools (F12)
   - Go to **Storage** tab
   - Right-click site → **Delete All**

## Platform-Specific Notes

### Linux

- Requires `libudev-dev` for serial port access
  ```bash
  sudo apt-get install libudev-dev
  ```
- Add user to `dialout` group (see Troubleshooting)

### macOS

- May require Xcode Command Line Tools
  ```bash
  xcode-select --install
  ```

### Windows

- Requires Visual Studio Build Tools for some npm packages
- Download from: https://visualstudio.microsoft.com/downloads/
- Select "Desktop development with C++" workload

## Production Deployment

To deploy the application to a server:

### Option 1: Simple Deployment

```bash
# Build the frontend
npm run build

# Copy these to your server:
# - bridge-server/
# - dist/
# - package.json
# - node_modules/

# On the server:
npm run bridge        # Run bridge in background/systemd
npm run preview       # Serve frontend
```

### Option 2: Static + Separate Bridge

```bash
# Build frontend
npm run build

# Deploy dist/ to static hosting (Netlify, Vercel, GitHub Pages, etc.)
# Run bridge server on separate machine with your radios
# Update WebSocket URL in frontend to point to bridge server
```

### Option 3: Docker (Advanced)

Create a `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8080 5173
CMD ["npm", "run", "start"]
```

## System Requirements

### Minimum
- **CPU:** 1 GHz dual-core
- **RAM:** 512 MB available
- **Storage:** 500 MB free space
- **OS:** Linux, macOS 10.13+, Windows 10+
- **Node.js:** 18.0.0 or higher

### Recommended
- **CPU:** 2 GHz quad-core
- **RAM:** 2 GB available
- **Storage:** 1 GB free space
- **OS:** Latest stable release
- **Node.js:** 20 LTS

## Support

If you encounter issues not covered here:

- 🐛 [Report Bug](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues)
- 💡 [Request Feature](https://github.com/IceNet-01/Mesh-Bridge-GUI/issues)
- 💬 [Discussions](https://github.com/IceNet-01/Mesh-Bridge-GUI/discussions)
- 📖 [README](README.md)

## Next Steps

After installation:
1. Read the [README](README.md) for usage instructions
2. Connect your Meshtastic radios via USB
3. Start the application with `npm run start`
4. Open browser to http://localhost:5173
5. Click "Scan for Radios" or "Connect Radio"
6. Messages will automatically forward between connected radios!

---

**⚠️ ALPHA SOFTWARE** - This is an alpha release. Expect bugs and breaking changes.
