# MeshCore Service

**Status: Placeholder for future implementation**

Standalone MeshCore service for Mesh Bridge GUI integration.

## Overview

MeshCore is a separate mesh networking ecosystem (distinct from Meshtastic and Reticulum) that will be integrated as a standalone service following the same architecture pattern as Reticulum.

## Planned Architecture

```
Web GUI
   └── WebSocket ──> MeshCore Service (MeshCore protocol)
```

Similar to the Reticulum service, MeshCore will:
- Run as an independent service
- Communicate with web GUI via WebSocket
- Manage its own transport layer
- Handle MeshCore-specific messaging protocols
- Maintain separate identity/addressing scheme

## Implementation Roadmap

### Phase 1: Research & Design (Future)
- [ ] Document MeshCore protocol specifications
- [ ] Define WebSocket message protocol
- [ ] Design identity and addressing system
- [ ] Plan transport management

### Phase 2: Core Service (Future)
- [ ] Implement meshcore_service.py
- [ ] WebSocket server
- [ ] Message routing
- [ ] Transport management

### Phase 3: Web GUI Integration (Future)
- [ ] Add MeshCore tab to web interface
- [ ] Implement WebSocket client
- [ ] Chat interface
- [ ] Network status display

### Phase 4: Ecosystem Bridging (Future)
- [ ] Design bridge protocol for MeshCore ↔ Reticulum
- [ ] Design bridge protocol for MeshCore ↔ Meshtastic
- [ ] Implement message translation layer

## Directory Structure (Planned)

```
meshcore-service/
├── meshcore_service.py      # Main service (future)
├── websocket_server.py      # WebSocket interface (future)
├── protocol_handler.py      # MeshCore protocol (future)
├── identity_manager.py      # Identity management (future)
├── requirements.txt         # Python dependencies (future)
├── config.json              # Service configuration (future)
└── README.md               # This file
```

## Three-Ecosystem Architecture

Mesh Bridge GUI will support three independent mesh ecosystems:

### 1. Bridge Server Ecosystem (Direct Radio)
- **Protocols**: Meshtastic, Direct LoRa
- **Communication**: HTTP REST API
- **Use Case**: Traditional radio-to-radio messaging

### 2. Reticulum Ecosystem (LXMF)
- **Protocols**: Reticulum Network Stack, LXMF
- **Communication**: WebSocket
- **Use Case**: Encrypted mesh networking, compatible with Sideband/NomadNet

### 3. MeshCore Ecosystem (Future)
- **Protocols**: MeshCore-specific
- **Communication**: WebSocket
- **Use Case**: [To be defined based on MeshCore specifications]

## Future Integration

When implementing MeshCore service, use Reticulum service as a reference:

1. **Same pattern**: Python service + WebSocket interface
2. **Auto-start**: Launch with main application
3. **Independent**: Separate from bridge server
4. **Interoperable**: Can potentially bridge with other ecosystems

## References

- [Reticulum Service](../reticulum-service/README.md) - Reference implementation
- [Architecture Proposal](../RETICULUM_ARCHITECTURE_PROPOSAL.md) - Overall design
- MeshCore documentation (to be added)

## Notes

This service is a placeholder to establish the architectural foundation. Implementation will begin once:

1. Reticulum service is stable and tested
2. MeshCore protocol specifications are documented
3. User requirements for MeshCore integration are clarified

For now, focus is on:
- Perfecting Reticulum integration
- Refining bridge server for Meshtastic/LoRa
- Building solid foundation for future expansion
