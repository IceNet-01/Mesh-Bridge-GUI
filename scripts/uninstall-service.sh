#!/bin/bash

# Meshtastic Bridge Service Uninstallation Script

set -e

echo "🗑️  Meshtastic Bridge Service Uninstaller"
echo "========================================"
echo ""

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run with sudo"
  echo "   Usage: sudo npm run service:uninstall"
  exit 1
fi

SERVICE_FILE="/etc/systemd/system/meshtastic-bridge.service"

# Check if service exists
if [ ! -f "$SERVICE_FILE" ]; then
  echo "⚠️  Service not installed"
  exit 0
fi

# Stop service if running
if systemctl is-active --quiet meshtastic-bridge; then
  echo "🛑 Stopping service..."
  systemctl stop meshtastic-bridge
  echo "✅ Service stopped"
fi

# Disable service
if systemctl is-enabled --quiet meshtastic-bridge 2>/dev/null; then
  echo "🔓 Disabling service..."
  systemctl disable meshtastic-bridge
  echo "✅ Service disabled"
fi

# Remove service file
rm -f "$SERVICE_FILE"
echo "✅ Removed service file"

# Reload systemd daemon
systemctl daemon-reload
systemctl reset-failed
echo "✅ Reloaded systemd daemon"

echo ""
echo "🎉 Service uninstalled successfully!"
echo ""
echo "Note: This does not remove the application files or logs."
echo "To completely remove everything, delete the installation directory."
