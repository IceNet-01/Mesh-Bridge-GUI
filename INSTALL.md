# Installation and Uninstallation Guide

## Quick Start

### Linux/macOS

```bash
# Install
./install.sh

# Run
npm run dev

# Uninstall (removes ALL traces)
./uninstall.sh
```

### Windows

```batch
# Install
install.bat

# Run
npm run dev

# Uninstall (removes ALL traces)
uninstall.bat
```

## What the Installer Does

The installer script will:

1. ✓ Check for Node.js 18+ and npm
2. ✓ Clean any previous installation files
3. ✓ Clean npm cache
4. ✓ Install all dependencies
5. ✓ Build the production application

## What the Uninstaller Does

The uninstaller script will **completely remove** ALL traces:

### Local Files Removed
- `node_modules/` - All dependencies
- `package-lock.json` - Lock file
- `yarn.lock` - Yarn lock file (if exists)
- `pnpm-lock.yaml` - PNPM lock file (if exists)
- `dist/` - Built application
- `.vite/` - Vite cache
- `.cache/` - General cache
- `.parcel-cache/` - Parcel cache (if exists)
- `coverage/` - Test coverage
- `.nyc_output/` - Coverage output
- `tsconfig.tsbuildinfo` - TypeScript build info
- `tmp/`, `temp/` - Temporary directories
- All log files (npm-debug.log, yarn-error.log, etc.)

### System Operations
- ✓ Cleans npm cache
- ✓ Kills any running dev servers (port 5173)
- ✓ Closes any stuck serial port connections

### Browser Data (Manual Cleanup Required)

After running the uninstaller, you'll need to manually clear browser data:

#### Clear Service Workers

**Chrome/Edge/Brave:**
1. Visit `chrome://serviceworker-internals/`
2. Find entries for `localhost:5173`
3. Click "Unregister" for each

**Firefox:**
1. Visit `about:serviceworkers`
2. Find entries for `localhost:5173`
3. Click "Unregister"

#### Clear Site Data

**Chrome/Edge/Brave:**
1. Press F12 to open DevTools
2. Go to **Application** tab
3. In the **Storage** section, click **Clear site data**
4. Or visit: `chrome://settings/siteData`
5. Search for "localhost" and remove all entries

**Firefox:**
1. Press F12 to open DevTools
2. Go to **Storage** tab
3. Right-click each storage type (Local Storage, Session Storage, IndexedDB, Cache Storage)
4. Select **Delete All**

#### Clear All Browser Data

**Chrome:** `chrome://settings/clearBrowserData`
**Firefox:** `about:preferences#privacy`
**Edge:** `edge://settings/clearBrowserData`

## Requirements

- **Node.js** 18 or higher
- **npm** (comes with Node.js)
- **Browser:** Chrome, Edge, or Brave (Web Serial API support)
- **Hardware:** Meshtastic radio connected via USB

## Manual Installation (Alternative)

If the installer scripts don't work, you can install manually:

```bash
# Clean everything
rm -rf node_modules package-lock.json dist .vite

# Install
npm install

# Build
npm run build

# Run
npm run dev
```

## Troubleshooting

### Port Already in Use

If port 5173 is already in use:

```bash
# Linux/macOS
pkill -f vite
pkill -f "node.*5173"

# Windows
taskkill /f /im node.exe
```

### Serial Port Stuck

If your serial port is stuck:

1. Close all browser tabs with the app
2. Visit `chrome://serviceworker-internals/` and unregister all workers
3. Run the uninstaller
4. Disconnect and reconnect your Meshtastic radio
5. Run the installer again

### npm Install Fails

```bash
# Clear npm cache completely
npm cache clean --force

# Remove node_modules
rm -rf node_modules package-lock.json

# Try again
npm install
```

### Browser Says "Serial API Not Available"

The Web Serial API is only available in:
- Chrome 89+
- Edge 89+
- Brave 89+
- Opera 76+

**Not available in:** Firefox, Safari

## Complete Project Removal

To remove the entire project directory:

```bash
# Linux/macOS
cd ..
rm -rf Mesh-Bridge-GUI

# Windows
cd ..
rmdir /s /q Mesh-Bridge-GUI
```

## Support

For issues, visit: https://github.com/IceNet-01/Mesh-Bridge-GUI/issues
