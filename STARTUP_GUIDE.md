# Mesh Bridge GUI - Startup Guide

## Quick Start

Start everything with a single command:

```bash
npm start
```

This launches all services automatically:

## Running Services

### 1. Bridge Server (Meshtastic, LoRa)
- **Port**: 8080
- **Purpose**: Meshtastic radio bridge and API
- **Access**: http://localhost:8080

### 2. Reticulum Service (LXMF Backend)
- **Port**: 4243 (WebSocket)
- **Purpose**: Reticulum Network Stack backend with LXMF messaging
- **Protocol**: WebSocket (ws://localhost:4243)
- **Identity**: Persistent in `~/.reticulum/identities/meshbridge`

### 3. Reticulum Web Client (Standalone LXMF UI)
- **Port**: 5555
- **Purpose**: Dedicated web interface for LXMF encrypted messaging
- **Access**: http://localhost:5555
- **Features**:
  - LXMF encrypted messaging
  - Peer discovery
  - Custom destination messaging
  - Compatible with Sideband, NomadNet, MeshChat

### 4. Main Web GUI (React App)
- **Port**: 5173
- **Purpose**: Main dashboard for Meshtastic bridge management
- **Access**: http://localhost:5173
- **Features**:
  - Meshtastic radio management
  - Message monitoring
  - Bridge configuration
  - AI assistant
  - Communication settings
  - System logs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Mesh Bridge GUI                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   Bridge     │  │  Reticulum   │  │   MeshCore       │ │
│  │   Server     │  │   Service    │  │   (Future)       │ │
│  │ (Meshtastic) │  │    (LXMF)    │  │                  │ │
│  │   Port 8080  │  │  Port 4243   │  │                  │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Web Interfaces                         │   │
│  │  ┌──────────────────┐  ┌──────────────────┐        │   │
│  │  │ Main React GUI   │  │ LXMF Web Client  │        │   │
│  │  │   Port 5173      │  │   Port 5555      │        │   │
│  │  └──────────────────┘  └──────────────────┘        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Network Access

All services bind to `0.0.0.0`, allowing access from:

- **Localhost**: http://localhost:PORT
- **LAN**: http://<your-ip>:PORT
- **WAN**: Requires port forwarding (configure in your router)

## Using the LXMF Web Client

1. Open http://localhost:5555
2. Click "Connect" (auto-connects to ws://localhost:4243)
3. Click "Announce" to broadcast your presence
4. Wait for peers to appear (1-10 minutes on active networks)
5. Select a peer or enter a custom destination
6. Send encrypted LXMF messages

## Interoperability

The LXMF messages are compatible with:

- **Sideband** (Android/iOS mobile app)
- **NomadNet** (Terminal-based client)
- **MeshChat** (Alternative web client)

All LXMF clients can communicate with each other over Reticulum.

## RNode Configuration

For physical LoRa mesh connectivity, edit the Reticulum config:

```bash
nano ~/.reticulum/config
```

Enable RNode interface and configure for your hardware:

```ini
[[RNode LoRa Interface]]
  type = RNodeInterface
  enabled = yes
  port = /dev/ttyACM0
  frequency = 915000000    # 915 MHz (US), 868 MHz (EU)
  bandwidth = 125000       # 125 kHz
  txpower = 17             # 17 dBm
  spreadingfactor = 9      # SF9
  codingrate = 6           # CR 4/6
```

Restart the service:

```bash
npm start
```

## Troubleshooting

### Services Not Starting

Check Python dependencies:

```bash
pip3 install -r reticulum-service/requirements.txt
```

### Port Already in Use

Check for conflicting processes:

```bash
lsof -i :8080 -i :4243 -i :5555 -i :5173
```

Kill old processes:

```bash
killall node python3
```

### LXMF Web Client Not Connecting

1. Verify Reticulum service is running: `lsof -i :4243`
2. Check browser console for errors (F12)
3. Try the test page: Open `test-reticulum-ws.html` in browser

### No Peers Discovered

1. Click "Announce" button
2. Wait 1-10 minutes for other nodes
3. Verify RNS config has AutoInterface enabled
4. Check you're on the same network as other Reticulum nodes

## Development

### Start Individual Services

```bash
# Bridge server only
node bridge-server/index.mjs

# Reticulum service only
python3 reticulum-service/reticulum_service.py

# LXMF web client only
cd reticulum-web-client && python3 server.py --port 5555

# React GUI only (development mode)
npm run dev
```

### Build for Production

```bash
npm run build
```

## Shutdown

Press `Ctrl+C` in the terminal running `npm start`.

All services will gracefully shut down.

## Files and Directories

```
Mesh-Bridge-GUI/
├── start.mjs                    # Unified startup script
├── bridge-server/               # Meshtastic bridge
│   └── index.mjs
├── reticulum-service/           # Reticulum/LXMF backend
│   ├── reticulum_service.py
│   └── requirements.txt
├── reticulum-web-client/        # Standalone LXMF UI
│   ├── server.py
│   └── static/
│       ├── index.html
│       ├── style.css
│       └── app.js
├── src/                         # Main React GUI source
│   └── renderer/
│       ├── App.tsx
│       ├── components/
│       └── lib/
│           └── reticulumClient.ts  # For future bridging
└── ~/.reticulum/                # Reticulum config & identity
    ├── config
    └── identities/
        └── meshbridge
```

## Support

- **Issues**: https://github.com/IceNet-01/Mesh-Bridge-GUI/issues
- **Reticulum Docs**: https://markqvist.github.io/Reticulum/manual/
- **LXMF Spec**: https://github.com/markqvist/LXMF

---

**Version**: 2.0.0
**Architecture**: Three-Ecosystem (Bridge, Reticulum, MeshCore)
**Last Updated**: 2025-11-13
