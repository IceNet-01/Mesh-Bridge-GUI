# Meshtastic Protocol Implementation Comparison

## Executive Summary

**Problem:** The GUI version is manually implementing the Meshtastic serial protocol, which is complex and error-prone. The headless version uses the official library.

**Root Cause:** Messages aren't appearing because manual protobuf parsing is incomplete/incorrect.

**Solution:** Use the official @meshtastic/js library properly instead of raw Web Serial API.

---

## Headless Version (WORKING) ✅

### Architecture

```
Python App
    ↓
meshtastic library (PyPI)
    ↓
SerialInterface class
    ↓
USB Serial Port (pyserial)
    ↓
Meshtastic Radio
```

### Connection Code

```python
# Simple, library handles everything
interface = meshtastic.serial_interface.SerialInterface(port, debugOut=None)
time.sleep(2)

# Subscribe to messages
pub.subscribe(self._on_receive_radio1, "meshtastic.receive")
```

### Message Reception

```python
def _handle_message(self, packet, source, target_interface):
    # Packet arrives fully parsed with properties:
    message_id = packet['id']
    from_id = packet['fromId']
    to_id = packet['toId']
    channel = packet['channel']
    portnum = packet['decoded']['portnum']

    # Text is already extracted:
    if portnum == 'TEXT_MESSAGE_APP':
        payload = packet['decoded']['payload']
        text = payload.decode('utf-8', errors='ignore')

        # Forward to other radio:
        target_interface.sendText(text)
```

### What the Library Does

1. ✅ Opens serial port with correct settings
2. ✅ Sends initialization handshake (wantConfigId)
3. ✅ Receives and buffers serial data
4. ✅ Parses Meshtastic protocol (magic byte 0x94, length, index)
5. ✅ Decodes protobuf messages (FromRadio, MyInfo, NodeInfo, etc.)
6. ✅ Extracts message fields (from, to, channel, portnum, text)
7. ✅ Publishes events via pubsub
8. ✅ Handles all message types (TEXT, POSITION, TELEMETRY, etc.)
9. ✅ Manages acknowledgments
10. ✅ Handles retries and errors

---

## GUI Version (NOT WORKING) ❌

### Architecture

```
React App
    ↓
WebSerialRadioManager (custom)
    ↓
Manual Protocol Implementation
    ↓
Web Serial API
    ↓
USB Serial Port
    ↓
Meshtastic Radio
```

### Connection Code

```typescript
// Manual implementation
await port.open({ baudRate: 115200 });
const reader = port.readable?.getReader();
const writer = port.writable?.getWriter();

// Manual initialization packet
const configId = Date.now() % 0xFFFFFFFF;
const payload = [tag1, tag2, ...varintEncodedId];
const packet = new Uint8Array([0x94, lengthHi, lengthLo, 0, ...payload]);
await writer.write(packet);
```

### Message Reception

```typescript
// Manual parsing - INCOMPLETE!
private handleIncomingData(radioId: string, data: Uint8Array) {
  // Look for magic byte 0x94
  // Extract length (16-bit big-endian)
  // Extract packet index
  // Extract payload
  // Try to find text in payload with heuristics ❌
}

private extractPossibleText(data: Uint8Array): string | null {
  // Manually search for length-delimited fields (wire type 2)
  // Decode varint length
  // Check if bytes are printable ASCII
  // Return longest match
  // PROBLEM: This doesn't properly parse protobuf structure!
}
```

### What's Missing

1. ❌ No proper protobuf decoder
2. ❌ No FromRadio message type detection
3. ❌ No distinction between MyInfo, NodeInfo, Text messages
4. ❌ Text extraction is guesswork (looking for "printable bytes")
5. ❌ No handling of nested protobuf fields
6. ❌ No decoding of sender/recipient node IDs
7. ❌ No channel detection
8. ❌ No portnum filtering
9. ❌ Text might be in `data.payload.text` or `data.payload.data.text`
10. ❌ Messages might be encrypted

---

## Key Differences

| Feature | Headless (Python) | GUI (TypeScript) |
|---------|-------------------|------------------|
| **Library** | ✅ meshtastic 2.7.0+ | ❌ Manual implementation |
| **Protocol Parsing** | ✅ Complete | ❌ Partial/incorrect |
| **Message Types** | ✅ All types supported | ❌ Only guessing text |
| **Protobuf Decoding** | ✅ Full decoder | ❌ Heuristic search |
| **Event System** | ✅ pubsub | ✅ EventEmitter (ok) |
| **Initialization** | ✅ Library handles | ⚠️ Manual wantConfigId |
| **Text Extraction** | ✅ `packet['decoded']['payload']` | ❌ Search for printable bytes |

---

## Why Messages Aren't Showing

The GUI receives data from the radio (confirmed: "getting lots of data"), but:

1. **Protobuf parsing is incomplete**: The code searches for "printable ASCII bytes" instead of properly parsing the protobuf structure

2. **Message structure unknown**: Meshtastic messages can be:
   ```
   FromRadio {
     id: number
     packet: MeshPacket {
       from: number
       to: number
       channel: number
       decoded: Data {
         portnum: PortNum
         payload: bytes  // Could be text OR binary data
       }
     }
   }
   ```

3. **Text might be nested**: The actual text could be in:
   - `FromRadio.packet.decoded.payload` (as UTF-8 bytes)
   - `FromRadio.packet.decoded.data` (another layer)
   - Encrypted and needs decryption

4. **No message type filtering**: The code doesn't check if `portnum == TEXT_MESSAGE_APP` before trying to extract text

---

## The Solution: Use @meshtastic/js

### Why Previous Attempt Failed

From the conversation history:
```
Error: npm ERR! notarget No matching version found for @meshtastic/js@^2.3.0
```

This was due to:
- ❌ Using wrong version specifier
- ❌ JSR dependency not in npm registry
- ⚠️ Package complexity with browser vs Node.js

### Proper Implementation Path

#### Option 1: Use @meshtastic/js with HTTP Connection (Recommended)

The library supports both serial and HTTP connections. For browsers, HTTP is easier:

```typescript
import { Client, Types } from "@meshtastic/js";

// Connect via HTTP (requires Meshtastic firmware 2.0+)
const client = new Client();
const httpConnection = client.createHTTPConnection();

await httpConnection.connect({
  address: "192.168.x.x", // Radio's IP address
  fetchInterval: 2000,
  tls: false
});

// Listen for messages
httpConnection.events.onMessagePacket.subscribe((message) => {
  if (message.portnum === Types.PortNum.TEXT_MESSAGE_APP) {
    const text = new TextDecoder().decode(message.payload);
    console.log(`Received: ${text}`);
  }
});
```

**Pros:**
- ✅ No Web Serial API needed
- ✅ Works in any browser
- ✅ Library handles all protocol details
- ✅ Supports multiple radios easily

**Cons:**
- ⚠️ Requires radio to be on network (WiFi/Ethernet)
- ⚠️ Not all radios have HTTP API enabled

#### Option 2: Use @meshtastic/js with Node.js Serial Bridge

Run a tiny Node.js bridge locally that uses @meshtastic/js with serial, expose via WebSocket to the PWA.

```typescript
// bridge-server.ts (Node.js)
import { Client } from "@meshtastic/js";
import WebSocket from 'ws';

const client = new Client();
const serial = client.createSerialConnection();

await serial.connect({ serialPath: "/dev/ttyUSB0" });

const wss = new WebSocket.Server({ port: 8080 });

serial.events.onMessagePacket.subscribe((message) => {
  wss.clients.forEach((ws) => {
    ws.send(JSON.stringify(message));
  });
});
```

```typescript
// PWA connects to localhost:8080
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Message is fully parsed!
};
```

**Pros:**
- ✅ Library handles all protocol details
- ✅ Works with USB radios
- ✅ Clean separation of concerns

**Cons:**
- ⚠️ Requires local Node.js process running
- ⚠️ More complex setup

#### Option 3: Fix Manual Implementation (Not Recommended)

To make the current approach work, you would need to:

1. Implement full protobuf decoder (complex!)
2. Parse FromRadio message types
3. Distinguish MyInfo, NodeInfo, MeshPacket, etc.
4. Properly extract nested fields
5. Handle encryption/decryption
6. Filter by portnum

This is essentially reimplementing the entire @meshtastic/js library.

---

## Recommended Next Steps

### Immediate Fix

1. **Try @meshtastic/js with HTTP connection first** (if radios support it)
   - Simplest path to working solution
   - No USB/serial complexity

2. **If HTTP not available, implement Node.js bridge**
   - Still uses official library
   - Keeps PWA architecture
   - Clean message passing

### Long-term Solution

Create a proper integration:
- PWA UI remains the same
- Backend: Either HTTP directly or Node.js serial bridge
- Use official @meshtastic/js library for all protocol handling
- Focus GUI development on UX, not protocol implementation

---

## Example: Proper Message Flow with Library

```typescript
import { Client, Types } from "@meshtastic/js";

const client = new Client();
const connection = client.createHTTPConnection(); // or createSerialConnection() in Node

await connection.connect({ address: "192.168.1.100" });

// Listen for text messages - THIS IS ALL YOU NEED!
connection.events.onMessagePacket.subscribe((packet) => {
  if (packet.portnum === Types.PortNum.TEXT_MESSAGE_APP) {
    const text = new TextDecoder().decode(packet.payload);

    const message: Message = {
      id: packet.id.toString(),
      timestamp: new Date(packet.rxTime * 1000),
      from: packet.from,
      to: packet.to,
      channel: packet.channel,
      portnum: packet.portnum,
      payload: { text },
      forwarded: false,
      duplicate: false
    };

    // Display in UI
    this.messages.set(message.id, message);
    this.emit('message-received', { radioId, message });
  }
});

// Forward to another radio
await connection.sendText("Hello mesh!", channelId);
```

**That's it!** No manual protocol parsing needed.

---

## Conclusion

The headless version works because it uses the official Meshtastic library. The GUI version doesn't work because it tries to manually implement a complex protocol.

**Bottom line:** Stop fighting the protocol. Use the library. It's what it's designed for.
