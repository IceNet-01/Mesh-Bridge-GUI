#!/bin/bash

# Mesh Bridge - Systemd Service Uninstallation Script
# This script removes the Mesh Bridge systemd service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Mesh Bridge - Service Uninstallation Script     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: This script must be run with sudo${NC}"
    echo "Usage: sudo ./uninstall-service.sh"
    exit 1
fi

SERVICE_FILE="/etc/systemd/system/mesh-bridge.service"

# Check if service exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo -e "${YELLOW}Service file not found. Mesh Bridge service may not be installed.${NC}"
    exit 0
fi

# Stop service
echo -e "${BLUE}[1/4]${NC} Stopping service..."
if systemctl is-active --quiet mesh-bridge.service; then
    systemctl stop mesh-bridge.service
    echo -e "${GREEN}✓${NC} Service stopped"
else
    echo -e "${YELLOW}!${NC} Service was not running"
fi

# Disable service
echo -e "${BLUE}[2/4]${NC} Disabling service..."
if systemctl is-enabled --quiet mesh-bridge.service; then
    systemctl disable mesh-bridge.service
    echo -e "${GREEN}✓${NC} Service disabled (will not start on boot)"
else
    echo -e "${YELLOW}!${NC} Service was not enabled"
fi

# Remove service file
echo -e "${BLUE}[3/4]${NC} Removing service file..."
rm -f "$SERVICE_FILE"
echo -e "${GREEN}✓${NC} Service file removed"

# Reload systemd
echo -e "${BLUE}[4/4]${NC} Reloading systemd daemon..."
systemctl daemon-reload
systemctl reset-failed
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Uninstallation completed successfully!       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Note: This script only removed the systemd service.${NC}"
echo -e "${YELLOW}The Mesh Bridge application files are still in place.${NC}"
echo -e "${YELLOW}You can run it manually with: npm run start${NC}"
echo ""
