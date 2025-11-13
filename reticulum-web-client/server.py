#!/usr/bin/env python3
"""
Standalone Reticulum Web Client Server

Simple HTTP server for the Reticulum LXMF web interface.
Runs independently from the main bridge application.

Features:
- Serves static HTML/CSS/JS files
- WebSocket proxy to Reticulum service (optional)
- REST API for bridge communication (optional)
- Runs on port 5555 by default
"""

import os
import sys
import json
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

class ReticulumWebHandler(SimpleHTTPRequestHandler):
    """HTTP request handler for Reticulum web client"""

    def __init__(self, *args, **kwargs):
        # Set directory to static folder
        super().__init__(*args, directory=str(Path(__file__).parent / 'static'), **kwargs)

    def end_headers(self):
        # Add CORS headers for cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        """Custom log format"""
        sys.stdout.write(f"[Reticulum Web] {self.address_string()} - {format % args}\n")

def main():
    parser = argparse.ArgumentParser(
        description="Standalone Reticulum Web Client Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 server.py
  python3 server.py --port 5555
  python3 server.py --host 0.0.0.0 --port 8888
        """
    )

    parser.add_argument(
        '--host',
        default='0.0.0.0',
        help='Host to bind to (default: 0.0.0.0)'
    )

    parser.add_argument(
        '--port',
        type=int,
        default=5555,
        help='Port to listen on (default: 5555)'
    )

    args = parser.parse_args()

    # Create static directory if it doesn't exist
    static_dir = Path(__file__).parent / 'static'
    static_dir.mkdir(exist_ok=True)

    # Start HTTP server
    server_address = (args.host, args.port)
    httpd = HTTPServer(server_address, ReticulumWebHandler)

    print("=" * 60)
    print("🔐 Reticulum Web Client Server")
    print("=" * 60)
    print(f"📡 Serving on: http://{args.host}:{args.port}")
    if args.host == '0.0.0.0':
        print(f"   Local:      http://localhost:{args.port}")
        print(f"   Network:    http://<your-ip>:{args.port}")
    print(f"📂 Static files: {static_dir}")
    print(f"🔌 WebSocket:    ws://<your-host>:4243 (Reticulum service)")
    print("=" * 60)
    print()
    print("Press Ctrl+C to stop the server")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped")
        sys.exit(0)

if __name__ == "__main__":
    main()
