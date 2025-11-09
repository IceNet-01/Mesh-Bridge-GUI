#!/bin/bash

# Meshtastic Bridge GUI - Easy Installer
# Supports Linux and macOS

set -e

echo "========================================="
echo "  Meshtastic Bridge GUI - Installer"
echo "========================================="
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "Detected OS: $OS ($ARCH)"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required."
    echo "Current version: $(node -v)"
    echo "Please upgrade from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) found"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed."
    echo "Please install git first."
    exit 1
fi

echo "✅ Git found"
echo ""

# Installation directory
INSTALL_DIR="$HOME/meshtastic-bridge-gui"

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
    echo "📦 Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "📦 Cloning repository..."
    git clone https://github.com/IceNet-01/Mesh-Bridge-GUI.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building application..."
npm run build

echo ""
echo "📦 Creating distributable package..."
npm run package

echo ""
echo "========================================="
echo "  ✅ Installation Complete!"
echo "========================================="
echo ""

# Find the built application
if [ "$OS" = "Linux" ]; then
    APP_PATH="$INSTALL_DIR/release/Meshtastic Bridge GUI-*.AppImage"
    if ls $APP_PATH 1> /dev/null 2>&1; then
        APP_FILE=$(ls $APP_PATH | head -1)
        chmod +x "$APP_FILE"
        echo "Application built: $APP_FILE"
        echo ""
        echo "To run the application:"
        echo "  $APP_FILE"
        echo ""
        echo "To create a desktop shortcut:"
        echo "  1. Copy the AppImage to ~/Applications or /opt"
        echo "  2. Right-click and select 'Allow as Program'"
        echo "  3. Double-click to run"
    fi
elif [ "$OS" = "Darwin" ]; then
    APP_PATH="$INSTALL_DIR/release/mac/Meshtastic Bridge GUI.app"
    if [ -d "$APP_PATH" ]; then
        echo "Application built: $APP_PATH"
        echo ""
        echo "To run the application:"
        echo "  open '$APP_PATH'"
        echo ""
        echo "To install to Applications folder:"
        echo "  cp -r '$APP_PATH' /Applications/"
    fi
fi

echo ""
echo "📚 For more information, see the README.md"
echo ""
