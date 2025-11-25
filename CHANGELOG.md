# Changelog

All notable changes to Mesh Bridge - Meshtastic Relay Station will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Persistent channel configuration display with auto-sync
- Visual indicators for loaded channel configurations
- Module settings UI with configuration interface
- Interactive module selection and settings display
- 48-hour weather forecast in #weather command with hourly predictions

### Changed
- Enhanced #weather command to include Today and Tomorrow forecasts
- Weather data now shows morning, afternoon, and evening conditions
- Added daily high/low temperatures and precipitation chance to forecasts

### Fixed
- Modem preset NaN error by converting enum strings to integers
- Modules page now displays settings instead of being non-functional
- Channel configurations now persist and reflect current radio state

## [0.25.11.2] - 2024-11-24

### Added
- Comprehensive radio configuration settings UI
- Channel configuration via serial port (get/set for all 8 channels)
- Complete channel control (name, PSK, role, uplink/downlink settings)
- Auto key generator for secure channel encryption
- Bulk channel operations (get all channels at once)
- LoRa, Device, Position, Power, Network, Display, and Bluetooth configuration sections
- Persistent radio configuration settings

### Fixed
- Role enum conversion in channel configuration
- PSK conversion from plain object to Uint8Array
- Discord bot token persistence and intent validation
- Webhook URL overwrite prevention with masked placeholder

## [0.25.11] - 2024-11

### Added
- Enhanced weather commands with NWS (National Weather Service) alerts support
- Comprehensive Discord bot diagnostics
- Smart message truncation for Meshtastic 512-byte limit
- Discord bot support (two-way communication) alongside webhook (one-way)
- Emergency SOS integration with Discord notifications
- Discord bot configuration in UI
- Improved weather command formatting and details

### Fixed
- Discord bot/webhook command detection
- Message detection for bot vs webhook communications
- Discord command helper function

## [0.25.10] - 2024-11

### Added
- Discord bot configuration to settings UI
- Comprehensive memory management and log rotation
- Persistent configuration for Email, Discord, and MQTT settings
- Safe radio reconnection improvements (no aggressive cleanup)
- Dedicated TIME SYNC log section with visual separators
- Time sync log filtering for better visibility
- Comprehensive radio time tracking

### Fixed
- Repetitive node update spam in logs
- Verbose radio time logging
- Time sync using proper AdminMessage.setTimeOnly
- Exact setFixedPosition pattern matching for AdminMessage

### Removed
- Radio time display from Radio List page (moved to dedicated section)

## [0.25.9] - 2024-11

### Added
- Complete channel configuration system via serial port
- Radio reboot functionality
- Automatic time sync on radio connection to prevent 1969 timestamps
- Comprehensive timestamp logging for diagnostics
- Defensive timestamp handling
- localStorage clearing utility for troubleshooting

### Fixed
- Critical timestamp handling bugs causing telemetry data loss
- Sent message timestamp format to use Date object
- Meshtastic v2.6.7 compatibility (using nodeCatalog instead of device.nodes)
- Vite env check causing TypeScript errors

## [0.25.8] - 2024-10

### Added
- Persistent node database (180-day retention)
- Persistent message history (7-day retention)
- LocalStorage integration for data persistence
- Automatic cleanup of old messages and nodes
- Telemetry history tracking (24-hour window per node)
- Enhanced environmental sensor support (temperature, humidity, pressure)
- Improved node deduplication (by numeric ID)

### Fixed
- Node database preservation across restarts
- Message history preservation across browser refreshes
- Duplicate node entries with different ID formats
- Telemetry data merging for duplicate nodes

## [0.25.7] - 2024-10

### Added
- Interactive TAK-style tactical view with breadcrumb trails
- Site planner for RF coverage analysis
- Network health monitoring with channel utilization charts
- Signal quality analysis and tables
- Airtime tracking by node
- Environmental sensor displays
- Network insights and recommendations

### Changed
- Enhanced map view with better node clustering
- Improved telemetry chart styling and responsiveness

## [0.25.6] - 2024-10

### Added
- Emergency response system with SOS tracking
- Auto-response for emergency messages
- Severe weather alert monitoring
- MQTT integration for IoT connectivity
- MQTT configuration UI
- Communication settings page for Email and Discord

### Fixed
- MQTT connection persistence
- Email/Discord configuration validation

## [0.25.5] - 2024-10

### Added
- AI assistant integration with Ollama
- Local AI model support (no cloud required)
- AI configuration UI with model selection
- AI model pull progress tracking
- Command system for radio interactions (16 built-in commands)
- Rate limiting for command spam prevention
- Weather command via OpenWeatherMap
- Status, uptime, and diagnostic commands

### Features
- `#ai <question>` - Ask AI assistant
- `#weather <location>` - Get weather info
- `#status` - System status
- `#uptime` - System uptime
- `#ping` - Test bridge connectivity
- `#help` - List available commands

## [0.25.4] - 2024-09

### Added
- Email notification system via Nodemailer
- Discord webhook integration
- Configurable notification triggers
- Email and Discord configuration UI
- Test notification functionality

## [0.25.3] - 2024-09

### Added
- Complete dashboard with real-time statistics
- Message monitor with live feed
- Node list with filtering and search
- Interactive map view with Leaflet
- Telemetry charts for battery, temperature, signal strength
- Node detail modal with comprehensive info
- Log viewer with filtering by level

## [0.25.2] - 2024-09

### Added
- Smart channel matching based on PSK and name
- Cross-index channel forwarding
- Private channel support
- Multi-mesh bridging capability
- Channel configuration display in UI
- Bridge configuration page

### Changed
- Improved channel forwarding logic
- Enhanced PSK matching algorithm

## [0.25.1] - 2024-09

### Added
- Auto-scan for connected radios
- Configurable scan intervals
- Manual radio connection
- Radio disconnect functionality
- Per-radio statistics tracking
- Message deduplication system

### Fixed
- USB unplug handling
- Virtual serial port filtering (ttyS*)
- Connection spam prevention

## [0.25.0] - 2024-09

### Added
- Node.js bridge server with official @meshtastic/core library
- WebSocket communication between frontend and backend
- Real-time message forwarding
- Automatic bidirectional bridging (2+ radios)
- Web-based GUI accessible from any browser
- PWA (Progressive Web App) support
- System service support for auto-start on boot

### Changed
- **BREAKING:** Complete architecture rewrite from pure web app to server-based
- Migrated from Web Serial API to Node.js SerialPort
- Replaced manual protocol parsing with official Meshtastic libraries

## [0.20.0] - 2024-08

### Added
- Initial pure Web Serial API implementation
- Manual Meshtastic protocol parsing
- Protobuf message decoding
- Basic message display

### Fixed
- Serial port connection flow
- Packet parsing issues
- Text message extraction from protobuf

## [0.10.0] - 2024-08

### Added
- Progressive Web App (PWA) implementation
- React + TypeScript frontend
- Vite build system
- TailwindCSS styling
- Basic UI layout

## [0.5.0] - 2024-08

### Added
- Attempted @meshtastic/js integration (later removed due to JSR issues)
- Basic radio detection
- Connection management UI

## [0.1.0] - 2024-08

### Added
- Initial project structure
- Modern desktop GUI concept
- Basic React setup
- Project README and documentation

---

## Version History Summary

- **v0.25.x** (Current) - Mature feature set with AI, notifications, radio configuration
- **v0.20.x** - Web Serial API implementation
- **v0.10.x** - PWA foundation
- **v0.5.x** - Early experiments
- **v0.1.x** - Initial commit

## Migration Notes

### Upgrading to 0.25.0+

The v0.25.0 release represents a major architectural change. Key points:

1. **Server Required**: The app now requires a Node.js bridge server
2. **Installation**: Use the automated install script for system service setup
3. **Configuration**: All settings now persist automatically
4. **Radios**: Auto-detection and reconnection handled automatically

### Breaking Changes in v0.25.0

- Removed Web Serial API direct access (now handled by bridge server)
- Removed manual protocol parsing (now using official libraries)
- Changed from client-side only to client-server architecture

## Contributors

- Northern Plains IT, LLC
- OnyxVZ, LLC (IceNet-01)

## License

See LICENSE file for details. Dual-licensed (Non-Commercial / Commercial).
