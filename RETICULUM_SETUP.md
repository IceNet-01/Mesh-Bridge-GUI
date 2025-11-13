# Reticulum Network Stack Setup

This guide will help you set up the Reticulum Network Stack (RNS) for software-only operation with the Mesh Bridge GUI.

## What is Reticulum?

Reticulum is a cryptography-based networking stack for wide-area networks built on readily available hardware. It enables you to build secure mesh networks without requiring centralized infrastructure.

**Official website:** https://reticulum.network/

## Installation

### Prerequisites

- Python 3.7 or higher
- pip (Python package installer)

### Install Reticulum

Choose one of the following methods:

#### Option 1: Using pip (Recommended)
```bash
pip install rns
```

#### Option 2: Using pip3
```bash
pip3 install rns
```

#### Option 3: System-wide installation
```bash
sudo pip3 install rns
```

### Verify Installation

After installation, verify that RNS is installed correctly:

```bash
python3 -c "import RNS; print(f'RNS version: {RNS.__version__}')"
```

You should see output like: `RNS version: 0.7.5` (version may vary)

## Using Reticulum with Mesh Bridge

### Software-Only Mode (No Hardware Required)

1. **Start the Mesh Bridge GUI** (ensure the bridge server is running)

2. **Navigate to the Reticulum tab** in the GUI

3. **Click "Connect Software-Only Reticulum"**
   - This will start the Python RNS bridge
   - No physical RNode hardware is required
   - Uses TCP/UDP networking instead of radio

4. **Configure Cross-Protocol Bridging** (Optional)
   - Go to the Configuration tab
   - Enable "Cross-Protocol Bridge"
   - Toggle "Meshtastic → Reticulum" to forward Meshtastic messages to Reticulum
   - Toggle "Reticulum → Meshtastic" to forward Reticulum messages to Meshtastic

### With Physical RNode Hardware

If you have physical RNode hardware:

1. **Connect your RNode device** via USB

2. **Click "Connect Radio"** in the sidebar

3. **Select your RNode device** from the list

4. The system will auto-detect the RNode protocol

## Configuration

### Default Configuration

Reticulum will create a default configuration on first run at:
- Linux/macOS: `~/.reticulum/`
- Windows: `%USERPROFILE%\.reticulum\`

### Identity Management

Your Reticulum identity (cryptographic keys) will be automatically generated and stored:
- Location: `~/.reticulum/bridge_identity`
- This identity is persistent across sessions
- **Keep this file secure** - it contains your private key

### Network Interfaces

By default, Reticulum will use:
- **AutoInterface**: Automatically discovers other Reticulum nodes on local network
- **UDP Interface**: For internet-based communication
- **TCP Server/Client**: For persistent connections

You can customize these in: `~/.reticulum/config`

## Cross-Protocol Bridging

### Meshtastic ↔ Reticulum Bridge

The Mesh Bridge can forward messages between Meshtastic (LoRa) and Reticulum networks:

1. **Connect both protocols:**
   - Connect a Meshtastic radio
   - Connect Reticulum (software or hardware)

2. **Configure channel mapping:**
   - Edit bridge server configuration
   - Map Meshtastic channels to Reticulum destination hashes
   ```javascript
   meshtasticChannelToReticulumMap: {
     0: "abc123def456...",  // Channel 0 → Reticulum destination
     1: "xyz789uvw012..."   // Channel 1 → Different destination
   }
   ```

3. **Enable bridging in GUI:**
   - Configuration tab → Cross-Protocol Bridging
   - Toggle desired direction

## Troubleshooting

### "ModuleNotFoundError: No module named 'RNS'"

**Solution:** Install RNS using one of the installation commands above.

### "Timeout waiting for Python RNS initialization"

**Possible causes:**
1. RNS is not installed
2. Python is not in PATH
3. Configuration error

**Solutions:**
1. Verify RNS installation: `python3 -c "import RNS"`
2. Check Python version: `python3 --version` (must be 3.7+)
3. Check bridge server logs for detailed error messages

### "Failed to start Python bridge"

**Solution:**
1. Ensure Python 3 is installed: `python3 --version`
2. Verify the script exists: `ls bridge-server/rns_bridge.py`
3. Check file permissions: `chmod +x bridge-server/rns_bridge.py`

### Connection works but no messages

**Possible causes:**
1. No other Reticulum nodes on the network
2. Firewall blocking UDP/TCP ports
3. Destination not announced

**Solutions:**
1. Check if announce packets are being sent (should auto-announce every 10 minutes)
2. Manually trigger announce in Reticulum tab
3. Verify firewall allows UDP on default RNS ports

## Advanced Configuration

### Custom RNS Config Path

You can specify a custom RNS configuration directory:

Edit `bridge-server/index.mjs`:
```javascript
options: {
  rnsConfigPath: '/path/to/custom/config'
}
```

### Custom Identity Path

Specify a custom identity file location:
```javascript
options: {
  identityPath: '/path/to/custom/identity'
}
```

## Use Cases

### 1. Extend Meshtastic Range via Internet
- Bridge LoRa Meshtastic mesh to Reticulum
- Use Reticulum's internet transport
- Messages travel globally via internet + LoRa locally

### 2. Protocol Testing
- Test Reticulum without hardware
- Develop applications using RNS
- Simulate mesh networks

### 3. Hybrid Mesh Networks
- Combine LoRa (Meshtastic) for local coverage
- Use Reticulum TCP/UDP for internet backbone
- Best of both worlds: local resilience + global reach

## Resources

- **Reticulum Documentation:** https://markqvist.github.io/Reticulum/manual/
- **RNS GitHub:** https://github.com/markqvist/Reticulum
- **Community Forum:** https://github.com/markqvist/Reticulum/discussions
- **Mesh Bridge GUI:** This application

## Support

For issues specific to the Mesh Bridge GUI integration, please report at:
https://github.com/[your-repo]/Mesh-Bridge-GUI/issues

For Reticulum-specific questions, visit the official RNS community channels.
