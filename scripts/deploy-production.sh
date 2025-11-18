#!/bin/bash

# Production Deployment Script for Mesh Bridge GUI
# This script builds and optionally starts the production server

set -e  # Exit on error

echo "🚀 Mesh Bridge GUI - Production Deployment"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Step 1: Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Step 2: Build the application
echo -e "${BLUE}🔨 Building production bundle...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build completed successfully!${NC}"
    echo ""
else
    echo -e "${RED}❌ Build failed. Please check the errors above.${NC}"
    exit 1
fi

# Step 3: Verify dist directory
if [ -d "dist" ]; then
    echo -e "${GREEN}📂 Distribution directory verified:${NC}"
    ls -lh dist/
    echo ""
else
    echo -e "${RED}❌ dist/ directory not found after build!${NC}"
    exit 1
fi

# Step 4: Show deployment options
echo -e "${YELLOW}🎯 Deployment Options:${NC}"
echo ""
echo "1. Manual start:       node bridge-server/index.mjs"
echo "2. Using npm:          npm run production"
echo "3. Install service:    sudo npm run service:install"
echo "4. Start service:      sudo npm run service:start"
echo ""

# Step 5: Ask if user wants to start the server
read -p "Do you want to start the production server now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🚀 Starting production server...${NC}"
    echo ""

    # Check if port 8080 is in use
    if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port 8080 is already in use.${NC}"
        read -p "Kill existing process and continue? (y/N): " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}Stopping process on port 8080...${NC}"
            lsof -ti:8080 | xargs kill -9 2>/dev/null || true
            sleep 2
        else
            echo -e "${YELLOW}Deployment complete. Server not started.${NC}"
            exit 0
        fi
    fi

    echo -e "${GREEN}✅ Starting server on http://0.0.0.0:8080${NC}"
    echo ""
    echo "Access locally:    http://localhost:8080"
    echo "Access on LAN:     http://YOUR_IP:8080"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""

    node bridge-server/index.mjs
else
    echo -e "${GREEN}✅ Production build complete!${NC}"
    echo ""
    echo "To start the server later, run:"
    echo "  node bridge-server/index.mjs"
    echo ""
fi
