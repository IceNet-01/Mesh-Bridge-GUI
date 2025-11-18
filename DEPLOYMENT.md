# Production Deployment Guide

This guide explains how to deploy the Mesh Bridge GUI in production mode where the bridge server serves both the web UI and WebSocket API on port 8080.

## Quick Start

### 1. Build the Production Version

```bash
npm run build
```

This compiles TypeScript and builds the React app to the `dist/` directory.

### 2. Start the Production Server

```bash
npm run production
```

Or simply:

```bash
node bridge-server/index.mjs
```

The bridge server will:
- Serve the web UI on `http://0.0.0.0:8080`
- Provide WebSocket API on `ws://0.0.0.0:8080`
- Auto-scan and connect to Meshtastic radios
- Handle all mesh network communications

## Access the Application

### Local Access
```
http://localhost:8080
```

### LAN Access (from other devices)
```
http://YOUR_SERVER_IP:8080
```

Find your server IP:
```bash
hostname -I
# or
ip addr show
```

## Production Deployment Options

### Option 1: Manual Start (Testing)

```bash
# Build latest changes
npm run build

# Start server
node bridge-server/index.mjs
```

### Option 2: Using npm scripts

```bash
# Build and start in one command
npm run production
```

### Option 3: Systemd Service (Recommended for Production)

The project includes systemd service scripts for automatic startup and management.

#### Install the Service

```bash
sudo npm run service:install
```

This creates a systemd service that:
- Starts automatically on boot
- Restarts on failure
- Runs as the current user
- Logs to systemd journal

#### Service Management Commands

```bash
# Start the service
sudo npm run service:start

# Stop the service
sudo npm run service:stop

# Restart the service
sudo npm run service:restart

# Check status
sudo npm run service:status

# View logs
sudo npm run service:logs

# Enable auto-start on boot
sudo npm run service:enable

# Disable auto-start
sudo npm run service:disable

# Uninstall service
sudo npm run service:uninstall
```

### Option 4: Docker (Future Enhancement)

Docker support is planned for future releases.

## Port Configuration

By default, the bridge server runs on port 8080. To change this:

```bash
# Set custom port via environment variable
BRIDGE_PORT=3000 node bridge-server/index.mjs
```

Make sure to update firewall rules if changing the port.

## Firewall Configuration

If you want LAN access, ensure port 8080 is open:

### Ubuntu/Debian (ufw)
```bash
sudo ufw allow 8080/tcp
```

### CentOS/RHEL (firewalld)
```bash
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

## Network Configuration

The bridge server binds to `0.0.0.0` by default, making it accessible on all network interfaces.

### For Local-Only Access
If you only want localhost access, modify `bridge-server/index.mjs`:

```javascript
const port = process.env.BRIDGE_PORT || 8080;
const host = process.env.BRIDGE_HOST || 'localhost'; // Changed from '0.0.0.0'
```

Then restart the server.

## Auto-Discovery Feature

The web UI automatically detects the bridge server:

- **Same-device access** (`http://localhost:8080`): Auto-connects to `ws://localhost:8080`
- **LAN access** (`http://192.168.1.100:8080`): Auto-connects to `ws://192.168.1.100:8080`
- **Manual override**: Use Settings → Server tab to configure custom URL

No configuration needed for typical deployments!

## Updating the Application

When you make changes or pull updates:

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Rebuild the application
npm run build

# Restart the service (if using systemd)
sudo npm run service:restart
```

Or if running manually:
```bash
# Stop the current server (Ctrl+C)
# Then rebuild and restart
npm run production
```

## Production Checklist

- [ ] Built the latest version with `npm run build`
- [ ] Tested local access at `http://localhost:8080`
- [ ] Tested LAN access from another device
- [ ] Configured firewall if needed
- [ ] Set up systemd service for auto-start
- [ ] Enabled service with `sudo npm run service:enable`
- [ ] Verified radios are auto-detected and connected
- [ ] Checked logs with `sudo npm run service:logs`

## Troubleshooting

### Web UI shows blank screen
1. Check if dist/ directory exists: `ls -la dist/`
2. Rebuild: `npm run build`
3. Restart server

### Cannot connect from other devices
1. Verify firewall allows port 8080
2. Check server is binding to `0.0.0.0` (check startup logs)
3. Ensure both devices are on same network
4. Try accessing via IP address instead of hostname

### WebSocket connection fails
1. Check bridge server logs
2. Verify port 8080 is not blocked
3. Try manual configuration in Settings → Server

### Service won't start
```bash
# Check service status
sudo systemctl status meshtastic-bridge

# View detailed logs
sudo journalctl -u meshtastic-bridge -n 50

# Check for port conflicts
sudo lsof -i:8080
```

## Performance Tips

### Build Optimization
The production build includes:
- Code minification
- Tree shaking
- PWA service worker
- Asset optimization

### Memory Usage
The bridge server is lightweight. For systems with limited RAM:
- Close unnecessary tabs/apps
- Monitor with: `top` or `htop`

### Radio Management
- Limit connected radios to what you actually need
- Use appropriate message retention settings
- Clean old nodes/messages periodically

## Environment Variables

Supported environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | `8080` | Server port |
| `BRIDGE_HOST` | `0.0.0.0` | Bind address |
| `AUTO_CONNECT` | `true` | Auto-connect to radios |
| `NODE_ENV` | `production` | Node environment |

Example:
```bash
BRIDGE_PORT=3000 AUTO_CONNECT=false node bridge-server/index.mjs
```

## Support

For issues or questions:
- Check logs: `sudo npm run service:logs`
- Open an issue on GitHub
- Review the main README.md

## Security Considerations

### Local Network Only
By default, the bridge server is accessible on your local network. For internet exposure:
- Use a reverse proxy (nginx, Caddy)
- Enable HTTPS/TLS
- Implement authentication
- Use a VPN for remote access

### Firewall Best Practices
- Only open port 8080 on trusted networks
- Use firewall rules to restrict access
- Monitor access logs

## Next Steps

After deployment:
1. Connect your Meshtastic radios
2. Configure bridge settings in the web UI
3. Monitor the Network Health dashboard
4. Set up any desired integrations (AI, MQTT, etc.)
5. Configure notifications if needed

Enjoy your Mesh Bridge relay station!
