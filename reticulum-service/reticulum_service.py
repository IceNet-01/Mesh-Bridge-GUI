#!/usr/bin/env python3
"""
Reticulum Service for Mesh Bridge GUI

Standalone Reticulum Network Stack service with LXMF messaging support.
Architecture based on liamcottle/reticulum-meshchat.

This service runs independently from the bridge server and provides:
- LXMF messaging (compatible with Sideband, NomadNet, MeshChat)
- WebSocket interface for web GUI communication
- RNode transport management
- UDP/TCP network interfaces
- Propagation node support
- Identity management

The web GUI connects via WebSocket to send/receive LXMF messages.
"""

import sys
import os
import json
import time
import asyncio
import argparse
from pathlib import Path
from threading import Thread, Event

# WebSocket server
try:
    import websockets
except ImportError:
    print("\n" + "="*70, file=sys.stderr)
    print("ERROR: websockets module is not installed!", file=sys.stderr)
    print("="*70, file=sys.stderr)
    print("\nTo install websockets, run:", file=sys.stderr)
    print("  pip install websockets", file=sys.stderr)
    print("  pip3 install websockets", file=sys.stderr)
    print("="*70 + "\n", file=sys.stderr)
    sys.exit(1)

# Check if RNS is installed
try:
    import RNS
except ImportError:
    print("\n" + "="*70, file=sys.stderr)
    print("ERROR: Reticulum Network Stack (RNS) is not installed!", file=sys.stderr)
    print("="*70, file=sys.stderr)
    print("\nTo install RNS, run:", file=sys.stderr)
    print("  pip install rns", file=sys.stderr)
    print("  pip3 install rns", file=sys.stderr)
    print("\nFor more information: https://reticulum.network/", file=sys.stderr)
    print("="*70 + "\n", file=sys.stderr)
    sys.exit(1)

# Check if LXMF is installed
try:
    import LXMF
except ImportError:
    print("\n" + "="*70, file=sys.stderr)
    print("ERROR: LXMF is not installed!", file=sys.stderr)
    print("="*70, file=sys.stderr)
    print("\nTo install LXMF, run:", file=sys.stderr)
    print("  pip install lxmf", file=sys.stderr)
    print("  pip3 install lxmf", file=sys.stderr)
    print("\nFor more information: https://github.com/markqvist/LXMF", file=sys.stderr)
    print("="*70 + "\n", file=sys.stderr)
    sys.exit(1)


class ReticulumService:
    """
    Standalone Reticulum service with WebSocket interface for web GUI.

    Manages the complete RNS stack, LXMF messaging, and provides a
    WebSocket server for the web interface to send/receive messages.
    """

    def __init__(self, config_dir=None, identity_path=None, ws_host="localhost", ws_port=4243):
        """Initialize the Reticulum service"""
        self.config_dir = config_dir or os.path.expanduser("~/.reticulum")
        self.identity_path = identity_path or os.path.join(self.config_dir, "identities", "meshbridge")
        self.ws_host = ws_host
        self.ws_port = ws_port

        # Core components
        self.reticulum = None
        self.identity = None
        self.message_router = None
        self.lxmf_destination = None

        # WebSocket clients
        self.ws_clients = set()

        # State
        self.running = False
        self.shutdown_event = Event()

        # Storage
        self.peers = {}  # destination_hash -> peer_info
        self.messages = []  # message history

        self.log("Reticulum Service initializing...")
        self.log(f"Config directory: {self.config_dir}")
        self.log(f"Identity path: {self.identity_path}")
        self.log(f"WebSocket: {self.ws_host}:{self.ws_port}")

    def log(self, message, level="INFO"):
        """Log with timestamp"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}", file=sys.stderr, flush=True)

    def ensure_directories(self):
        """Ensure required directories exist"""
        os.makedirs(self.config_dir, exist_ok=True)
        os.makedirs(os.path.dirname(self.identity_path), exist_ok=True)

        # Create minimal RNS config if it doesn't exist
        config_file = os.path.join(self.config_dir, "config")
        if not os.path.exists(config_file):
            self.log("Creating minimal RNS config...")
            config_content = """# Reticulum configuration for Mesh Bridge GUI
# Minimal network-capable configuration

[reticulum]
enable_transport = yes
share_instance = yes
shared_instance_port = 37428
instance_control_port = 37429

[logging]
loglevel = 4

# UDP Interface for local mesh
[[UDP Interface]]
  type = UDPInterface
  interface_enabled = yes
  listen_ip = 0.0.0.0
  listen_port = 4242
  forward_ip = 255.255.255.255
  forward_port = 4242
"""
            with open(config_file, 'w') as f:
                f.write(config_content)
            self.log(f"Created config: {config_file}")

    def initialize_rns(self):
        """Initialize Reticulum Network Stack"""
        try:
            self.log("Starting Reticulum Network Stack...")

            # Initialize RNS
            self.reticulum = RNS.Reticulum(configdir=self.config_dir)
            self.log("✓ RNS initialized")

            # Load or create identity
            self.log("Loading identity...")
            if os.path.exists(self.identity_path):
                self.identity = RNS.Identity.from_file(self.identity_path)
                self.log(f"✓ Loaded identity: {RNS.prettyhexrep(self.identity.hash)}")
            else:
                self.log("Creating new identity...")
                self.identity = RNS.Identity()
                self.identity.to_file(self.identity_path)
                self.log(f"✓ Created identity: {RNS.prettyhexrep(self.identity.hash)}")

            # Initialize LXMF message router
            self.log("Initializing LXMF router...")
            self.message_router = LXMF.LXMRouter(
                identity=self.identity,
                storagepath=os.path.join(self.config_dir, "lxmf_storage")
            )

            # Register our destination
            self.lxmf_destination = self.message_router.register_delivery_identity(
                self.identity,
                display_name="Mesh Bridge"
            )

            # Set up callbacks
            self.message_router.register_delivery_callback(self.on_lxmf_delivery)

            self.log(f"✓ LXMF destination: {RNS.prettyhexrep(self.lxmf_destination.hash)}")
            self.log("✓ Reticulum service initialized successfully")

            return True

        except Exception as e:
            self.log(f"Failed to initialize RNS: {e}", "ERROR")
            import traceback
            traceback.print_exc()
            return False

    def on_lxmf_delivery(self, message):
        """
        Callback when LXMF message is received
        Send to all connected WebSocket clients
        """
        try:
            self.log(f"LXMF message received from {RNS.prettyhexrep(message.source_hash)}")

            # Parse message
            message_data = {
                "type": "lxmf_message",
                "data": {
                    "source": RNS.hexrep(message.source_hash, delimit=False),
                    "destination": RNS.hexrep(message.destination_hash, delimit=False),
                    "content": message.content.decode('utf-8') if isinstance(message.content, bytes) else message.content,
                    "timestamp": message.timestamp,
                    "title": message.title if hasattr(message, 'title') else None,
                    "fields": message.fields if hasattr(message, 'fields') else None
                }
            }

            # Store message
            self.messages.append(message_data)

            # Broadcast to all WebSocket clients
            asyncio.run(self.broadcast_to_clients(message_data))

        except Exception as e:
            self.log(f"Error handling LXMF delivery: {e}", "ERROR")
            import traceback
            traceback.print_exc()

    async def broadcast_to_clients(self, message):
        """Broadcast message to all connected WebSocket clients"""
        if not self.ws_clients:
            return

        message_json = json.dumps(message)
        disconnected_clients = set()

        for client in self.ws_clients:
            try:
                await client.send(message_json)
            except Exception as e:
                self.log(f"Error sending to client: {e}", "WARN")
                disconnected_clients.add(client)

        # Remove disconnected clients
        self.ws_clients -= disconnected_clients

    async def handle_websocket(self, websocket):
        """Handle WebSocket connection from web GUI"""
        client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        self.log(f"WebSocket client connected: {client_id}")

        # Add to clients set
        self.ws_clients.add(websocket)

        try:
            # Send initial status
            await websocket.send(json.dumps({
                "type": "status",
                "data": {
                    "running": self.running,
                    "identity": RNS.hexrep(self.identity.hash, delimit=False),
                    "destination": RNS.hexrep(self.lxmf_destination.hash, delimit=False),
                    "display_name": "Mesh Bridge"
                }
            }))

            # Handle incoming messages
            async for message_text in websocket:
                await self.handle_client_message(websocket, message_text)

        except websockets.exceptions.ConnectionClosed:
            self.log(f"WebSocket client disconnected: {client_id}")
        except Exception as e:
            self.log(f"WebSocket error: {e}", "ERROR")
        finally:
            self.ws_clients.discard(websocket)

    async def handle_client_message(self, websocket, message_text):
        """Handle message from web GUI client"""
        try:
            message = json.loads(message_text)
            msg_type = message.get("type")
            data = message.get("data", {})

            self.log(f"Received message type: {msg_type}")

            if msg_type == "send_message":
                # Send LXMF message
                await self.send_lxmf_message(
                    destination_hash=data.get("destination"),
                    content=data.get("content"),
                    title=data.get("title")
                )

            elif msg_type == "announce":
                # Send announce
                self.lxmf_destination.announce()
                self.log("Announced destination")
                await websocket.send(json.dumps({
                    "type": "announce_sent",
                    "data": {"success": True}
                }))

            elif msg_type == "get_peers":
                # Return known peers
                await websocket.send(json.dumps({
                    "type": "peers_list",
                    "data": {"peers": list(self.peers.values())}
                }))

            elif msg_type == "get_messages":
                # Return message history
                await websocket.send(json.dumps({
                    "type": "messages_list",
                    "data": {"messages": self.messages}
                }))

            else:
                self.log(f"Unknown message type: {msg_type}", "WARN")

        except json.JSONDecodeError as e:
            self.log(f"Invalid JSON from client: {e}", "ERROR")
        except Exception as e:
            self.log(f"Error handling client message: {e}", "ERROR")
            import traceback
            traceback.print_exc()

    async def send_lxmf_message(self, destination_hash, content, title=None):
        """Send LXMF message to destination"""
        try:
            self.log(f"Sending LXMF message to {destination_hash[:16]}...")

            # Convert hex hash to bytes
            dest_hash_bytes = bytes.fromhex(destination_hash)

            # Create LXMF message
            lxm = LXMF.LXMessage(
                destination=dest_hash_bytes,
                source=self.lxmf_destination.hash,
                content=content.encode('utf-8') if isinstance(content, str) else content,
                title=title
            )

            # Send via message router
            self.message_router.handle_outbound(lxm)

            self.log(f"✓ LXMF message queued for delivery")

        except Exception as e:
            self.log(f"Error sending LXMF message: {e}", "ERROR")
            import traceback
            traceback.print_exc()

    def announce_loop(self):
        """Periodically announce our destination"""
        self.log("Started announce loop")
        while self.running:
            if self.shutdown_event.wait(600):  # Announce every 10 minutes
                break
            if self.running:
                try:
                    self.lxmf_destination.announce()
                    self.log("Periodic announce sent")
                except Exception as e:
                    self.log(f"Error in announce loop: {e}", "ERROR")

    async def run_websocket_server(self):
        """Run the WebSocket server"""
        self.log(f"Starting WebSocket server on {self.ws_host}:{self.ws_port}")
        async with websockets.serve(self.handle_websocket, self.ws_host, self.ws_port):
            self.log("✓ WebSocket server started")
            # Wait for shutdown
            while self.running:
                await asyncio.sleep(1)

    def run(self):
        """Main run loop"""
        try:
            # Ensure directories exist
            self.ensure_directories()

            # Initialize RNS and LXMF
            if not self.initialize_rns():
                self.log("Failed to initialize", "ERROR")
                sys.exit(1)

            self.running = True

            # Start announce thread
            announce_thread = Thread(target=self.announce_loop, daemon=True)
            announce_thread.start()

            # Initial announce after short delay
            time.sleep(2)
            self.lxmf_destination.announce()
            self.log("Initial announce sent")

            # Run WebSocket server (async)
            self.log("Starting WebSocket server...")
            asyncio.run(self.run_websocket_server())

        except KeyboardInterrupt:
            self.log("Interrupted by user")
        except Exception as e:
            self.log(f"Fatal error: {e}", "ERROR")
            import traceback
            traceback.print_exc()
            sys.exit(1)
        finally:
            self.shutdown()

    def shutdown(self):
        """Graceful shutdown"""
        self.log("Shutting down...")
        self.running = False
        self.shutdown_event.set()
        self.log("Reticulum service stopped")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Reticulum Service for Mesh Bridge GUI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 reticulum_service.py
  python3 reticulum_service.py --config ~/.reticulum
  python3 reticulum_service.py --ws-port 4243
        """
    )

    parser.add_argument(
        "--config",
        help="Path to RNS config directory (default: ~/.reticulum)",
        default=None
    )

    parser.add_argument(
        "--identity",
        help="Path to identity file (default: <config>/identities/meshbridge)",
        default=None
    )

    parser.add_argument(
        "--ws-host",
        help="WebSocket host (default: localhost)",
        default="localhost"
    )

    parser.add_argument(
        "--ws-port",
        help="WebSocket port (default: 4243)",
        type=int,
        default=4243
    )

    args = parser.parse_args()

    # Create and run service
    service = ReticulumService(
        config_dir=args.config,
        identity_path=args.identity,
        ws_host=args.ws_host,
        ws_port=args.ws_port
    )

    service.run()


if __name__ == "__main__":
    main()
