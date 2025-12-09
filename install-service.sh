#!/bin/bash

# Mesh Bridge - Systemd Service Installation Script
# This script installs Mesh Bridge as a systemd service that runs on boot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Mesh Bridge - Service Installation Script      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: This script must be run with sudo${NC}"
    echo "Usage: sudo ./install-service.sh"
    exit 1
fi

# Get the actual user (not root if using sudo)
if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER="$SUDO_USER"
else
    ACTUAL_USER=$(whoami)
fi

# Get the installation directory (where this script is located)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INSTALL_DIR="$SCRIPT_DIR"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Service User: $ACTUAL_USER"
echo "  Install Directory: $INSTALL_DIR"
echo ""

# Check if package.json exists
if [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}ERROR: package.json not found in $INSTALL_DIR${NC}"
    echo "Make sure you're running this script from the Mesh Bridge directory."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "$INSTALL_DIR/node_modules" ]; then
    echo -e "${RED}ERROR: node_modules not found. Please run 'npm install' first.${NC}"
    exit 1
fi

# Check if dist folder exists
if [ ! -d "$INSTALL_DIR/dist" ]; then
    echo -e "${YELLOW}WARNING: dist folder not found. Running build...${NC}"
    sudo -u "$ACTUAL_USER" npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: Build failed. Please check the errors above.${NC}"
        exit 1
    fi
fi

# Create service file with correct paths
echo -e "${BLUE}[1/5]${NC} Creating service file..."
SERVICE_FILE="/etc/systemd/system/mesh-bridge.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Mesh Bridge - Meshtastic Relay Station
Documentation=https://github.com/IceNet-01/Mesh-Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run bridge
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓${NC} Service file created: $SERVICE_FILE"

# Set proper permissions
echo -e "${BLUE}[2/5]${NC} Setting permissions..."
chmod 644 "$SERVICE_FILE"
echo -e "${GREEN}✓${NC} Permissions set"

# Reload systemd
echo -e "${BLUE}[3/5]${NC} Reloading systemd daemon..."
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

# Enable service
echo -e "${BLUE}[4/5]${NC} Enabling service..."
systemctl enable mesh-bridge.service
echo -e "${GREEN}✓${NC} Service enabled (will start on boot)"

# Start service
echo -e "${BLUE}[5/5]${NC} Starting service..."
systemctl start mesh-bridge.service
sleep 2
echo -e "${GREEN}✓${NC} Service started"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Installation completed successfully!      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Show service status
echo -e "${BLUE}Service Status:${NC}"
systemctl status mesh-bridge.service --no-pager -l

echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  View logs:       sudo journalctl -u mesh-bridge.service -f"
echo "  Stop service:    sudo systemctl stop mesh-bridge.service"
echo "  Start service:   sudo systemctl start mesh-bridge.service"
echo "  Restart service: sudo systemctl restart mesh-bridge.service"
echo "  Service status:  sudo systemctl status mesh-bridge.service"
echo "  Disable service: sudo systemctl disable mesh-bridge.service"
echo ""
echo -e "${GREEN}Mesh Bridge is now running as a system service!${NC}"
echo -e "${GREEN}It will automatically start on system reboot.${NC}"
echo ""
