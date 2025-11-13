# Radio Integration Guide for Reticulum, RNode, and Mesh Core

This guide shows you exactly where to add support for new radio protocols.

## Quick Reference: Key Integration Points

### 1. Type System Changes

**File**: `src/renderer/types.ts`

Add at the top:

```typescript
// New type for radio protocols
export type RadioProtocol = 'meshtastic' | 'reticulum' | 'rnode' | 'mesh-core';

// Extend Radio interface
export interface Radio {
  id: string;
  port: string;
  name: string;
  protocol: RadioProtocol;              // ADD THIS
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // Generic telemetry (works for all protocols)
  lastSeen?: Date;
  signalStrength?: number;
  batteryLevel?: number;
  voltage?: number;
  
  // Protocol-specific data
  protocolSpecific?: {                   // ADD THIS
    [key: string]: any;
  };
  
  messagesReceived: number;
  messagesSent: number;
  errors: number;
}

// Add protocol-specific types
export interface ReticulumRadio extends Radio {
  protocol: 'reticulum';
  protocolSpecific: {
    destinationHash?: string;
    pubkeyHash?: string;
    syncToken?: string;
  };
}

export interface RNodeRadio extends Radio {
  protocol: 'rnode';
  protocolSpecific: {
    frequencies?: string;
    bandwidth?: string;
    txPower?: number;
  };
}

// ... similar for MeshCore
```

### 2. Backend Server Architecture Changes

**File**: `bridge-server/index.mjs`

**Current Problem**:
```javascript
// HARDCODED - only Meshtastic
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';

class MeshtasticBridgeServer { ... }
```

**What You Need**:

Create protocol abstraction:

```javascript
// bridge-server/protocols/IRadioProtocol.js
export class IRadioProtocol {
  async connect(portPath) { throw new Error('Not implemented'); }
  async disconnect() { throw new Error('Not implemented'); }
  async sendText(text, channel) { throw new Error('Not implemented'); }
  getChannels() { throw new Error('Not implemented'); }
  on(event, callback) { throw new Error('Not implemented'); }
}

// bridge-server/protocols/MeshtasticProtocol.js
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';

export class MeshtasticProtocol extends IRadioProtocol {
  async connect(portPath) {
    this.transport = await TransportNodeSerial.create(portPath, 115200);
    this.device = new MeshDevice(this.transport);
    
    // Subscribe to events
    this.device.events.onMessagePacket.subscribe((packet) => {
      this.emit('message', packet);
    });
    
    await this.device.configure();
  }
  
  async sendText(text, channel) {
    await this.device.sendText(text, "broadcast", false, channel);
  }
  
  on(event, callback) {
    this.eventEmitter.on(event, callback);
  }
}

// bridge-server/protocols/ReticulumProtocol.js
export class ReticulumProtocol extends IRadioProtocol {
  async connect(portPath) {
    // Use Reticulum serial connection
    // this.reticulum = new ReticulumInterface(portPath);
  }
  
  async sendText(text, channel) {
    // Forward via Reticulum
  }
  
  // ... implement required methods
}

// bridge-server/protocols/RNodeProtocol.js
export class RNodeProtocol extends IRadioProtocol {
  // Similar implementation
}

// bridge-server/index.mjs - Main server refactor
class BridgeServer {
  async connectRadio(ws, portPath, protocol = 'meshtastic') {
    const radioProtocol = this.loadProtocol(protocol);
    await radioProtocol.connect(portPath);
    
    radioProtocol.on('message', (packet) => {
      this.handleMessagePacket(radioId, packet);
    });
    
    this.radios.set(radioId, {
      protocol: radioProtocol,
      type: protocol,
      port: portPath
    });
  }
  
  loadProtocol(protocol) {
    switch (protocol) {
      case 'meshtastic':
        return new MeshtasticProtocol();
      case 'reticulum':
        return new ReticulumProtocol();
      case 'rnode':
        return new RNodeProtocol();
      default:
        throw new Error(`Unknown protocol: ${protocol}`);
    }
  }
}
```

### 3. Connection Flow Changes

**File**: `src/renderer/App.tsx` and `src/renderer/store/useStore.ts`

**Current**:
```typescript
const handleConnectRadio = async () => {
  await scanAndConnectRadio();  // Hardcoded assumption
}
```

**Change To**:
```typescript
const [selectedProtocol, setSelectedProtocol] = useState<RadioProtocol>('meshtastic');

const handleConnectRadio = async () => {
  try {
    // Show protocol selector dialog
    const protocol = await showProtocolSelector();
    
    // Connect with protocol
    await manager.connectRadio(portPath, protocol);
  } catch (error) {
    // Handle error
  }
}

// In useStore.ts
connectRadio: async (portPath, protocol = 'meshtastic') => {
  // Send protocol to backend
  manager.send({
    type: 'connect',
    port: portPath,
    protocol: protocol  // NEW
  });
}
```

### 4. WebSocket Protocol Extension

**File**: `bridge-server/index.mjs`

**Add to message types**:
```javascript
// Client → Server
{
  type: 'connect',
  port: '/dev/ttyUSB0',
  protocol: 'meshtastic' | 'reticulum' | 'rnode' | 'mesh-core'  // NEW
}

{
  type: 'send-text',
  radioId: '...',
  text: '...',
  channel: 0,
  protocol?: 'meshtastic'  // Optional override
}

// Server → Client
{
  type: 'radio-connected',
  radio: {
    id: '...',
    protocol: 'reticulum',  // NEW
    port: '...',
    status: 'connected'
  }
}
```

### 5. Message Handling

The message handling logic (`handleMessagePacket`) is mostly protocol-independent:

```javascript
// This works for ANY protocol
handleMessagePacket(radioId, packet) {
  const message = {
    id: packet.id,
    timestamp: packet.rxTime,
    from: packet.from,
    to: packet.to,
    text: packet.text,        // Protocol handler must extract text
    radioId: radioId,
    forwarded: false
  };
  
  // Deduplication (works for all)
  if (this.seenMessageIds.has(packet.id)) return;
  
  // Forwarding (works for all)
  this.forwardToOtherRadios(radioId, packet.text, packet.channel);
}
```

**Key**: Each protocol handler must normalize packets to common format.

### 6. UI Changes (Minimal)

**File**: `src/renderer/components/RadioList.tsx`

Only change needed:

```typescript
function RadioCard({ radio }: RadioCardProps) {
  return (
    <div>
      <h3>{radio.name}</h3>
      <p>Protocol: {radio.protocol}</p>  {/* ADD THIS */}
      <p>Port: {radio.port}</p>
      
      {/* Protocol-specific display */}
      {radio.protocol === 'meshtastic' && radio.nodeInfo && (
        <div>
          <p>Hardware: {radio.nodeInfo.hwModel}</p>
        </div>
      )}
      
      {radio.protocol === 'reticulum' && radio.protocolSpecific?.destinationHash && (
        <div>
          <p>Destination: {radio.protocolSpecific.destinationHash}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Protocol-Specific Implementation Details

### Reticulum

**What You Need to Know**:
- No traditional "channels" - uses destination hashes
- Messages are point-to-point by default
- Requires `rns` (Reticulum Network Stack) or Node.js bindings
- Uses `.rns` protocol files for configuration

**Integration Points**:
1. Create `ReticulumProtocol` class
2. Adapt message format: Reticulum packets → common `Message` format
3. UI: Show destination hash instead of "node ID"
4. Forwarding: Map Reticulum destinations instead of channels

### RNode

**What You Need to Know**:
- Radio firmware by Markus Teich
- Serial protocol similar to Meshtastic but simpler
- Messages are raw packets
- Used in Mesh Core architecture

**Integration Points**:
1. Create `RNodeProtocol` class
2. Serial parsing: decode RNode wire format
3. Message extraction: handle raw byte payloads
4. UI: Show frequency/bandwidth settings instead of channels

### Mesh Core

**What You Need to Know**:
- Middleware system for multiple radio types
- Can coordinate RNode, Meshtastic, Reticulum
- JSON-based config
- Focus on cross-protocol bridging

**Integration Points**:
1. Create `MeshCoreProtocol` class
2. Delegate to appropriate sub-protocol
3. Message translation: handle mixed protocol types
4. Advanced forwarding: cross-protocol routing

---

## Step-by-Step Implementation Plan

### Phase 1: Refactor Meshtastic (Minimal Risk)

1. Create `/bridge-server/protocols/` directory
2. Extract Meshtastic code into `MeshtasticProtocol.js`
3. Create `IRadioProtocol.js` base class
4. Update `MeshtasticBridgeServer` to use protocol abstraction
5. Test: Meshtastic should work exactly as before

**Estimate**: 2-3 hours

### Phase 2: Add Reticulum Support

1. Research Reticulum Node.js bindings
2. Create `ReticulumProtocol.js`
3. Implement connection and message handling
4. Add protocol selection to UI
5. Test with Reticulum node

**Estimate**: 4-6 hours (depends on library availability)

### Phase 3: Add RNode Support

1. Study RNode serial protocol
2. Create `RNodeProtocol.js` with manual packet parsing
3. Implement text extraction from raw packets
4. Add frequency/bandwidth configuration
5. Test with RNode device

**Estimate**: 3-4 hours

### Phase 4: Add Mesh Core Support

1. Create `MeshCoreProtocol.js`
2. Implement protocol detection/delegation
3. Handle mixed-protocol forwarding
4. Test with multiple radio types simultaneously

**Estimate**: 5-6 hours

### Phase 5: Cross-Protocol Features

1. Enhanced bridge routing for mixed protocols
2. Protocol-aware channel matching
3. Message translation/formatting
4. Statistics per protocol type

**Estimate**: 4-5 hours

---

## Testing Checklist

For each protocol implementation:

- [ ] **Connection**: Can connect to device via USB
- [ ] **Configuration**: Can read device settings (if applicable)
- [ ] **Messages**: Can receive text messages
- [ ] **Sending**: Can send text messages
- [ ] **Multiple Devices**: Can connect multiple radios simultaneously
- [ ] **Forwarding**: Can forward messages between radios
- [ ] **UI Display**: Radio appears correctly in UI
- [ ] **Disconnection**: Can cleanly disconnect
- [ ] **Errors**: Handles disconnection/errors gracefully
- [ ] **Statistics**: Message counts are accurate

---

## Common Pitfalls

1. **Assuming channels exist** - Reticulum doesn't have channels
2. **Hardcoding baud rates** - Different protocols use different rates
3. **Text vs binary** - Some protocols require binary encoding
4. **Timing issues** - Different protocols have different timing characteristics
5. **Forwarding loops** - Especially important for cross-protocol

---

## Useful Commands for Testing

```bash
# Run bridge server in debug mode
LOGLEVEL=debug npm run bridge

# Monitor serial port traffic
screen /dev/ttyUSB0 115200

# Test with multiple serial ports
ls /dev/tty* | grep USB

# Monitor WebSocket traffic
# Use browser DevTools → Network → WS filter
```

---

## Files to Create/Modify

```
bridge-server/
├── index.mjs                          (MODIFY: Load protocols)
├── protocols/                         (NEW)
│   ├── IRadioProtocol.js             (NEW: Base class)
│   ├── MeshtasticProtocol.js         (NEW: Extract from index.mjs)
│   ├── ReticulumProtocol.js          (NEW: Add Reticulum support)
│   ├── RNodeProtocol.js              (NEW: Add RNode support)
│   └── MeshCoreProtocol.js           (NEW: Add Mesh Core support)

src/renderer/
├── types.ts                           (MODIFY: Add protocol type)
├── App.tsx                           (MODIFY: Add protocol selector)
├── store/useStore.ts                 (MODIFY: Handle protocol param)
└── components/
    ├── RadioList.tsx                (MODIFY: Show protocol)
    └── ProtocolSelector.tsx          (NEW: Choose protocol)

package.json                           (MODIFY: Add new protocol libs)
```

---

## Key Takeaway

The current codebase is 90% protocol-agnostic. The hard part (UI, forwarding, statistics) will work with any protocol. You just need to:

1. Create a protocol abstraction layer in the backend
2. Implement each protocol's connection/message handling
3. Add a UI selector for protocol type
4. Normalize each protocol's messages to the common `Message` format

That's it. The message forwarding, command system, AI integration, and notifications will all work with any protocol once you've done that.
