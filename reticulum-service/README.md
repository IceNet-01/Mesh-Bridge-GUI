# Reticulum Service

Standalone Reticulum Network Stack service for Mesh Bridge GUI with LXMF messaging support.

## Architecture

This service runs independently from the bridge server and provides:

- **LXMF Messaging**: Compatible with Sideband, NomadNet, and MeshChat
- **WebSocket Interface**: Real-time communication with web GUI
- **Transport Management**: RNode, UDP, TCP interfaces
- **Identity Management**: Cryptographic identity and key management
- **Propagation Nodes**: Message store-and-forward support

Based on the architecture from [liamcottle/reticulum-meshchat](https://github.com/liamcottle/reticulum-meshchat).

## Installation

### Prerequisites

```bash
# Install Python dependencies
pip3 install -r requirements.txt

# Or install individually:
pip3 install rns lxmf websockets
```

### Configuration

The service automatically creates a minimal RNS configuration on first run at `~/.reticulum/config`.

To customize:
1. Edit `~/.reticulum/config`
2. Add RNode interfaces, TCP links, etc.
3. Restart the service

## Usage

### Basic Usage

```bash
# Start with defaults (localhost:4243)
python3 reticulum_service.py

# Custom WebSocket port
python3 reticulum_service.py --ws-port 4243

# Custom config directory
python3 reticulum_service.py --config /path/to/config
```

### Command Line Options

```
--config PATH      RNS config directory (default: ~/.reticulum)
--identity PATH    Identity file path
--ws-host HOST     WebSocket host (default: localhost)
--ws-port PORT     WebSocket port (default: 4243)
```

## WebSocket Protocol

The service provides a WebSocket server for the web GUI to communicate with.

### Message Format

All messages are JSON with this structure:

```json
{
  "type": "message_type",
  "data": { ... }
}
```

### Client → Service Messages

#### Send Message
```json
{
  "type": "send_message",
  "data": {
    "destination": "abc123...",
    "content": "Hello!",
    "title": "Optional title"
  }
}
```

#### Announce
```json
{
  "type": "announce",
  "data": {}
}
```

#### Get Peers
```json
{
  "type": "get_peers",
  "data": {}
}
```

#### Get Messages
```json
{
  "type": "get_messages",
  "data": {}
}
```

### Service → Client Messages

#### Status
```json
{
  "type": "status",
  "data": {
    "running": true,
    "identity": "abc123...",
    "destination": "def456...",
    "display_name": "Mesh Bridge"
  }
}
```

#### LXMF Message Received
```json
{
  "type": "lxmf_message",
  "data": {
    "source": "abc123...",
    "destination": "def456...",
    "content": "Message text",
    "timestamp": 1234567890,
    "title": "Optional title"
  }
}
```

#### Announce Sent
```json
{
  "type": "announce_sent",
  "data": {
    "success": true
  }
}
```

## Integration with Mesh Bridge

The service auto-starts when the main Mesh Bridge application launches:

```javascript
// start.mjs
async function startServices() {
  // Start Reticulum service
  spawn('python3', ['reticulum-service/reticulum_service.py']);

  // Start bridge server (Meshtastic, LoRa)
  spawn('node', ['bridge-server/index.mjs']);

  // Start web GUI
  spawn('npm', ['run', 'dev']);
}
```

## Interoperability

This service implements standard LXMF protocol and is fully compatible with:

- **Sideband**: Mobile LXMF client (iOS/Android)
- **NomadNet**: Terminal-based mesh communication
- **MeshChat**: Web-based LXMF client
- **Any LXMF-compatible application**

Messages sent from this service can be received by any LXMF client, and vice versa.

## Directory Structure

```
~/.reticulum/
├── config              # RNS configuration
├── identities/
│   └── meshbridge     # Service identity
├── lxmf_storage/      # LXMF message store
└── storage/           # RNS state
```

## Troubleshooting

### Service won't start

1. Check dependencies are installed:
   ```bash
   python3 -c "import RNS, LXMF, websockets"
   ```

2. Check config directory permissions:
   ```bash
   ls -la ~/.reticulum/
   ```

3. Delete config to regenerate:
   ```bash
   rm ~/.reticulum/config
   ```

### WebSocket connection fails

1. Check port is not in use:
   ```bash
   lsof -i :4243
   ```

2. Try different port:
   ```bash
   python3 reticulum_service.py --ws-port 4244
   ```

### Messages not sending/receiving

1. Check identity is created:
   ```bash
   ls -la ~/.reticulum/identities/
   ```

2. Check RNS is properly initialized (look for log messages)

3. Send announce to make yourself visible:
   - Send `{"type": "announce"}` via WebSocket

## Development

### Testing WebSocket Connection

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:4243');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'announce',
    data: {}
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

### Adding Features

The service is designed to be extended. Key extension points:

- `handle_client_message()`: Add new WebSocket message types
- `on_lxmf_delivery()`: Process incoming LXMF messages
- `initialize_rns()`: Add custom RNS configuration

## References

- [Reticulum Network Stack](https://reticulum.network/)
- [LXMF Protocol](https://github.com/markqvist/LXMF)
- [Reticulum Manual](https://markqvist.github.io/Reticulum/manual/)
- [MeshChat](https://github.com/liamcottle/reticulum-meshchat)
