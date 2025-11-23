# README Update Notes

## New Features to Add:

### Radio Configuration Page
- Web-based channel configuration for all 8 channels
- Individual and bulk "Get" operations
- Set channel name, PSK, role, uplink/downlink
- Real-time configuration changes

### Persistent Settings
- All Email, Discord, and MQTT settings now persist across restarts
- Stored in bridge-config.json
- No need to reconfigure after reboot

### Memory Management
- Log rotation: Console buffer (5000 lines), Message history (1000 messages)
- Automatic cleanup of old deduplication cache (1 hour retention)
- Periodic memory stats reporting (every 10 minutes)
- Prevents unbounded growth on 24/7 systems

## Configuration Section Update:

Add "Radio Configuration" section before AI Assistant Setup

## Monitoring Section Update:

Add memory management features to monitoring section
