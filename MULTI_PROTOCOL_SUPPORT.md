# Multi-Protocol Radio Support

The Mesh Bridge GUI now supports multiple radio protocols, allowing you to bridge communications between different radio types including Meshtastic, Reticulum, RNode, and Mesh Core radios.

## Supported Protocols

### 1. **Meshtastic** (Default)
- Full support for Meshtastic 2.0+ devices
- Uses official `@meshtastic/core` and `@meshtastic/transport-node-serial` libraries
- Supports all Meshtastic features including channels, encryption, and telemetry

### 2. **Reticulum**
- Support for Reticulum Network Stack (RNS)
- Two connection modes:
  - **Direct Serial**: For RNode hardware running in Reticulum mode
  - **Python Bridge**: Integrates with Python RNS stack via stdio
- Uses destination-based routing instead of channels
- Identity-based addressing with announce packets

### 3. **RNode**
- Support for RNode LoRa packet radios
- Direct serial protocol implementation
- Configurable radio parameters (frequency, bandwidth, spreading factor, etc.)
- Simple packet-based communication

### 4. **Mesh Core**
- Meta-protocol that can auto-detect and coordinate multiple underlying protocols
- Provides cross-protocol routing and message translation
- Supports switching between protocols dynamically
- Configuration-driven protocol selection

## Architecture

### Protocol Abstraction Layer

All protocol handlers extend the `BaseProtocol` class which provides:

```javascript
class BaseProtocol extends EventEmitter {
  async connect()             // Connect to radio device
  async disconnect()          // Disconnect from device
  async sendMessage(text, channel, options)  // Send text message
  getChannels()               // Get available channels/destinations
  getNodeInfo()               // Get node information
  getProtocolMetadata()       // Get protocol-specific metadata
  normalizeMessagePacket()    // Convert protocol-specific packets to common format
  channelsMatch()             // Determine if channels match for forwarding
}
```

### Event System

All protocols emit standard events:
- `message` - New message received (normalized format)
- `nodeInfo` - Node information updated
- `channels` - Channel/destination list updated
- `telemetry` - Telemetry data updated
- `error` - Error occurred

### Message Normalization

Each protocol handler normalizes incoming messages to a common format:

```javascript
{
  id: string,             // Unique message ID
  timestamp: Date,        // Message timestamp
  from: number,           // Sender address
  to: number,             // Recipient address
  channel: number,        // Channel index or destination
  portnum: number,        // Port number (normalized to 1 for text)
  text: string,           // Message text
  rssi: number?,          // Signal strength (if available)
  snr: number?,           // Signal-to-noise ratio (if available)
  hopLimit: number?       // Hop limit (if available)
}
```

## Usage

### Connecting to a Radio

#### Via WebSocket API

```javascript
// Connect to Meshtastic radio (default)
await webSocketManager.connectRadio('/dev/ttyUSB0');

// Connect to Reticulum radio
await webSocketManager.connectRadio('/dev/ttyUSB0', 'reticulum');

// Connect to RNode radio
await webSocketManager.connectRadio('/dev/ttyUSB0', 'rnode');

// Connect with auto-detection via Mesh Core
await webSocketManager.connectRadio('/dev/ttyUSB0', 'meshcore');
```

#### Via Bridge Server (Backend)

The bridge server automatically uses the protocol abstraction:

```javascript
// WebSocket message format
{
  "type": "connect",
  "port": "/dev/ttyUSB0",
  "protocol": "meshtastic"  // or "reticulum", "rnode", "meshcore"
}
```

### Mesh Core Configuration

Create a `meshcore.json` file to configure Mesh Core behavior:

```json
{
  "protocol": "meshtastic",    // Preferred protocol (or use autoDetect)
  "autoDetect": true,           // Auto-detect protocol if not specified
  "meshtastic": {
    "baudRate": 115200,
    "heartbeatInterval": 30000
  },
  "reticulum": {
    "useDirectSerial": false,
    "pythonBridge": "rns_bridge.py",
    "rnsConfigPath": "/home/user/.reticulum"
  },
  "rnode": {
    "frequency": 915000000,
    "bandwidth": 125000,
    "spreadingFactor": 7,
    "codingRate": 5,
    "txPower": 17
  }
}
```

Place this file in:
- Current working directory
- Same directory as the serial port
- `/etc/meshcore/config.json`
- Or specify path in options: `{ configPath: '/path/to/meshcore.json' }`

## Protocol-Specific Details

### Meshtastic

**Channels**: Uses PSK-based encryption channels
- Channels are matched by PSK and name for forwarding
- Supports primary and secondary channels
- Channel configuration is read from device

**Node Info**:
- NodeID, long name, short name, hardware model
- Battery level, voltage, signal strength
- Channel utilization, air utilization TX

### Reticulum

**Destinations**: Uses identity-based addressing
- Destinations represented as "channels" for compatibility
- Each destination has a unique hash
- Announce packets broadcast destination availability

**Identity**:
- Each node has a unique identity hash
- Generated on first connection or loaded from config

**Message Format**:
- Messages use destination hashes instead of channel numbers
- No built-in encryption (handled by Reticulum layer)

### RNode

**Frequency Configuration**:
- Frequency, bandwidth, spreading factor configurable
- TX power, coding rate can be set
- Single "channel" represents frequency/bandwidth combo

**Packet Format**:
- Simple packet structure: `[from][to][message]`
- Raw packet radio - minimal protocol overhead
- UTF-8 text encoding with binary fallback

**KISS Protocol**:
- Uses KISS framing (FEND, FESC, TFEND, TFESC)
- Commands for configuration (frequency, bandwidth, etc.)

### Mesh Core

**Auto-Detection**:
- Tries each protocol in order: Meshtastic, RNode, Reticulum
- First successful connection is used
- Can force specific protocol via configuration

**Protocol Delegation**:
- All operations delegated to underlying protocol
- Events forwarded from underlying protocol
- Metadata includes both Mesh Core and underlying protocol info

**Cross-Protocol Translation**:
- Messages can be translated between protocols
- Channel matching uses underlying protocol rules
- Original protocol marked in message metadata

## Message Bridging

The bridge server forwards messages between radios using protocol-aware channel matching:

### Channel Matching

Each protocol implements its own `channelsMatch()` method:

```javascript
// Meshtastic: Match by PSK and name
channelsMatch(ch1, ch2) {
  return ch1.psk === ch2.psk && ch1.name === ch2.name;
}

// Reticulum: Match by destination hash
channelsMatch(ch1, ch2) {
  return ch1.destinationHash === ch2.destinationHash;
}

// RNode: Match by frequency and bandwidth
channelsMatch(ch1, ch2) {
  return ch1.frequency === ch2.frequency &&
         ch1.bandwidth === ch2.bandwidth;
}
```

### Smart Forwarding

The bridge uses **Smart PSK/Name Matching** (default):
- Searches all channels on target radio for matching configuration
- Enables cross-index forwarding (e.g., channel 0 → channel 3)
- Works across different protocol types

Example:
```
Radio A (Meshtastic) - Channel 0: "private-net" [PSK: abc123...]
Radio B (RNode)      - Channel 0: "915MHz" [Freq: 915000000]
Radio C (Meshtastic) - Channel 2: "private-net" [PSK: abc123...]

Message on Radio A ch0 → forwarded to Radio C ch2
(Radio B skipped - no matching channel)
```

## Implementation Files

### Protocol Handlers
- `bridge-server/protocols/BaseProtocol.mjs` - Base protocol interface
- `bridge-server/protocols/MeshtasticProtocol.mjs` - Meshtastic implementation
- `bridge-server/protocols/ReticulumProtocol.mjs` - Reticulum implementation
- `bridge-server/protocols/RNodeProtocol.mjs` - RNode implementation
- `bridge-server/protocols/MeshCoreProtocol.mjs` - Mesh Core implementation
- `bridge-server/protocols/index.mjs` - Protocol factory and exports

### Type Definitions
- `src/renderer/types.ts` - TypeScript types including `RadioProtocol` type

### Bridge Server
- `bridge-server/index.mjs` - Main server using protocol abstraction

### Frontend
- `src/renderer/lib/webSocketManager.ts` - WebSocket manager with protocol support

## Dependencies

### Current Dependencies
- `@meshtastic/core` - Meshtastic protocol (already included)
- `@meshtastic/transport-node-serial` - Meshtastic serial transport (already included)
- `serialport` - Serial port communication (already included)

### Recommended Dependencies (for full Reticulum support)
- Python 3.x with Reticulum package (for Python bridge mode)
- `rns` Python package: `pip install rns`

### Optional Dependencies
- Custom RNS bridge script (for Reticulum Python integration)

## Future Enhancements

### Planned Features
1. **UI Protocol Selector** - GUI for selecting protocol when connecting
2. **Protocol Icons** - Visual indicators for protocol type in radio list
3. **Cross-Protocol Statistics** - Track messages by protocol type
4. **Protocol Configuration UI** - GUI for configuring protocol-specific options

### Potential Protocols
- **LoRa APRs** - Amateur Radio APRs over LoRa
- **Helium** - Helium Network integration
- **GoTenna** - GoTenna mesh protocol
- **Custom Protocols** - Easy extension via BaseProtocol

## Troubleshooting

### Connection Issues

**Meshtastic device not connecting**
- Ensure device firmware is 2.0+
- Check USB cable and permissions
- Verify no other app is using the serial port

**Reticulum connection fails**
- Verify Python RNS is installed: `python3 -c "import RNS"`
- Check RNS configuration in `~/.reticulum/`
- For direct serial, ensure RNode is in Reticulum mode

**RNode device not detected**
- Send detect command and wait for response
- Check baud rate (should be 115200)
- Verify RNode firmware is up to date

**Mesh Core auto-detection fails**
- Try specifying protocol explicitly in config
- Check device responds to serial commands
- Review bridge server logs for details

### Message Forwarding Issues

**Messages not forwarding between radios**
- Check channel configuration matches
- Verify `enableSmartMatching` is true (recommended)
- Review bridge server logs for channel matching details
- Ensure channels exist on both radios

**Cross-protocol forwarding not working**
- Verify both radios have compatible "channels"
- Check protocol-specific matching rules
- Ensure message is not from bridge itself (loop prevention)

## Development

### Adding a New Protocol

1. Create protocol handler extending `BaseProtocol`:

```javascript
import { BaseProtocol } from './BaseProtocol.mjs';

export class MyProtocol extends BaseProtocol {
  getProtocolName() {
    return 'myprotocol';
  }

  async connect() {
    // Implementation
  }

  async disconnect() {
    // Implementation
  }

  async sendMessage(text, channel, options) {
    // Implementation
  }

  // Implement other required methods...
}
```

2. Add to protocol factory in `protocols/index.mjs`

3. Update TypeScript types in `src/renderer/types.ts`:

```typescript
export type RadioProtocol = 'meshtastic' | 'reticulum' | 'rnode' | 'meshcore' | 'myprotocol';
```

4. Add protocol-specific metadata fields if needed

### Testing

```bash
# Start bridge server
npm run start

# Connect to radios via WebSocket
# Test message forwarding
# Check logs for errors
```

## License

Same license as main project (see LICENSE file).

## Credits

- **Meshtastic** - https://meshtastic.org
- **Reticulum** - https://reticulum.network
- **RNode** - https://unsigned.io/rnode
- Bridge implementation by Northern Plains IT, LLC and OnyxVZ, LLC
