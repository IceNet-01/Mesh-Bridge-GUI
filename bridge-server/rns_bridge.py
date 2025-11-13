#!/usr/bin/env python3
"""
Reticulum Network Stack Bridge for Mesh Bridge GUI

This script provides a bridge between the Node.js bridge server and the
Reticulum Network Stack (RNS). It allows the Mesh Bridge to use full
Reticulum capabilities without requiring physical RNode hardware.

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
import RNS
from threading import Thread, Event
import argparse

class RNSBridge:
    def __init__(self, config_path=None, identity_path=None):
        """Initialize the RNS bridge"""
        self.rns = None
        self.identity = None
        self.destination = None
        self.running = False
        self.config_path = config_path or RNS.Reticulum.configdir
        self.identity_path = identity_path or f"{RNS.Reticulum.configdir}/bridge_identity"
        self.destinations = {}  # Track discovered destinations
        self.links = {}  # Track established links

        # Event for signaling shutdown
        self.shutdown_event = Event()

    def log(self, message, level="INFO"):
        """Log to stderr (so stdout remains clean for JSON)"""
        sys.stderr.write(f"[RNS-Bridge {level}] {message}\n")
        sys.stderr.flush()

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

            # Initialize RNS with config
            self.rns = RNS.Reticulum(configdir=self.config_path)
            self.log(f"RNS initialized with config from: {self.config_path}")

            # Load or create identity
            if RNS.Identity.from_file(self.identity_path):
                self.identity = RNS.Identity.from_file(self.identity_path)
                self.log(f"Loaded existing identity from: {self.identity_path}")
            else:
                self.identity = RNS.Identity()
                self.identity.to_file(self.identity_path)
                self.log(f"Created new identity and saved to: {self.identity_path}")

            # Create a destination for receiving messages
            self.destination = RNS.Destination(
                self.identity,
                RNS.Destination.IN,
                RNS.Destination.SINGLE,
                "meshbridge",
                "messages"
            )

            # Set up callbacks
            self.destination.set_packet_callback(self.packet_received)
            self.destination.set_link_established_callback(self.link_established)

            self.log(f"Destination created: {RNS.prettyhexrep(self.destination.hash)}")

            # Send initialization complete message
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

            self.log("RNS bridge initialized successfully")
            self.running = True
            return True

        except Exception as e:
            self.log(f"Failed to initialize RNS: {e}", "ERROR")
            import traceback
            traceback.print_exc(file=sys.stderr)
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
