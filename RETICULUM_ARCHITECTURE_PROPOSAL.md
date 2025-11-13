# Reticulum Architecture Proposal

## Problem Statement

Current architecture tries to integrate Reticulum as "just another protocol" in the bridge server. This is fundamentally wrong because:

1. **Reticulum is a complete network stack** - not a simple radio protocol
2. **Complex initialization** - Network discovery, transport probing, routing can take minutes
3. **Different abstraction level** - Reticulum manages its own transports, routing, and addressing
4. **Timeout issues** - Deep integration causes startup delays and initialization failures

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Web GUI (Frontend)                        │
│         (React/Vue - Unified Interface)                      │
└──────────┬──────────────────────────────────────┬───────────┘
           │                                      │
           │ HTTP/REST                           │ WebSocket
           │ (Radio control)                     │ (LXMF Messages)
           │                                      │
┌──────────▼────────────┐              ┌─────────▼────────────┐
│  Bridge Server        │              │ Reticulum Service    │
│  (Node.js)            │              │ (Python)             │
│                       │              │                      │
│  - Meshtastic         │              │  - RNS Stack         │
│  - LoRa (direct)      │              │  - LXMF Protocol     │
│  - Future protocols   │              │  - WebSocket Server  │
│                       │              │  - Message Storage   │
│  Manages:             │              │  - Audio Calls       │
│  - Serial connections │              │                      │
│  - Radio configs      │              │  Manages:            │
│  - Direct messaging   │              │  - Own transports    │
└───────────────────────┘              │  - RNode devices     │
                                       │  - UDP/TCP links     │
                                       │  - Routing           │
                                       │  - Propagation nodes │
                                       └──────────────────────┘
```

### Service Separation

#### 1. **Bridge Server** (Existing - Keep & Refine)
- **Purpose**: Manage traditional radio protocols
- **Protocols**: Meshtastic, Direct LoRa, Future additions
- **Communication**: HTTP REST API
- **Responsibilities**:
  - Serial port management
  - Radio configuration
  - Direct radio-to-radio messaging
  - Device discovery and management

#### 2. **Reticulum Service** (New - Based on MeshChat)
- **Purpose**: Standalone Reticulum/LXMF messaging system
- **Architecture**: Python + WebSocket server (like MeshChat)
- **Communication**: WebSocket for real-time LXMF messages
- **Responsibilities**:
  - RNS stack initialization and management
  - LXMF message routing
  - Identity management
  - Transport management (RNode, UDP, TCP)
  - Propagation node sync
  - Audio calls (codec2)
  - File attachments

#### 3. **Web GUI** (Enhanced)
- **Purpose**: Unified interface for both systems
- **Tabs/Views**:
  - **Radio Networks**: Meshtastic, LoRa (via Bridge Server)
  - **Reticulum Network**: LXMF messaging (via Reticulum Service)
  - **Future**: Cross-ecosystem bridge controls
- **Features**:
  - Dual protocol support in one interface
  - Separate chat windows for each ecosystem
  - Unified contact management
  - Network status for both systems

## Implementation Based on MeshChat

### Core Architecture (from MeshChat)

```python
# reticulum_service.py
class ReticulumService:
    """
    Standalone Reticulum service with WebSocket interface
    Based on liamcottle/reticulum-meshchat architecture
    """

    def __init__(self):
        # Initialize RNS
        self.reticulum = RNS.Reticulum()

        # Initialize LXMF
        self.message_router = LXMF.LXMRouter()
        self.message_router.register_delivery_callback(self.on_message)

        # Create identity
        self.identity = self.load_or_create_identity()
        self.lxmf_destination = self.message_router.register_delivery_identity(
            self.identity
        )

        # WebSocket server
        self.ws_server = websockets.serve(
            self.handle_websocket,
            "localhost",
            4243
        )

    async def handle_websocket(self, websocket, path):
        """Handle WebSocket connections from web GUI"""
        # Send/receive LXMF messages as JSON
        pass

    def on_message(self, lxm):
        """Received LXMF message - send to web GUI via WebSocket"""
        pass
```

### WebSocket Protocol (JSON Messages)

```javascript
// From Web GUI to Reticulum Service
{
  "type": "send_message",
  "data": {
    "destination": "abc123...",  // LXMF address
    "content": "Hello!",
    "attachments": [...]  // Optional
  }
}

// From Reticulum Service to Web GUI
{
  "type": "message_received",
  "data": {
    "from": "def456...",
    "content": "Hi there!",
    "timestamp": 1234567890,
    "rssi": -95,
    "snr": 8.5
  }
}

{
  "type": "announce",
  "data": {
    "destination": "abc123...",
    "identity_hash": "...",
    "app_data": "User display name"
  }
}
```

## Auto-Start Integration

### Current Behavior (Preserved)
```javascript
// bridge-server/index.mjs - Keep existing radio protocol startup
async initialize() {
  // Start bridge server for Meshtastic, LoRa, etc.
  await this.startBridgeServer();

  // NEW: Start Reticulum service in parallel
  await this.startReticulumService();
}
```

### New Startup Script
```javascript
// Start both services
class MeshBridgeApplication {
  async start() {
    // 1. Start bridge server for radios (existing)
    this.bridgeServer = spawn('node', ['bridge-server/index.mjs']);

    // 2. Start Reticulum service (new)
    this.reticulumService = spawn('python3', ['reticulum_service.py']);

    // 3. Start web frontend
    this.webServer = spawn('npm', ['run', 'dev']);

    console.log('✅ All services started');
    console.log('   - Bridge Server: http://localhost:3000');
    console.log('   - Reticulum WS: ws://localhost:4243');
  }
}
```

## Migration Path

### Phase 1: Create Reticulum Service (Week 1)
- [ ] Create `reticulum_service.py` based on MeshChat architecture
- [ ] Implement WebSocket server for web GUI communication
- [ ] LXMF message send/receive
- [ ] Identity management
- [ ] Basic transport configuration (UDP, TCP)

### Phase 2: Update Web GUI (Week 2)
- [ ] Add WebSocket client for Reticulum service
- [ ] Create "Reticulum Network" tab/view
- [ ] LXMF chat interface
- [ ] Contact list from announces
- [ ] Network status display

### Phase 3: RNode Integration (Week 3)
- [ ] Auto-detect RNode devices (keep existing detection)
- [ ] Present choice to user: "Add RNode to Bridge or Reticulum?"
- [ ] Add RNode as Reticulum transport (via service)
- [ ] Display RNode in appropriate network view

### Phase 4: Clean Up Bridge Server (Week 4)
- [ ] Remove `ReticulumProtocol.mjs` from bridge server
- [ ] Remove `rns_bridge.py` (replaced by reticulum_service.py)
- [ ] Update documentation
- [ ] Simplify bridge server to focus on radio protocols

### Phase 5: Future - Ecosystem Bridge (Future)
- [ ] Design message bridge protocol
- [ ] Map LXMF addresses to Meshtastic IDs
- [ ] Implement message translation layer
- [ ] Add "Bridge Mode" toggle in GUI
- [ ] Cross-ecosystem contact discovery

## Key Benefits

### 1. **Separation of Concerns**
- Bridge server: Simple radio protocol management
- Reticulum service: Complete network stack with proper initialization
- Each service can be developed, tested, and scaled independently

### 2. **Reliability**
- Reticulum initialization doesn't block radio protocols
- Services can restart independently
- No more timeout issues

### 3. **Better User Experience**
- Choose your ecosystem: Radios, Reticulum, or both
- Proper LXMF messaging features (not hacked together)
- Compatible with other LXMF clients (Sideband, NomadNet)

### 4. **Maintainability**
- Simpler code in each service
- Clear boundaries and responsibilities
- Easier to debug

### 5. **Extensibility**
- Easy to add more radio protocols to bridge server
- Easy to enhance Reticulum features in separate service
- Future: Bridge between ecosystems

## File Structure

```
Mesh-Bridge-GUI/
├── bridge-server/           # Radio protocol management
│   ├── index.mjs           # Bridge server (Meshtastic, LoRa)
│   ├── protocols/
│   │   ├── MeshtasticProtocol.mjs
│   │   ├── LoRaProtocol.mjs
│   │   └── (remove ReticulumProtocol.mjs)
│   └── package.json
│
├── reticulum-service/       # NEW: Standalone Reticulum
│   ├── reticulum_service.py # Main service (based on MeshChat)
│   ├── lxmf_handler.py     # LXMF message management
│   ├── websocket_server.py # WebSocket communication
│   ├── identity_manager.py # Identity/key management
│   ├── config.json         # Service configuration
│   ├── requirements.txt    # Python dependencies
│   └── README.md
│
├── src/                    # Web GUI (React/Vue)
│   ├── components/
│   │   ├── RadioNetworks/  # Bridge server UI
│   │   └── ReticulumNetwork/ # NEW: Reticulum UI
│   ├── services/
│   │   ├── bridgeClient.js # HTTP client for bridge
│   │   └── reticulumClient.js # NEW: WebSocket client
│   └── App.jsx
│
├── start.mjs              # Startup script (launches all services)
└── package.json
```

## Questions for Discussion

1. **RNode Assignment**: When an RNode is detected, should we:
   - Let user choose which system to add it to?
   - Auto-add to both (if possible)?
   - Prefer one over the other?

2. **Message Bridge**: Priority for future bridging?
   - High priority: Work on it in Phase 5?
   - Low priority: Focus on perfecting each ecosystem first?

3. **UI Layout**: Preferred approach?
   - Separate tabs (Radio Networks | Reticulum Network)?
   - Unified chat view with protocol badges?
   - Split screen view?

4. **Identity Management**: Should bridge and Reticulum share any identity concepts?
   - Keep completely separate?
   - Display name synchronization?

## Next Steps

1. ✅ **Review this proposal** - Discuss architectural decisions
2. **Create reticulum-service/** - Set up new service structure
3. **Implement WebSocket protocol** - Define message formats
4. **Build minimal LXMF client** - Basic send/receive
5. **Update web GUI** - Add Reticulum tab
6. **Test integration** - Verify both services work together
7. **Clean up bridge server** - Remove Reticulum code

## References

- [Reticulum MeshChat](https://github.com/liamcottle/reticulum-meshchat) - Architecture inspiration
- [LXMF Protocol](https://github.com/markqvist/LXMF) - Messaging format
- [NomadNet](https://github.com/markqvist/NomadNet) - Terminal LXMF client
- [Sideband](https://github.com/markqvist/Sideband) - Mobile LXMF client
- [Reticulum Manual](https://markqvist.github.io/Reticulum/manual/) - Official docs
