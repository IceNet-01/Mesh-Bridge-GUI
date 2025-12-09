#!/bin/bash

# Mesh Bridge Production Uninstallation Script
# This script removes the Mesh Bridge systemd service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Mesh Bridge - Uninstallation                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Error: Do not run this script as root${NC}"
    echo "Run as your normal user - the script will prompt for sudo when needed"
    exit 1
fi

# Check if service exists
if [ ! -f "/etc/systemd/system/mesh-bridge.service" ]; then
    echo -e "${YELLOW}Mesh Bridge service is not installed${NC}"
    exit 0
fi

echo -e "${YELLOW}This will:${NC}"
echo "  • Stop the Mesh Bridge service"
echo "  • Disable auto-start on boot"
echo "  • Remove the systemd service file"
echo ""
read -p "Continue? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Uninstallation cancelled"
    exit 0
fi

echo ""
echo -e "${BLUE}[1/4]${NC} Stopping Mesh Bridge service..."
sudo systemctl stop mesh-bridge.service || true
echo -e "${GREEN}✓ Service stopped${NC}"
echo ""

echo -e "${BLUE}[2/4]${NC} Disabling auto-start on boot..."
sudo systemctl disable mesh-bridge.service || true
echo -e "${GREEN}✓ Auto-start disabled${NC}"
echo ""

echo -e "${BLUE}[3/4]${NC} Removing service file..."
sudo rm -f /etc/systemd/system/mesh-bridge.service
echo -e "${GREEN}✓ Service file removed${NC}"
echo ""

echo -e "${BLUE}[4/4]${NC} Reloading systemd..."
sudo systemctl daemon-reload
echo -e "${GREEN}✓ Systemd reloaded${NC}"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Uninstallation Complete!                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} Project files and configuration remain in place."
echo "To run Mesh Bridge again, use: ${YELLOW}bash scripts/install.sh${NC}"
echo ""
