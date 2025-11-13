# Mesh Bridge GUI - Radio Implementation Architecture

## Overview

The Mesh Bridge GUI is currently **Meshtastic-only**. It's a web-based relay system that bridges multiple Meshtastic radios with AI capabilities, message forwarding, and command system. The architecture is designed around the official @meshtastic libraries and would need significant refactoring to support multiple radio protocols.

---

## 1. CURRENTLY SUPPORTED RADIO TYPES

### Single Protocol Support: Meshtastic Only
- **Supported Versions**: Meshtastic 2.0+ (using official libraries)
- **Connection Method**: USB Serial Port via Node.js bridge server
- **Libraries Used**:
  - `@meshtastic/core` (v2.6.7) - Protocol handling
  - `@meshtastic/transport-node-serial` (v0.0.2) - Serial communication
  - `serialport` (v13.0.0) - Low-level serial access

**File**: `/home/user/Mesh-Bridge-GUI/package.json` (lines 27-29)

---

## 2. RADIO CONNECTION/CONFIGURATION STRUCTURE

### 2.1 Type Definitions

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/types.ts` (lines 1-21)

```typescript
export interface Radio {
  id: string;                    // Unique identifier (e.g., "radio-1234567890")
  port: string;                  // USB port path (e.g., "/dev/ttyUSB0")
  name: string;                  // Human-readable name
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  
  // Hardware Info (Meshtastic-specific)
  nodeInfo?: {
    nodeId: string;
    longName: string;
    shortName: string;
    hwModel: string;             // Hardware model (e.g., "RAK4631")
  };
  
  // Telemetry
  lastSeen?: Date;
  signalStrength?: number;       // RSSI
  batteryLevel?: number;         // 0-100%
  voltage?: number;
  channelUtilization?: number;
  airUtilTx?: number;
  
  // Statistics
  messagesReceived: number;
  messagesSent: number;
  errors: number;
}
```

### 2.2 Bridge Configuration Structure

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/types.ts` (lines 23-37)

```typescript
export interface BridgeConfig {
  enabled: boolean;
  bridges: BridgeRoute[];
  deduplicationWindow: number;    // seconds
  autoReconnect: boolean;
  reconnectDelay: number;         // milliseconds
  maxReconnectAttempts: number;
}

export interface BridgeRoute {
  id: string;
  sourceRadios: string[];         // Radio IDs
  targetRadios: string[];         // Radio IDs
  enabled: boolean;
}
```

### 2.3 Message Structure

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/types.ts` (lines 39-54)

```typescript
export interface Message {
  id: string;
  timestamp: Date;
  fromRadio: string;              // Which radio received it
  toRadio?: string;               // If forwarded
  from: number;                   // Node ID (sender)
  to: number;                     // Node ID (recipient)
  channel: number;
  portnum: number;                // Message type (1 = TEXT_MESSAGE_APP)
  payload: any;                   // Message content
  forwarded: boolean;
  duplicate: boolean;
  rssi?: number;
  snr?: number;
  hopLimit?: number;
}
```

---

## 3. WHERE RADIO TYPES ARE DEFINED

### 3.1 No Radio Type Enum Currently Exists

**Problem**: The codebase has NO enumeration for radio types. Everything assumes Meshtastic.

- No `RadioType` enum
- No `SupportedProtocol` type
- No protocol-specific interfaces

This is a **critical architectural gap** for multi-protocol support.

### 3.2 Meshtastic Protocol References

**Backend Server**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 1-130)

```javascript
// Protocol hardcoded in server initialization
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MeshDevice } from '@meshtastic/core';

class MeshtasticBridgeServer {
  async connectRadio(ws, portPath) {
    // Line 422: Direct Meshtastic library usage
    const transport = await TransportNodeSerial.create(portPath, 115200);
    const device = new MeshDevice(transport);
    
    // All channel handling is Meshtastic-specific (lines 472-492)
    device.events.onChannelPacket.subscribe((channelPacket) => {
      const channelInfo = {
        index: channelPacket.index,
        role: channelPacket.role,
        name: channelPacket.settings?.name || '',
        psk: channelPacket.settings?.psk ? Buffer.from(channelPacket.settings.psk).toString('base64') : ''
      };
    });
  }
}
```

---

## 4. HOW THE UI HANDLES RADIO SELECTION AND CONFIGURATION

### 4.1 Radio Connection Flow

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/App.tsx` (lines 42-55)

```typescript
// Scan for available ports (generic serial ports)
const handleConnectRadio = async () => {
  await scanAndConnectRadio();  // Hardcoded for Meshtastic
}

// useStore.ts (lines 152-180)
scanAndConnectRadio: async () => {
  const ports = await manager.scanForRadios();  // Calls backend
  
  if (ports.length === 0) {
    throw new Error('No serial ports found. Make sure your Meshtastic radio...');
  }
  
  // Attempts to connect ALL ports as Meshtastic
  const results = await Promise.allSettled(
    ports.map(port => manager.connectRadio(port.path))
  );
}
```

### 4.2 Radio List Component

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/components/RadioList.tsx` (lines 1-177)

```typescript
function RadioList({ radios, onDisconnect }: RadioListProps) {
  // Generic radio display (works for any radio type)
  return (
    <div className="space-y-6">
      <h2>Radio Management</h2>
      <p>Monitor and manage connected Meshtastic radios via bridge server</p>
      
      {radios.map((radio) => (
        <RadioCard key={radio.id} radio={radio} onDisconnect={onDisconnect} />
      ))}
    </div>
  );
}

function RadioCard({ radio }: RadioCardProps) {
  // Displays:
  // - Status (connected/connecting/disconnected/error)
  // - Port and Name
  // - Node info (Meshtastic-specific)
  // - Metrics (battery, channel utilization, message counts)
}
```

### 4.3 Dashboard

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/components/Dashboard.tsx`

- Shows connected radios count
- Displays message statistics
- Shows real-time message rate
- Lists active radios (generic display)

### 4.4 Bridge Configuration

**File**: `/home/user/Mesh-Bridge-GUI/src/renderer/components/BridgeConfiguration.tsx`

- Generic bridge settings (not radio-type-specific)
- Channel matching based on PSK and name (Meshtastic concept)
- Deduplication window
- Auto-reconnect settings

---

## 5. BACKEND/BRIDGE CODE FOR RADIO COMMUNICATION

### 5.1 Architecture

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 1-100)

```
Node.js HTTP Server (port 8080)
    ↓
WebSocket Server
    ↓
MeshtasticBridgeServer class
    ↓
Meshtastic Radio(s) via @meshtastic libraries
```

### 5.2 Core Server Class

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 31-128)

Key properties:
```javascript
class MeshtasticBridgeServer {
  this.radios = new Map();           // radioId -> { device, transport, port, channels }
  this.clients = new Set();          // WebSocket clients
  this.messageHistory = [];          // Cached messages
  
  // Channel forwarding configuration
  this.enableSmartMatching = true;   // Find channels by PSK+name, not index
  this.channelMap = null;            // Alternative: manual index mapping
  
  // Command system (Meshtastic-specific)
  this.commandsEnabled = true;
  this.commandPrefix = '#';
  
  // AI and notifications (protocol-independent)
  this.aiEnabled = false;
  this.emailEnabled = false;
  this.discordEnabled = false;
}
```

### 5.3 Connection Process

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 415-575)

```javascript
async connectRadio(ws, portPath) {
  // 1. Create transport (Meshtastic-specific)
  const transport = await TransportNodeSerial.create(portPath, 115200);
  
  // 2. Create device
  const device = new MeshDevice(transport);
  
  // 3. Subscribe to events (all Meshtastic-specific)
  device.events.onDeviceStatus.subscribe((status) => { ... });
  device.events.onMessagePacket.subscribe((packet) => {
    this.handleMessagePacket(radioId, portPath, packet);
  });
  device.events.onMyNodeInfo.subscribe((myNodeInfo) => {
    radio.nodeNum = myNodeInfo.myNodeNum;
  });
  device.events.onChannelPacket.subscribe((channelPacket) => {
    // Store channel configuration
    radio.channels.set(channelPacket.index, channelInfo);
  });
  
  // 4. Configure device
  await device.configure();
  
  // 5. Set heartbeat to keep connection alive
  device.setHeartbeatInterval(30000);
  
  // 6. Broadcast connection to WebSocket clients
  this.broadcast({
    type: 'radio-connected',
    radio: { id, name, port, status: 'connected' }
  });
}
```

### 5.4 Message Handling

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 606-693)

```javascript
handleMessagePacket(radioId, portPath, packet) {
  // packet structure from @meshtastic/core:
  // {
  //   id, from, to, channel, rxTime, type,
  //   data: string (decoded text for TEXT_MESSAGE_APP)
  // }
  
  // Command detection (Meshtastic-specific prefix)
  if (text.trim().startsWith(this.commandPrefix)) {
    this.handleCommand(radioId, packet.channel, packet.from, text);
    return;
  }
  
  // Deduplication
  if (this.seenMessageIds.has(packet.id)) {
    return;
  }
  
  // Create message object
  const message = {
    id: packet.id,
    timestamp: packet.rxTime instanceof Date ? packet.rxTime : new Date(),
    from: packet.from,
    to: packet.to,
    channel: packet.channel,
    text: text,
    radioId: radioId,
    forwarded: isFromOurBridgeRadio
  };
  
  // Add to history
  this.messageHistory.push(message);
  
  // Broadcast to UI
  this.broadcast({
    type: 'message',
    message: message
  });
  
  // Forward to other radios
  if (!isFromOurBridgeRadio) {
    this.forwardToOtherRadios(radioId, text, packet.channel);
  }
}
```

### 5.5 Message Forwarding (Smart Channel Matching)

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 1415-1524)

```javascript
async forwardToOtherRadios(sourceRadioId, text, channel) {
  // Get source channel info
  const sourceChannel = sourceRadio.channels?.get(channel);
  
  // For each target radio, find matching channel
  for (const [targetRadioId, targetRadio] of otherRadios) {
    // SMART MATCHING: Search ALL channels for PSK+name match
    let matchingChannelIndex = null;
    
    for (const [idx, targetCh] of targetRadio.channels.entries()) {
      // Channels match if PSK is identical AND names match
      const pskMatch = sourceChannel.psk === targetCh.psk;
      const nameMatch = sourceChannel.name === targetCh.name;
      
      if (pskMatch && nameMatch) {
        matchingChannelIndex = idx;
        break;
      }
    }
    
    if (matchingChannelIndex !== null) {
      // Forward to matching channel
      await targetRadio.device.sendText(text, "broadcast", false, matchingChannelIndex);
    }
  }
}
```

### 5.6 Command System

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 698-1160)

Commands: `#ping`, `#help`, `#status`, `#time`, `#uptime`, `#version`, `#weather`, `#radios`, `#channels`, `#stats`, `#nodes`, `#ai`, `#email`, `#discord`, `#notify`

All command handling is protocol-independent once message is received, but command *detection* is Meshtastic text-specific.

### 5.7 WebSocket Message Protocol

**File**: `/home/user/Mesh-Bridge-GUI/bridge-server/index.mjs` (lines 278-363)

Client → Server messages:
```javascript
{
  type: 'list-ports',           // Request available serial ports
  type: 'connect',              // Connect radio { port: '/dev/ttyUSB0' }
  type: 'disconnect',           // Disconnect radio { radioId: '...' }
  type: 'send-text',            // Send message { radioId, text, channel }
  type: 'ping',                 // Keep-alive ping
  
  // AI commands
  type: 'ai-get-config',        // Get AI configuration
  type: 'ai-set-enabled',       // Enable/disable { enabled: true }
  type: 'ai-set-model',         // Set model { model: 'llama3.2:1b' }
  // ... more AI commands
  
  // Communication
  type: 'comm-get-config',      // Get email/Discord config
  type: 'comm-set-email',       // Set email { config: {...} }
  // ... more comm commands
}
```

Server → Client messages:
```javascript
{
  type: 'history',              // Message history on connect
  type: 'radios',               // List of radios
  type: 'radio-connecting',     // Radio connection starting
  type: 'radio-connected',      // Radio ready
  type: 'radio-disconnected',   // Radio disconnected
  type: 'message',              // New message received
  type: 'error',                // Error message
  
  type: 'ai-config',            // AI configuration update
  type: 'ai-status',            // AI service status
  type: 'ai-pull-progress',     // Model download progress
  
  type: 'comm-config',          // Communication config
  type: 'comm-test-result',     // Test result
}
```

---

## 6. CONFIGURATION FILES AND SCHEMAS

### 6.1 package.json (Build Configuration)

**File**: `/home/user/Mesh-Bridge-GUI/package.json`

Dependencies: All Meshtastic-specific
- `@meshtastic/core` - Protocol library
- `@meshtastic/transport-node-serial` - Serial transport
- `serialport` - Low-level serial
- `ws` - WebSocket server
- `nodemailer` - Email notifications
- React, TypeScript, Vite (UI framework)

**Critical Issue**: No abstraction for protocol selection. Radio protocol is hardcoded.

### 6.2 TypeScript Configuration

**File**: `/home/user/Mesh-Bridge-GUI/tsconfig.json`

No special configuration for protocol support.

### 6.3 Vite Configuration

**File**: `/home/user/Mesh-Bridge-GUI/vite.config.ts`

PWA-specific settings, no radio protocol configuration.

### 6.4 No Protocol Configuration Files

**Issues**:
- No `.radioconfig.json` or similar
- No protocol definitions file
- No radio type database
- Settings are hardcoded in server class

---

## SUMMARY: ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/TypeScript)              │
│                                                             │
│  App.tsx → useStore.ts → Components → WebSocketManager     │
│  - Dashboard (generic)                                      │
│  - RadioList (generic)                                      │
│  - BridgeConfiguration (generic + Meshtastic-specific)      │
│  - AISettings, CommunicationSettings (generic)              │
│                                                             │
│  Types: Radio, Message, BridgeConfig (generic)             │
│         Radio.nodeInfo (Meshtastic-specific)               │
└─────────────────────────────────────────────────────────────┘
                         WebSocket (ws://)
┌─────────────────────────────────────────────────────────────┐
│                BACKEND (Node.js Bridge Server)              │
│                                                             │
│  MeshtasticBridgeServer class (hardcoded Meshtastic)        │
│  - Connection: TransportNodeSerial → MeshDevice            │
│  - Events: onMessagePacket, onChannelPacket, etc.          │
│  - Forwarding: Smart channel matching (Meshtastic)          │
│  - Commands: #prefix system (protocol-independent)          │
│  - AI/Email/Discord: (protocol-independent)                │
│                                                             │
│  Libraries: @meshtastic/core, @meshtastic/transport        │
│             serialport, ws, nodemailer                     │
└─────────────────────────────────────────────────────────────┘
                         USB Serial
┌─────────────────────────────────────────────────────────────┐
│                   MESHTASTIC RADIO(S)                       │
│                  (Only Supported Type)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## WHAT NEEDS TO CHANGE FOR MULTI-PROTOCOL SUPPORT

### 1. Type System (Critical)
- Add `RadioType` enum: `'meshtastic' | 'reticulum' | 'rnode' | 'mesh-core'`
- Add protocol-specific interfaces for each radio type
- Extend `Radio` interface to be protocol-aware
- Create `ChannelConfig`, `TelemtryData` interfaces per protocol

### 2. Backend Architecture (Major Refactor)
- Abstract radio communication into protocol plugins
- Create interface: `IRadioProtocol` with methods:
  - `connect(port: string): Promise<void>`
  - `disconnect(): Promise<void>`
  - `sendMessage(text: string, channel?: number): Promise<void>`
  - `getChannels(): ChannelInfo[]`
  - `on(event: string, callback: Function): void`

### 3. Connection Flow (Major Change)
- Detect radio protocol before connecting (auto-detect or user selection)
- Load appropriate protocol handler
- Route all communications through protocol abstraction

### 4. Configuration (New)
- Create `.radioconfig.json` or environment-based config
- Define protocol capabilities per type
- Store radio type with each connection

### 5. Frontend (Minor Changes)
- Add radio type selector in UI
- Conditional UI for protocol-specific features
- Protocol-aware message formatting

### 6. Dependencies (New)
- Reticulum protocol library (if Node.js binding exists)
- RNode protocol implementation
- Mesh Core protocol library

---

## KEY FILES REFERENCE

| File | Lines | Purpose | Meshtastic-Specific |
|------|-------|---------|---------------------|
| `/src/renderer/types.ts` | 1-180 | Type definitions | Radio.nodeInfo only |
| `/src/renderer/App.tsx` | 1-276 | Main UI component | No |
| `/src/renderer/components/RadioList.tsx` | 1-177 | Radio display | No |
| `/src/renderer/store/useStore.ts` | 1-252 | State management | Lines 156-180 (error msg) |
| `/src/renderer/lib/webSocketManager.ts` | 1-697 | Frontend-backend communication | No |
| `/bridge-server/index.mjs` | 1-2114 | Main backend server | **FULLY** |
| `/package.json` | 1-54 | Dependencies | Lines 28-29 |

---

## ROADMAP FOR MULTI-PROTOCOL SUPPORT

1. **Phase 1**: Refactor backend to use protocol abstraction
2. **Phase 2**: Implement each protocol as plugin (Meshtastic refactored first)
3. **Phase 3**: Add protocol detection/selection UI
4. **Phase 4**: Implement Reticulum support
5. **Phase 5**: Implement RNode support
6. **Phase 6**: Implement Mesh Core support
7. **Phase 7**: Cross-protocol bridging (Meshtastic ↔ Reticulum, etc.)

---

## CONCLUSION

The current architecture is **tightly coupled to Meshtastic**. To add support for Reticulum, RNode, and Mesh Core:

1. **Extract protocol handling** from `MeshtasticBridgeServer` into plugins
2. **Create radio type abstraction** in type system
3. **Implement protocol-specific adapters** for each radio type
4. **Minimal UI changes** needed (mostly data display)

The good news: The UI, forwarding logic, command system, and notification system are mostly **protocol-independent** and can remain unchanged.
