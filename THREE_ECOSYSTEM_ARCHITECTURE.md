# Three-Ecosystem Architecture

## Overview

Mesh Bridge GUI is designed to support three independent mesh networking ecosystems, each running as a separate service with its own communication protocol and use cases.

```
┌─────────────────────────────────────────────────────────────────┐
│                       Web GUI (Frontend)                         │
│                   Unified Mesh Interface                         │
└────┬──────────────────────────┬──────────────────────┬──────────┘
     │                          │                      │
     │ HTTP/REST               │ WebSocket            │ WebSocket
     │                          │                      │
┌────▼────────┐         ┌───────▼─────────┐    ┌─────▼──────────┐
│   Bridge    │         │   Reticulum     │    │   MeshCore     │
│   Server    │         │   Service       │    │   Service      │
│  (Node.js)  │         │   (Python)      │    │   (Python)     │
│             │         │                 │    │   [FUTURE]     │
│ Ecosystem 1 │         │  Ecosystem 2    │    │  Ecosystem 3   │
└─────────────┘         └─────────────────┘    └────────────────┘
```

## Three Ecosystems

### 1. Bridge Server Ecosystem (Direct Radio)

**Purpose**: Traditional radio-to-radio communication protocols

**Protocols Supported**:
- Meshtastic (via serial/USB)
- Direct LoRa (via SX127x/SX126x radios)
- Future: APRS, Packet Radio, etc.

**Architecture**:
- Node.js server
- HTTP REST API
- Serial port management
- Direct hardware control

**Use Cases**:
- Meshtastic device integration
- Direct LoRa radio-to-radio messaging
- Hardware-specific features
- Traditional packet radio operations

**Communication**:
```javascript
// Web GUI → Bridge Server (HTTP)
POST /api/radios/send
{
  "radioId": "radio-1",
  "message": "Hello",
  "recipient": "!abc123"
}

// Bridge Server → Web GUI (Server-Sent Events or WebSocket)
{
  "type": "message",
  "protocol": "meshtastic",
  "from": "!abc123",
  "text": "Hello back"
}
```

### 2. Reticulum Ecosystem (LXMF)

**Purpose**: Encrypted mesh networking with LXMF messaging protocol

**Protocols Supported**:
- Reticulum Network Stack (RNS)
- LXMF (Lightweight eXtensible Message Format)
- Compatible with: Sideband, NomadNet, MeshChat

**Architecture**:
- Python service
- WebSocket API
- LXMF message router
- RNode/UDP/TCP transports

**Use Cases**:
- End-to-end encrypted messaging
- Off-grid communication
- Interoperability with other LXMF clients
- Propagation node (store-and-forward)
- Audio calls (codec2)
- File transfers

**Communication**:
```javascript
// Web GUI → Reticulum Service (WebSocket)
{
  "type": "send_message",
  "data": {
    "destination": "abc123...",
    "content": "Hello",
    "title": "Greeting"
  }
}

// Reticulum Service → Web GUI (WebSocket)
{
  "type": "lxmf_message",
  "data": {
    "source": "def456...",
    "content": "Hello back",
    "timestamp": 1234567890
  }
}
```

### 3. MeshCore Ecosystem (Future)

**Purpose**: MeshCore-specific mesh networking

**Protocols Supported**:
- MeshCore protocol (to be documented)
- Custom addressing/routing

**Architecture** (Planned):
- Python service
- WebSocket API
- MeshCore protocol handler
- Transport management

**Use Cases**:
- MeshCore-specific features
- MeshCore network integration
- Future: Cross-ecosystem bridging

**Communication** (Planned):
```javascript
// Web GUI → MeshCore Service (WebSocket)
{
  "type": "send_message",
  "data": {
    "destination": "meshcore-address",
    "content": "Hello"
  }
}

// MeshCore Service → Web GUI (WebSocket)
{
  "type": "message",
  "data": {
    "source": "meshcore-address",
    "content": "Hello back"
  }
}
```

## Comparison Matrix

| Feature | Bridge Server | Reticulum | MeshCore |
|---------|--------------|-----------|-----------|
| **Language** | Node.js | Python | Python (future) |
| **Communication** | HTTP/REST | WebSocket | WebSocket (future) |
| **Protocols** | Meshtastic, LoRa | RNS, LXMF | MeshCore (future) |
| **Use Case** | Direct radio control | Encrypted mesh | MeshCore network |
| **Interoperability** | Protocol-specific | LXMF ecosystem | MeshCore ecosystem |
| **Transport** | Serial, USB | RNode, UDP, TCP, I2P | TBD |
| **Encryption** | Protocol-dependent | Built-in (RNS) | TBD |
| **Identity** | Per-protocol | Cryptographic | TBD |
| **Status** | ✅ Active | ✅ Implementing | 📋 Planned |

## Service Independence

Each ecosystem runs as an **independent service**:

### Benefits:

1. **Separation of Concerns**
   - Each service focuses on its ecosystem
   - Clear boundaries and responsibilities
   - Easier to develop and maintain

2. **Reliability**
   - One service failure doesn't affect others
   - Independent restart and recovery
   - No cross-service initialization blocking

3. **Scalability**
   - Services can be scaled independently
   - Run on different machines if needed
   - Optimize per-service resources

4. **Maintainability**
   - Simpler codebases
   - Clear API boundaries
   - Easier to debug and test

5. **Extensibility**
   - Add new protocols to appropriate service
   - Services evolve independently
   - Easy to add new ecosystems

## Auto-Start Configuration

All services start together with the main application:

```javascript
// start.mjs
import { spawn } from 'child_process';

async function startMeshBridgeGUI() {
  console.log('🚀 Starting Mesh Bridge GUI...\n');

  // 1. Start Bridge Server (Meshtastic, LoRa)
  console.log('📡 Starting Bridge Server...');
  const bridgeServer = spawn('node', ['bridge-server/index.mjs'], {
    stdio: 'inherit'
  });

  // 2. Start Reticulum Service (LXMF)
  console.log('🔐 Starting Reticulum Service...');
  const reticulumService = spawn('python3', ['reticulum-service/reticulum_service.py'], {
    stdio: 'inherit'
  });

  // 3. MeshCore Service (future)
  // console.log('🌐 Starting MeshCore Service...');
  // const meshcoreService = spawn('python3', ['meshcore-service/meshcore_service.py'], {
  //   stdio: 'inherit'
  // });

  // 4. Start Web GUI
  console.log('🌐 Starting Web Interface...');
  const webServer = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit'
  });

  console.log('\n✅ All services started!');
  console.log('   Bridge Server: http://localhost:3000/api');
  console.log('   Reticulum WS:  ws://localhost:4243');
  console.log('   Web GUI:       http://localhost:5173');
}

startMeshBridgeGUI();
```

## Web GUI Integration

### Unified Interface

The web GUI provides a single interface for all ecosystems:

```
┌─────────────────────────────────────────────┐
│  Mesh Bridge GUI                      [⚙️]  │
├─────────────────────────────────────────────┤
│  [📡 Radios] [🔐 Reticulum] [🌐 MeshCore]  │
├─────────────────────────────────────────────┤
│                                             │
│  [Current ecosystem view]                   │
│                                             │
│  - Network status                           │
│  - Chat interface                           │
│  - Contacts/Peers                           │
│  - Configuration                            │
│                                             │
└─────────────────────────────────────────────┘
```

### Tab Structure

#### 📡 Radios Tab (Bridge Server)
- Connected radios list
- Meshtastic devices
- Direct LoRa radios
- Radio configuration
- Radio-to-radio messaging

#### 🔐 Reticulum Tab (Reticulum Service)
- LXMF messaging interface
- Known destinations/peers
- Propagation node status
- Transport configuration
- Audio calls
- File transfers

#### 🌐 MeshCore Tab (Future)
- MeshCore network status
- MeshCore messaging
- MeshCore-specific features

### Client Implementation

```javascript
// src/services/bridgeClient.js - HTTP client for Bridge Server
export class BridgeClient {
  async sendMessage(radioId, message, recipient) {
    return fetch('/api/radios/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radioId, message, recipient })
    });
  }
}

// src/services/reticulumClient.js - WebSocket client for Reticulum
export class ReticulumClient {
  constructor() {
    this.ws = new WebSocket('ws://localhost:4243');
    this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
  }

  sendMessage(destination, content, title) {
    this.ws.send(JSON.stringify({
      type: 'send_message',
      data: { destination, content, title }
    }));
  }
}

// src/services/meshcoreClient.js - WebSocket client for MeshCore (future)
export class MeshCoreClient {
  constructor() {
    this.ws = new WebSocket('ws://localhost:4244');
    // ... similar to ReticulumClient
  }
}
```

## Future: Ecosystem Bridging

Once all three ecosystems are stable, we can implement **cross-ecosystem message bridging**:

```
┌──────────────┐
│ Meshtastic   │─┐
│  Message     │ │
└──────────────┘ │
                 │    ┌─────────────────┐
                 ├───>│  Bridge Layer   │
                 │    │  (Translation)  │
┌──────────────┐ │    └─────────────────┘
│  Reticulum   │─┤             │
│  LXMF Msg    │ │             ▼
└──────────────┘ │    ┌─────────────────┐
                 │    │  All Ecosystems │
┌──────────────┐ │    └─────────────────┘
│  MeshCore    │─┘
│  Message     │
└──────────────┘
```

### Bridge Features (Future):

- [ ] Address mapping between ecosystems
- [ ] Message format translation
- [ ] Delivery confirmation across ecosystems
- [ ] Contact unification
- [ ] Bridge mode toggle (on/off per ecosystem)
- [ ] Routing rules and filters

## Directory Structure

```
Mesh-Bridge-GUI/
│
├── bridge-server/              # Ecosystem 1: Direct Radio
│   ├── index.mjs              # Bridge server main
│   ├── protocols/
│   │   ├── MeshtasticProtocol.mjs
│   │   └── LoRaProtocol.mjs
│   └── package.json
│
├── reticulum-service/          # Ecosystem 2: Reticulum/LXMF
│   ├── reticulum_service.py   # Main service
│   ├── requirements.txt       # Python deps
│   └── README.md
│
├── meshcore-service/           # Ecosystem 3: MeshCore (future)
│   ├── meshcore_service.py    # Main service (future)
│   ├── requirements.txt       # Python deps (future)
│   └── README.md              # Placeholder
│
├── src/                        # Web GUI
│   ├── components/
│   │   ├── RadioNetworks/     # Bridge Server UI
│   │   ├── ReticulumNetwork/  # Reticulum UI
│   │   └── MeshCoreNetwork/   # MeshCore UI (future)
│   ├── services/
│   │   ├── bridgeClient.js    # HTTP client
│   │   ├── reticulumClient.js # WebSocket client
│   │   └── meshcoreClient.js  # WebSocket client (future)
│   └── App.jsx                # Main app
│
├── start.mjs                   # Startup script (launches all)
├── package.json
├── THREE_ECOSYSTEM_ARCHITECTURE.md  # This document
└── RETICULUM_ARCHITECTURE_PROPOSAL.md
```

## Development Phases

### ✅ Phase 1: Foundation (Current)
- [x] Bridge server for Meshtastic/LoRa
- [x] Basic web GUI
- [x] Radio protocol abstractions

### 🚧 Phase 2: Reticulum Integration (In Progress)
- [x] Create reticulum-service structure
- [x] Implement LXMF messaging
- [x] WebSocket protocol
- [ ] Web GUI Reticulum tab
- [ ] Testing and refinement

### 📋 Phase 3: MeshCore Foundation (Planned)
- [ ] Research MeshCore protocol
- [ ] Create meshcore-service structure
- [ ] Define WebSocket protocol
- [ ] Implement basic messaging
- [ ] Web GUI MeshCore tab

### 🔮 Phase 4: Ecosystem Bridging (Future)
- [ ] Design bridge protocol
- [ ] Address mapping system
- [ ] Message translation layer
- [ ] Unified contact management
- [ ] Bridge configuration UI

## Key Principles

1. **Independence**: Each ecosystem is self-contained
2. **Simplicity**: Clear separation of concerns
3. **Reliability**: Services fail and restart independently
4. **Interoperability**: Use standard protocols where possible
5. **Extensibility**: Easy to add new ecosystems or features
6. **User Choice**: Users choose which ecosystems to use

## Conclusion

This three-ecosystem architecture provides:

- **Flexibility**: Support multiple mesh networking approaches
- **Reliability**: Independent services for better stability
- **Maintainability**: Clear boundaries and responsibilities
- **Future-Ready**: Easy to add features and ecosystems
- **User-Friendly**: Unified interface for all ecosystems

The architecture treats each ecosystem as a first-class citizen while maintaining the ability to bridge between them in the future.
