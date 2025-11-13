# Radio Protocol Handlers

This directory contains protocol implementations for Meshtastic radios supported by the Mesh Bridge.

## Files

- **BaseProtocol.mjs** - Abstract base class that all protocol handlers extend
- **MeshtasticProtocol.mjs** - Meshtastic 2.0+ protocol handler
- **index.mjs** - Protocol factory and exports

## Usage

```javascript
import { createProtocol } from './protocols/index.mjs';

// Create a protocol handler
const protocol = createProtocol('meshtastic', radioId, '/dev/ttyUSB0');

// Listen for events
protocol.on('message', (packet) => {
  console.log('Message received:', packet.text);
});

protocol.on('nodeInfo', (info) => {
  console.log('Node info:', info);
});

// Connect
await protocol.connect();

// Send message
await protocol.sendMessage('Hello world!', 0);

// Disconnect
await protocol.disconnect();
```

## Protocol API

All protocols implement the same interface:

### Methods

- `async connect()` - Connect to the radio device
- `async disconnect()` - Disconnect from the radio device
- `async sendMessage(text, channel, options)` - Send a text message
- `getNodeInfo()` - Get node information
- `getChannels()` - Get list of channels/destinations
- `getStats()` - Get protocol statistics
- `getProtocolMetadata()` - Get protocol-specific metadata
- `getProtocolName()` - Get protocol name ('meshtastic')

### Events

- `message` - New message received (normalized packet)
- `nodeInfo` - Node information updated
- `channels` - Channel/destination list updated
- `telemetry` - Telemetry data received
- `error` - Error occurred

## Creating a New Protocol

1. Create a new file extending `BaseProtocol`:

```javascript
import { BaseProtocol } from './BaseProtocol.mjs';

export class MyProtocol extends BaseProtocol {
  constructor(radioId, portPath, options = {}) {
    super(radioId, portPath, options);
    // Initialize protocol-specific state
  }

  getProtocolName() {
    return 'myprotocol';
  }

  async connect() {
    // 1. Open serial port or network connection
    // 2. Initialize device
    // 3. Set up event handlers
    // 4. Wait for ready state
    // 5. Emit 'nodeInfo' and 'channels' events
    this.connected = true;
  }

  async disconnect() {
    // 1. Clean up resources
    // 2. Close connections
    this.connected = false;
  }

  async sendMessage(text, channel, options = {}) {
    // 1. Validate connection
    // 2. Format message for protocol
    // 3. Send via transport
    // 4. Update stats
    this.stats.messagesSent++;
  }

  normalizeMessagePacket(packet) {
    // Convert protocol-specific packet to standard format
    return {
      id: packet.id,
      timestamp: new Date(packet.time),
      from: packet.sender,
      to: packet.recipient,
      channel: packet.channel,
      portnum: 1,
      text: packet.message,
      // ... other fields
    };
  }

  channelsMatch(channel1, channel2) {
    // Implement protocol-specific channel matching logic
    return channel1.id === channel2.id;
  }
}
```

2. Add to `index.mjs`:

```javascript
import { MyProtocol } from './MyProtocol.mjs';

export function createProtocol(protocol, radioId, portPath, options = {}) {
  switch (protocol.toLowerCase()) {
    // ... existing cases
    case 'myprotocol':
      return new MyProtocol(radioId, portPath, options);
    default:
      throw new Error(`Unknown protocol: ${protocol}`);
  }
}
```

3. Update supported protocols list:

```javascript
export function getSupportedProtocols() {
  return ['meshtastic', 'myprotocol'];
}
```

## Protocol-Specific Notes

### Meshtastic
- Requires `@meshtastic/core` and `@meshtastic/transport-node-serial` npm packages
- Fully implements all Meshtastic features
- PSK-based channel encryption
- Supports device telemetry and statistics
- Channel-based message routing with smart PSK matching
- Configuration-driven protocol selection

## Testing

Test protocol implementations:

```bash
# Run individual protocol tests
npm test -- protocols/MeshtasticProtocol

# Test protocol factory
npm test -- protocols/index

# Integration tests
npm test -- integration
```

## Debugging

Enable debug logging:

```javascript
const protocol = createProtocol('meshtastic', radioId, portPath, {
  debug: true,
  logLevel: 'debug'
});

protocol.on('error', (error) => {
  console.error('Protocol error:', error);
});
```

## Performance Considerations

- **Connection Pooling**: Reuse protocol instances when possible
- **Event Listeners**: Remove listeners when done to prevent memory leaks
- **Message Buffering**: Large message volumes may need buffering
- **Error Handling**: Always handle errors to prevent crashes

## License

Same as main project.
