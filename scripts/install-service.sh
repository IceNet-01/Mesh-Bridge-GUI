#!/bin/bash

# Meshtastic Bridge Service Installation Script
# This script installs the bridge as a systemd service that starts on boot

set -e

echo "🚀 Meshtastic Bridge Service Installer"
echo "======================================"
echo ""

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run with sudo"
  echo "   Usage: sudo npm run service:install"
  exit 1
fi

# Get the actual user (not root when using sudo)
ACTUAL_USER="${SUDO_USER:-$USER}"
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "📋 Installation Details:"
echo "   User: $ACTUAL_USER"
echo "   Install Directory: $INSTALL_DIR"
echo "   Service Port: 8080"
echo ""

# Check if dist/ directory exists
if [ ! -d "$INSTALL_DIR/dist" ]; then
  echo "⚠️  Warning: dist/ directory not found"
  echo "   Building frontend..."
  cd "$INSTALL_DIR"
  sudo -u "$ACTUAL_USER" npm run build
  echo "✅ Frontend built successfully"
  echo ""
fi

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"
chown "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR/logs"
echo "✅ Created logs directory"

# Make cleanup script executable
chmod +x "$INSTALL_DIR/scripts/cleanup-ports.sh"
echo "✅ Made cleanup script executable"

# Create service file from template
SERVICE_FILE="/etc/systemd/system/meshtastic-bridge.service"
cp "$INSTALL_DIR/meshtastic-bridge.service" "$SERVICE_FILE"

# Replace placeholders in service file
sed -i "s|%USER%|$ACTUAL_USER|g" "$SERVICE_FILE"
sed -i "s|%INSTALL_DIR%|$INSTALL_DIR|g" "$SERVICE_FILE"

echo "✅ Created systemd service file"

# Add user to dialout group (for serial port access)
if ! groups "$ACTUAL_USER" | grep -q dialout; then
  usermod -a -G dialout "$ACTUAL_USER"
  echo "✅ Added $ACTUAL_USER to dialout group"
  echo "   ⚠️  You may need to log out and back in for group changes to take effect"
else
  echo "✅ User already in dialout group"
fi

# Reload systemd daemon
systemctl daemon-reload
echo "✅ Reloaded systemd daemon"

# Enable service to start on boot
systemctl enable meshtastic-bridge.service
echo "✅ Enabled service to start on boot"

echo ""
echo "🎉 Installation complete!"
echo ""
echo "📝 Service Management Commands:"
echo "   Start:   sudo systemctl start meshtastic-bridge"
echo "   Stop:    sudo systemctl stop meshtastic-bridge"
echo "   Restart: sudo systemctl restart meshtastic-bridge"
echo "   Status:  sudo systemctl status meshtastic-bridge"
echo "   Logs:    sudo journalctl -u meshtastic-bridge -f"
echo ""
echo "Or use npm scripts:"
echo "   npm run service:start"
echo "   npm run service:stop"
echo "   npm run service:restart"
echo "   npm run service:status"
echo "   npm run service:logs"
echo ""
echo "🌐 Access the GUI at: http://localhost:8080"
echo ""
echo "To start the service now, run: sudo systemctl start meshtastic-bridge"
