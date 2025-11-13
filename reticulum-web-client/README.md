# Standalone Reticulum Web Client

A lightweight, standalone web interface for Reticulum LXMF messaging.

## Features

- ✅ **Direct WebSocket connection** to Reticulum service (no React complexity)
- ✅ **Standalone server** - runs independently from main bridge app
- ✅ **Simple HTML/CSS/JS** - easy to debug and customize
- ✅ **LXMF messaging** - send/receive encrypted messages
- ✅ **Peer discovery** - see other Reticulum nodes
- ✅ **Custom destinations** - message any Reticulum destination
- ✅ **Debug console** - real-time connection logs

## Quick Start

### 1. Start Reticulum Service

Make sure the Reticulum service is running on port 4243:

```bash
cd ..
python3 reticulum-service/reticulum_service.py
```

### 2. Start Web Client Server

```bash
cd reticulum-web-client
python3 server.py
```

### 3. Open in Browser

```
http://localhost:5555
```

Or from another device on your network:
```
http://<your-ip>:5555
```

## Usage

### Connect to Reticulum

1. The WebSocket URL is auto-detected: `ws://localhost:4243`
2. Click **"Connect"** button
3. Wait for status to show "Connected"

### Send Messages

1. Select a peer from the "Known Peers" list, OR
2. Enter a custom destination hash
3. Type your message
4. Click **"Send Message"** or press Enter

### Announce Your Presence

Click the **"Announce"** button to broadcast your identity to the network.

## Configuration

### Change Server Port

```bash
python3 server.py --port 8888
```

### Bind to Specific Interface

```bash
python3 server.py --host 192.168.1.100 --port 5555
```

### Change WebSocket URL

If your Reticulum service is on a different host/port:

1. Edit the WebSocket URL in the connection settings
2. Click "Connect"

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Web Browser    │────────>│  Python Server   │         │  Reticulum  │
│  (localhost:    │  HTTP   │  (localhost:     │         │  Service    │
│   5555)         │<────────│   5555)          │         │  (port:4243)│
└─────────────────┘         └──────────────────┘         └─────────────┘
         │                                                        ▲
         │              WebSocket (ws://localhost:4243)          │
         └────────────────────────────────────────────────────────┘
```

## Files

```
reticulum-web-client/
├── server.py              # Simple HTTP server
├── static/
│   ├── index.html        # Main UI
│   ├── style.css         # Styling
│   └── app.js            # WebSocket client logic
└── README.md             # This file
```

## Troubleshooting

### Connection Refused

**Problem:** WebSocket shows "Connection refused"

**Solution:**
1. Check Reticulum service is running: `ps aux | grep reticulum_service`
2. Check port 4243 is listening: `lsof -i :4243`
3. Restart Reticulum service if needed

### No Peers Discovered

**Problem:** Peers list is empty

**Solution:**
1. Click "Announce" button to broadcast your presence
2. Wait for other nodes to announce (can take 1-10 minutes)
3. Check RNS config has AutoInterface enabled
4. Verify you're on the same network as other Reticulum nodes

### Cannot Access from Network

**Problem:** Can't access from other devices

**Solution:**
1. Check firewall allows port 5555
2. Server binds to 0.0.0.0 by default (should work)
3. Use your machine's actual IP, not localhost

## Crosstalk with Main Bridge App

To communicate with the main Mesh Bridge GUI:

### Option 1: Shared Reticulum Service

Both apps connect to the same Reticulum service (port 4243). They automatically share:
- Identity
- LXMF messages
- Peer discoveries

### Option 2: REST API (Future)

Add API endpoints to `server.py` for:
- Message forwarding between Reticulum and Meshtastic
- Unified peer list
- Shared configuration

## Development

### Add New Features

Edit `static/app.js` to add new functionality:

```javascript
// Example: Add file attachment support
handleFileAttachment() {
    // Your code here
}
```

### Customize Styling

Edit `static/style.css` to change the look:

```css
/* Example: Change theme color */
.header {
    background: linear-gradient(135deg, #custom-color 0%, #another-color 100%);
}
```

## License

Part of the Mesh Bridge GUI project.
