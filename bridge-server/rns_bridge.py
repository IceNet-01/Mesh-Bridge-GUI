#!/usr/bin/env python3 -u
"""
Reticulum Network Stack Bridge for Mesh Bridge GUI

This script provides a bridge between the Node.js bridge server and the
Reticulum Network Stack (RNS). It allows the Mesh Bridge to use full
Reticulum capabilities without requiring physical RNode hardware.

INSTALLATION:
    Install Reticulum Network Stack:
        pip install rns

    Or using pip3:
        pip3 install rns

    For system-wide installation:
        sudo pip3 install rns

Communication Protocol:
- Input (stdin): JSON messages from Node.js
- Output (stdout): JSON messages to Node.js
- Errors (stderr): Error messages and logs

Capabilities:
- Software-only RNS operation (no hardware required)
- UDP and TCP network interfaces
- Cryptographic identity management
- Destination-based addressing
- Link establishment
- Message forwarding
- Announce packets
"""

import sys
import json
import time
import os
from threading import Thread, Event
import argparse

# Check if RNS is installed and provide helpful error message
try:
    import RNS
except ImportError as e:
    print("\n" + "="*70, file=sys.stderr)
    print("ERROR: Reticulum Network Stack (RNS) is not installed!", file=sys.stderr)
    print("="*70, file=sys.stderr)
    print("\nTo install RNS, run one of the following commands:", file=sys.stderr)
    print("  pip install rns", file=sys.stderr)
    print("  pip3 install rns", file=sys.stderr)
    print("  sudo pip3 install rns  (for system-wide installation)", file=sys.stderr)
    print("\nFor more information, visit: https://reticulum.network/", file=sys.stderr)
    print("="*70 + "\n", file=sys.stderr)
    sys.exit(1)

class RNSBridge:
    def __init__(self, config_path=None, identity_path=None):
        """Initialize the RNS bridge"""
        self.rns = None
        self.identity = None
        self.destination = None
        self.running = False

        # Use provided paths or default to ~/.reticulum
        default_config_dir = os.path.expanduser("~/.reticulum")
        self.config_path = config_path or default_config_dir
        self.identity_path = identity_path or os.path.join(self.config_path, "bridge_identity")

        self.destinations = {}  # Track discovered destinations
        self.links = {}  # Track established links
        self.rnode_interfaces = {}  # Track RNode transports by port path

        # Event for signaling shutdown
        self.shutdown_event = Event()

        # Ensure config directory exists
        self._ensure_config_dir()

    def log(self, message, level="INFO"):
        """Log to stderr (so stdout remains clean for JSON)"""
        sys.stderr.write(f"[RNS-Bridge {level}] {message}\n")
        sys.stderr.flush()

    def _ensure_config_dir(self):
        """Ensure RNS config directory exists with network-capable config"""
        # Create config directory if it doesn't exist
        if not os.path.exists(self.config_path):
            os.makedirs(self.config_path, exist_ok=True)
            self.log(f"Created RNS config directory: {self.config_path}")

        # Create config file if it doesn't exist
        config_file = os.path.join(self.config_path, "config")
        if os.path.exists(config_file):
            self.log(f"Using existing RNS config: {config_file}")
            self.log("NOTE: If experiencing slow initialization, delete config to regenerate without AutoInterface")
        else:
            network_config = """# Reticulum configuration for Mesh Bridge
# Network-capable configuration using UDP for mesh networking
# AutoInterface is disabled to prevent slow interface probing

[reticulum]
enable_transport = yes
share_instance = yes
shared_instance_port = 37428
instance_control_port = 37429

[logging]
loglevel = 4

# UDP Interface for network mesh communication
[[UDP Interface]]
  type = UDPInterface
  interface_enabled = yes
  listen_ip = 0.0.0.0
  listen_port = 4242
  forward_ip = 255.255.255.255
  forward_port = 4242

# Optionally connect to public testnet
# [[TCP Client]]
#   type = TCPClientInterface
#   interface_enabled = no
#   target_host = reticulum.betweentheborders.com
#   target_port = 4242
"""
            with open(config_file, 'w') as f:
                f.write(network_config)
            self.log(f"Created network-capable RNS config: {config_file}")

    def send_message(self, msg_type, data):
        """Send JSON message to Node.js via stdout"""
        try:
            message = json.dumps({"type": msg_type, "data": data, "timestamp": time.time()})
            sys.stdout.write(message + "\n")
            sys.stdout.flush()
        except Exception as e:
            self.log(f"Error sending message: {e}", "ERROR")

    def initialize_rns(self):
        """Initialize Reticulum Network Stack"""
        try:
            self.log("Initializing Reticulum Network Stack...")
            sys.stderr.flush()

            # Initialize RNS with config
            self.log("Creating RNS.Reticulum instance...")
            sys.stderr.flush()
            self.rns = RNS.Reticulum(configdir=self.config_path)
            self.log(f"✓ RNS initialized with config from: {self.config_path}")
            sys.stderr.flush()

            # Load or create identity (following NomadNet pattern)
            self.log("Loading or creating identity...")
            sys.stderr.flush()
            self.identity = RNS.Identity.from_file(self.identity_path)
            if self.identity is None:
                self.log("No existing identity found, creating new one...")
                sys.stderr.flush()
                self.identity = RNS.Identity()
                self.identity.to_file(self.identity_path)
                self.log(f"✓ Created new identity: {self.identity_path}")
            else:
                self.log(f"✓ Loaded existing identity: {self.identity_path}")
            sys.stderr.flush()

            # Create a destination for receiving messages
            self.log("Creating destination...")
            sys.stderr.flush()
            self.destination = RNS.Destination(
                self.identity,
                RNS.Destination.IN,
                RNS.Destination.SINGLE,
                "meshbridge",
                "messages"
            )
            self.log(f"✓ Destination created: {RNS.prettyhexrep(self.destination.hash)}")
            sys.stderr.flush()

            # Set up callbacks
            self.log("Setting up callbacks...")
            sys.stderr.flush()
            self.destination.set_packet_callback(self.packet_received)
            self.destination.set_link_established_callback(self.link_established)
            self.log("✓ Callbacks configured")
            sys.stderr.flush()

            # Send initialization complete message
            self.log("Sending init message to Node.js...")
            sys.stderr.flush()
            self.send_message("init", {
                "identity": {
                    "hash": RNS.hexrep(self.identity.hash, delimit=False),
                    "public_key": RNS.hexrep(self.identity.get_public_key(), delimit=False),
                    "name": "Mesh Bridge Node"
                },
                "destination": {
                    "hash": RNS.hexrep(self.destination.hash, delimit=False),
                    "name": "meshbridge.messages"
                }
            })
            self.log("✓ Init message sent")
            sys.stderr.flush()

            self.log("RNS bridge initialized successfully")
            self.running = True
            return True

        except Exception as e:
            self.log(f"Failed to initialize RNS: {e}", "ERROR")
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            return False

    def packet_received(self, data, packet):
        """Callback when a packet is received"""
        try:
            self.log(f"Packet received from {RNS.prettyhexrep(packet.destination_hash)}")

            # Decode packet data
            try:
                text = data.decode('utf-8')
            except:
                text = data.hex()

            # Send to Node.js
            self.send_message("message", {
                "from_hash": RNS.hexrep(packet.destination_hash, delimit=False) if hasattr(packet, 'destination_hash') else "unknown",
                "to_hash": RNS.hexrep(self.destination.hash, delimit=False),
                "text": text,
                "rssi": packet.rssi if hasattr(packet, 'rssi') else None,
                "snr": packet.snr if hasattr(packet, 'snr') else None
            })

        except Exception as e:
            self.log(f"Error handling received packet: {e}", "ERROR")

    def link_established(self, link):
        """Callback when a link is established"""
        try:
            self.log(f"Link established: {RNS.prettyhexrep(link.destination.hash)}")
            self.links[RNS.hexrep(link.destination.hash, delimit=False)] = link

            self.send_message("link_established", {
                "destination_hash": RNS.hexrep(link.destination.hash, delimit=False),
                "link_id": RNS.hexrep(link.link_id, delimit=False)
            })
        except Exception as e:
            self.log(f"Error handling link established: {e}", "ERROR")

    def send_packet(self, dest_hash, text):
        """Send a packet to a destination"""
        try:
            # Convert hex hash to bytes
            dest_hash_bytes = bytes.fromhex(dest_hash)

            # Create or get destination
            if dest_hash not in self.destinations:
                # Create a new single destination reference
                destination = RNS.Destination(
                    None,
                    RNS.Destination.OUT,
                    RNS.Destination.SINGLE,
                    "meshbridge",
                    "messages"
                )
                destination.hash = dest_hash_bytes
                self.destinations[dest_hash] = destination
                self.log(f"Created new destination reference: {dest_hash}")
            else:
                destination = self.destinations[dest_hash]

            # Send packet
            data = text.encode('utf-8')
            packet = RNS.Packet(destination, data)
            receipt = packet.send()

            if receipt:
                self.log(f"Packet sent to {dest_hash[:16]}...")
                self.send_message("send_success", {
                    "destination_hash": dest_hash,
                    "packet_id": RNS.hexrep(receipt.hash, delimit=False) if receipt else None
                })
            else:
                self.log(f"Failed to send packet to {dest_hash[:16]}...", "WARN")
                self.send_message("send_failed", {
                    "destination_hash": dest_hash,
                    "error": "No receipt received"
                })

        except Exception as e:
            self.log(f"Error sending packet: {e}", "ERROR")
            self.send_message("send_failed", {
                "destination_hash": dest_hash,
                "error": str(e)
            })

    def announce(self):
        """Announce our destination to the network"""
        try:
            self.destination.announce()
            self.log("Announced destination to network")
            self.send_message("announce_sent", {
                "destination_hash": RNS.hexrep(self.destination.hash, delimit=False)
            })
        except Exception as e:
            self.log(f"Error announcing: {e}", "ERROR")

    def add_rnode_transport(self, port_path, config=None):
        """Add an RNode device as a transport for RNS"""
        try:
            if port_path in self.rnode_interfaces:
                self.log(f"RNode transport already exists: {port_path}", "WARN")
                return False

            self.log(f"Adding RNode transport: {port_path}")

            # Create RNode interface configuration
            # Default RNode settings
            interface_config = {
                "port": port_path,
                "speed": config.get("baudRate", 115200) if config else 115200,
                "frequency": config.get("frequency", 915000000) if config else 915000000,
                "bandwidth": config.get("bandwidth", 125000) if config else 125000,
                "txpower": config.get("txPower", 17) if config else 17,
                "spreadingfactor": config.get("spreadingFactor", 7) if config else 7,
                "codingrate": config.get("codingRate", 5) if config else 5,
            }

            # Create RNodeInterface
            rnode_interface = RNS.Interfaces.RNodeInterface.RNodeInterface(
                RNS.Transport,
                f"RNode_{port_path.replace('/', '_')}",
                port=interface_config["port"],
                frequency=interface_config["frequency"],
                bandwidth=interface_config["bandwidth"],
                txpower=interface_config["txpower"],
                sf=interface_config["spreadingfactor"],
                cr=interface_config["codingrate"],
                flow_control=False,
                id_interval=None,
                id_callsign=None
            )

            # Store interface
            self.rnode_interfaces[port_path] = {
                "interface": rnode_interface,
                "config": interface_config,
                "messages_sent": 0,
                "messages_received": 0,
                "connected": True
            }

            self.log(f"✓ RNode transport added: {port_path}")
            self.send_message("transport_added", {
                "type": "rnode",
                "port": port_path,
                "config": interface_config
            })
            return True

        except Exception as e:
            self.log(f"Error adding RNode transport {port_path}: {e}", "ERROR")
            import traceback
            traceback.print_exc(file=sys.stderr)
            self.send_message("transport_error", {
                "port": port_path,
                "error": str(e)
            })
            return False

    def remove_rnode_transport(self, port_path):
        """Remove an RNode transport"""
        try:
            if port_path not in self.rnode_interfaces:
                self.log(f"RNode transport not found: {port_path}", "WARN")
                return False

            self.log(f"Removing RNode transport: {port_path}")

            # Get interface
            transport_info = self.rnode_interfaces[port_path]
            interface = transport_info["interface"]

            # Detach from RNS
            if hasattr(interface, 'detach'):
                interface.detach()

            # Remove from tracking
            del self.rnode_interfaces[port_path]

            self.log(f"✓ RNode transport removed: {port_path}")
            self.send_message("transport_removed", {
                "type": "rnode",
                "port": port_path
            })
            return True

        except Exception as e:
            self.log(f"Error removing RNode transport {port_path}: {e}", "ERROR")
            return False

    def list_transports(self):
        """List all active transports"""
        try:
            transports = []

            # Add RNode transports
            for port_path, info in self.rnode_interfaces.items():
                transports.append({
                    "type": "rnode",
                    "port": port_path,
                    "connected": info["connected"],
                    "messages_sent": info["messages_sent"],
                    "messages_received": info["messages_received"],
                    "config": info["config"]
                })

            # Add software transports (UDP, TCP, etc.) - from RNS Transport
            # This would require querying RNS.Transport for configured interfaces
            # For now, we'll report what we know from config

            self.send_message("transports_list", {
                "transports": transports,
                "total": len(transports)
            })

        except Exception as e:
            self.log(f"Error listing transports: {e}", "ERROR")

    def handle_command(self, command):
        """Handle a command from Node.js"""
        try:
            cmd_type = command.get("type")
            data = command.get("data", {})

            if cmd_type == "send":
                # Send a message to a destination
                dest_hash = data.get("destination_hash")
                text = data.get("text")
                if dest_hash and text:
                    self.send_packet(dest_hash, text)
                else:
                    self.log("Invalid send command: missing destination or text", "ERROR")

            elif cmd_type == "announce":
                # Announce our destination
                self.announce()

            elif cmd_type == "ping":
                # Respond to ping
                self.send_message("pong", {})

            elif cmd_type == "shutdown":
                # Graceful shutdown
                self.log("Shutdown requested")
                self.running = False
                self.shutdown_event.set()

            elif cmd_type == "add_rnode":
                # Add RNode as transport
                port_path = data.get("port")
                config = data.get("config", {})
                if port_path:
                    self.add_rnode_transport(port_path, config)
                else:
                    self.log("Invalid add_rnode command: missing port", "ERROR")

            elif cmd_type == "remove_rnode":
                # Remove RNode transport
                port_path = data.get("port")
                if port_path:
                    self.remove_rnode_transport(port_path)
                else:
                    self.log("Invalid remove_rnode command: missing port", "ERROR")

            elif cmd_type == "list_transports":
                # List all transports
                self.list_transports()

            else:
                self.log(f"Unknown command type: {cmd_type}", "WARN")

        except Exception as e:
            self.log(f"Error handling command: {e}", "ERROR")
            import traceback
            traceback.print_exc(file=sys.stderr)

    def listen_stdin(self):
        """Listen for commands from Node.js on stdin"""
        try:
            self.log("Started listening for commands on stdin")
            for line in sys.stdin:
                if not self.running:
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    command = json.loads(line)
                    self.handle_command(command)
                except json.JSONDecodeError as e:
                    self.log(f"Invalid JSON received: {e}", "ERROR")
                except Exception as e:
                    self.log(f"Error processing command: {e}", "ERROR")

        except Exception as e:
            self.log(f"Error in stdin listener: {e}", "ERROR")
            self.running = False

    def announce_loop(self):
        """Periodically announce our destination"""
        try:
            self.log("Started announce loop")
            while self.running:
                if self.shutdown_event.wait(600):  # Announce every 10 minutes, or on shutdown
                    break
                if self.running:
                    self.announce()
        except Exception as e:
            self.log(f"Error in announce loop: {e}", "ERROR")

    def run(self):
        """Main run loop"""
        try:
            # Initialize RNS
            if not self.initialize_rns():
                self.log("Failed to initialize RNS", "ERROR")
                sys.exit(1)

            # Start announce thread
            announce_thread = Thread(target=self.announce_loop, daemon=True)
            announce_thread.start()

            # Start stdin listener thread
            stdin_thread = Thread(target=self.listen_stdin, daemon=True)
            stdin_thread.start()

            # Wait for interfaces to stabilize before first announce (NomadNet pattern)
            self.log("Waiting 3 seconds for interfaces to stabilize...")
            time.sleep(3)

            # Initial announce
            self.announce()

            # Keep running while threads are active
            while self.running:
                time.sleep(0.1)

            self.log("Bridge shutting down...")
            self.shutdown_event.set()

            # Wait for threads to complete
            stdin_thread.join(timeout=1)
            announce_thread.join(timeout=1)

            self.log("Bridge shut down successfully")

        except KeyboardInterrupt:
            self.log("Interrupted by user", "INFO")
        except Exception as e:
            self.log(f"Fatal error in run loop: {e}", "ERROR")
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Reticulum Network Stack Bridge")
    parser.add_argument("--config", help="Path to RNS config directory", default=None)
    parser.add_argument("--identity", help="Path to identity file", default=None)
    parser.add_argument("port", nargs="?", help="Serial port (optional, for compatibility)", default=None)

    args = parser.parse_args()

    # Create and run bridge
    bridge = RNSBridge(config_path=args.config, identity_path=args.identity)
    bridge.run()

if __name__ == "__main__":
    main()
