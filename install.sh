#!/bin/bash

# Meshtastic Bridge GUI - Complete Installer
# This script installs all dependencies and sets up the application

set -e

echo "=================================="
echo "Meshtastic Bridge GUI - Installer"
echo "=================================="
echo ""

# Function to install Node.js using nvm
install_nodejs() {
    echo "Installing Node.js 20 LTS..."

    # Install nvm if not present
    if ! command -v nvm &> /dev/null; then
        echo "Installing nvm (Node Version Manager)..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash

        # Load nvm
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    # Install Node.js LTS
    nvm install 20
    nvm use 20
    nvm alias default 20

    echo "✓ Node.js $(node -v) installed successfully"
}

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js is not installed"
    echo ""
    read -p "Would you like to install Node.js 20 LTS automatically? (yes/no): " -r
    echo ""

    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        install_nodejs
    else
        echo "❌ Node.js is required. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "⚠️  Node.js version must be 18 or higher (current: $(node -v))"
        echo ""
        read -p "Would you like to upgrade to Node.js 20 LTS? (yes/no): " -r
        echo ""

        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            install_nodejs
        else
            echo "❌ Please upgrade Node.js manually from https://nodejs.org/"
            exit 1
        fi
    else
        echo "✓ Node.js $(node -v) detected"
    fi
fi

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

# Add to PATH
echo "Adding mesh-bridge command to PATH..."

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create ~/.local/bin if it doesn't exist
mkdir -p "$HOME/.local/bin"

# Create wrapper script that points to the project
cat > "$HOME/.local/bin/mesh-bridge" << LAUNCHER
#!/bin/bash
cd "$PROJECT_DIR"
npm run dev
LAUNCHER

chmod +x "$HOME/.local/bin/mesh-bridge"
echo "✓ Created mesh-bridge command in ~/.local/bin/"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "⚠️  Note: ~/.local/bin is not in your PATH"
    echo ""
    echo "Add this line to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then reload your shell:"
    echo "  source ~/.bashrc  # or source ~/.zshrc"
    echo ""
    PATH_ADDED="partial"
else
    echo "✓ ~/.local/bin is already in PATH"
    PATH_ADDED="yes"
fi

echo ""
echo "=================================="
echo "✓ Installation Complete!"
echo "=================================="
echo ""
if [ "$PATH_ADDED" = "yes" ]; then
    echo "To start the application from anywhere:"
    echo "  mesh-bridge"
    echo ""
    echo "Or from this directory:"
    echo "  npm run dev"
else
    echo "To start the application:"
    echo "  npm run dev"
    echo ""
    echo "Or after adding ~/.local/bin to PATH:"
    echo "  mesh-bridge"
fi
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
