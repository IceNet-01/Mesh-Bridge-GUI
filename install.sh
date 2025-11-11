#!/bin/bash

# Meshtastic Bridge GUI - Complete Installer
# This script installs all dependencies and sets up the application

set -e

echo "=================================="
echo "Meshtastic Bridge GUI - Installer"
echo "=================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher (current: $(node -v))"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    exit 1
fi

echo "✓ npm $(npm -v) detected"
echo ""

# Clean any previous installation
echo "Cleaning previous installation..."
rm -rf node_modules package-lock.json dist .vite .cache coverage .nyc_output tmp temp
echo "✓ Cleaned previous installation"
echo ""

# Clean npm cache
echo "Cleaning npm cache..."
npm cache clean --force
echo "✓ npm cache cleaned"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Build the application
echo "Building application..."
npm run build
echo "✓ Application built successfully"
echo ""

echo "=================================="
echo "✓ Installation Complete!"
echo "=================================="
echo ""
echo "To start the application:"
echo "  npm run dev"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:5173"
echo ""
echo "Requirements:"
echo "  - Chrome, Edge, or Brave browser (Web Serial API support)"
echo "  - Meshtastic radio connected via USB"
echo ""
echo "To uninstall and remove all traces:"
echo "  ./uninstall.sh"
echo ""
