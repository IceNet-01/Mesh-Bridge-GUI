#!/bin/bash

# Mesh Bridge GUI - Update Script
# This script updates the application to the latest version from git

set -e  # Exit on error

echo "🔄 Mesh Bridge GUI Update Script"
echo "================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "📂 Project directory: $PROJECT_DIR"
echo ""

# Check if git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not a git repository"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Current version: $CURRENT_VERSION"
echo ""

# Fetch latest changes
echo "🔍 Fetching latest changes from remote..."
git fetch origin

# Check if there are updates available
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
BASE=$(git merge-base @ @{u} 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
    echo "⚠️  Warning: No upstream branch configured"
    echo "   Pulling from current branch..."
else
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "✅ Already up to date!"
        echo ""
        exit 0
    elif [ "$LOCAL" = "$BASE" ]; then
        echo "📥 Updates available, pulling changes..."
    elif [ "$REMOTE" = "$BASE" ]; then
        echo "⚠️  Warning: Local changes detected"
        echo "   Stashing local changes before update..."
        git stash push -m "Auto-stash before update $(date +%Y-%m-%d_%H:%M:%S)"
    else
        echo "⚠️  Warning: Branches have diverged"
        echo "   Stashing local changes and pulling..."
        git stash push -m "Auto-stash before update $(date +%Y-%m-%d_%H:%M:%S)"
    fi
fi

echo ""

# Pull latest changes
echo "⬇️  Pulling latest changes..."
git pull origin $(git rev-parse --abbrev-ref HEAD)

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "📦 New version: $NEW_VERSION"
echo ""

# Install dependencies if package.json changed
if git diff HEAD@{1} HEAD --name-only | grep -q "package.json\|package-lock.json"; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if build is needed (if src files changed)
if git diff HEAD@{1} HEAD --name-only | grep -q "src/\|vite.config"; then
    echo "🏗️  Building application..."
    npm run build
    echo ""
fi

echo "✅ Update completed successfully!"
echo ""
echo "📊 Summary:"
echo "   Old version: $CURRENT_VERSION"
echo "   New version: $NEW_VERSION"
echo ""

# If running as systemd service, it will auto-restart
if systemctl is-active --quiet meshtastic-bridge; then
    echo "🔄 Restarting service..."
    sudo systemctl restart meshtastic-bridge
    echo "✅ Service restarted"
else
    echo "⚠️  Please restart the bridge server manually to apply changes"
    echo "   Run: npm run bridge"
fi

echo ""
echo "✨ Update complete!"
