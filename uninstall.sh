#!/bin/bash

# Meshtastic Bridge GUI - Complete Uninstaller
# This script removes ALL traces of the application from your system

echo "====================================="
echo "Meshtastic Bridge GUI - Uninstaller"
echo "====================================="
echo ""
echo "⚠️  WARNING: This will remove:"
echo "   - All node modules"
echo "   - All build artifacts"
echo "   - All cached data"
echo "   - Service worker registrations"
echo "   - Browser storage data"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo "Starting complete removal..."
echo ""

# Get the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Remove node_modules
if [ -d "node_modules" ]; then
    echo "Removing node_modules..."
    rm -rf node_modules
    echo "✓ node_modules removed"
fi

# Remove package-lock.json
if [ -f "package-lock.json" ]; then
    echo "Removing package-lock.json..."
    rm -f package-lock.json
    echo "✓ package-lock.json removed"
fi

# Remove yarn.lock if exists
if [ -f "yarn.lock" ]; then
    echo "Removing yarn.lock..."
    rm -f yarn.lock
    echo "✓ yarn.lock removed"
fi

# Remove pnpm-lock.yaml if exists
if [ -f "pnpm-lock.yaml" ]; then
    echo "Removing pnpm-lock.yaml..."
    rm -f pnpm-lock.yaml
    echo "✓ pnpm-lock.yaml removed"
fi

# Remove dist directory
if [ -d "dist" ]; then
    echo "Removing dist directory..."
    rm -rf dist
    echo "✓ dist directory removed"
fi

# Remove Vite cache
if [ -d ".vite" ]; then
    echo "Removing Vite cache..."
    rm -rf .vite
    echo "✓ Vite cache removed"
fi

# Remove TypeScript build info
if [ -f "tsconfig.tsbuildinfo" ]; then
    echo "Removing TypeScript build info..."
    rm -f tsconfig.tsbuildinfo
    echo "✓ TypeScript build info removed"
fi

# Remove any log files
echo "Removing log files..."
rm -f npm-debug.log yarn-error.log pnpm-debug.log 2>/dev/null
echo "✓ Log files removed"

# Remove .cache directories
if [ -d ".cache" ]; then
    echo "Removing .cache directory..."
    rm -rf .cache
    echo "✓ .cache directory removed"
fi

# Remove .parcel-cache if exists
if [ -d ".parcel-cache" ]; then
    echo "Removing .parcel-cache..."
    rm -rf .parcel-cache
    echo "✓ .parcel-cache removed"
fi

# Remove coverage directories
if [ -d "coverage" ]; then
    echo "Removing coverage directory..."
    rm -rf coverage
    echo "✓ coverage directory removed"
fi

# Remove .nyc_output
if [ -d ".nyc_output" ]; then
    echo "Removing .nyc_output..."
    rm -rf .nyc_output
    echo "✓ .nyc_output removed"
fi

# Remove any temp directories
if [ -d "tmp" ]; then
    echo "Removing tmp directory..."
    rm -rf tmp
    echo "✓ tmp directory removed"
fi

if [ -d "temp" ]; then
    echo "Removing temp directory..."
    rm -rf temp
    echo "✓ temp directory removed"
fi

# Clean npm cache
echo "Cleaning npm cache..."
npm cache clean --force 2>/dev/null || true
echo "✓ npm cache cleaned"

# Try to kill any running dev servers
echo "Checking for running dev servers..."
pkill -f "vite" 2>/dev/null || true
pkill -f "node.*5173" 2>/dev/null || true
echo "✓ Stopped any running dev servers"

# Remove mesh-bridge command from PATH
if [ -f "$HOME/.local/bin/mesh-bridge" ]; then
    echo "Removing mesh-bridge command from PATH..."
    rm -f "$HOME/.local/bin/mesh-bridge"
    echo "✓ mesh-bridge command removed from ~/.local/bin/"
fi

# Remove bin directory
if [ -d "bin" ]; then
    echo "Removing bin directory..."
    rm -rf bin
    echo "✓ bin directory removed"
fi

echo ""
echo "====================================="
echo "✓ Application Removed Successfully"
echo "====================================="
echo ""
echo "📋 Manual cleanup required for browser data:"
echo ""
echo "To remove ALL browser data for this app:"
echo ""
echo "Chrome/Edge/Brave:"
echo "  1. Open DevTools (F12)"
echo "  2. Go to Application tab"
echo "  3. In 'Storage' section, click 'Clear site data'"
echo "  4. Or visit: chrome://settings/siteData"
echo "  5. Search for 'localhost' and remove all entries"
echo ""
echo "Firefox:"
echo "  1. Open DevTools (F12)"
echo "  2. Go to Storage tab"
echo "  3. Right-click on each storage type and select 'Delete All'"
echo "  4. Or visit: about:preferences#privacy"
echo "  5. Click 'Clear Data' under Cookies and Site Data"
echo ""
echo "To unregister service workers:"
echo "  Chrome: chrome://serviceworker-internals/"
echo "  Firefox: about:serviceworkers"
echo "  Edge: edge://serviceworker-internals/"
echo "  Find entries for 'localhost:5173' and click 'Unregister'"
echo ""
echo "To clear browser cache completely:"
echo "  Chrome: chrome://settings/clearBrowserData"
echo "  Firefox: about:preferences#privacy"
echo "  Edge: edge://settings/clearBrowserData"
echo ""
echo "If you want to delete the entire project folder:"
echo "  cd .. && rm -rf \"$PROJECT_DIR\""
echo ""
