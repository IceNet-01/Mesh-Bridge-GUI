#!/usr/bin/env python3
"""
Diagnostic script to test Reticulum service components
Run this to find out what's failing
"""
import sys
import os
import asyncio
import json

print("=" * 60)
print("Reticulum Service Diagnostic Tool")
print("=" * 60)
print()

# Test 1: Python version
print("1. Python Version:")
print(f"   {sys.version}")
print(f"   ✅ Python {sys.version_info.major}.{sys.version_info.minor}")
print()

# Test 2: Import RNS
print("2. Testing RNS import...")
try:
    import RNS
    print(f"   ✅ RNS imported successfully")
    print(f"   Version: {RNS.__version__ if hasattr(RNS, '__version__') else 'unknown'}")
except ImportError as e:
    print(f"   ❌ Failed to import RNS: {e}")
    sys.exit(1)
print()

# Test 3: Import LXMF
print("3. Testing LXMF import...")
try:
    import LXMF
    print(f"   ✅ LXMF imported successfully")
except ImportError as e:
    print(f"   ❌ Failed to import LXMF: {e}")
    sys.exit(1)
print()

# Test 4: Import websockets
print("4. Testing websockets import...")
try:
    import websockets
    print(f"   ✅ websockets imported successfully")
    print(f"   Version: {websockets.__version__}")
except ImportError as e:
    print(f"   ❌ Failed to import websockets: {e}")
    sys.exit(1)
print()

# Test 5: Check config directory
print("5. Checking RNS config directory...")
config_dir = os.path.expanduser("~/.reticulum")
if os.path.exists(config_dir):
    print(f"   ✅ Config directory exists: {config_dir}")
    config_file = os.path.join(config_dir, "config")
    if os.path.exists(config_file):
        print(f"   ✅ Config file exists: {config_file}")
    else:
        print(f"   ⚠️  Config file missing: {config_file}")
else:
    print(f"   ⚠️  Config directory missing: {config_dir}")
print()

# Test 6: Initialize RNS
print("6. Testing RNS initialization...")
try:
    # Create minimal config
    reticulum = RNS.Reticulum(configdir=config_dir)
    print(f"   ✅ RNS initialized successfully")
    print(f"   Transport enabled: {reticulum.is_transport_enabled()}")
except Exception as e:
    print(f"   ❌ RNS initialization failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
print()

# Test 7: Create identity
print("7. Testing identity creation...")
try:
    identity = RNS.Identity()
    print(f"   ✅ Identity created: {RNS.prettyhexrep(identity.hash)}")
except Exception as e:
    print(f"   ❌ Identity creation failed: {e}")
    sys.exit(1)
print()

# Test 8: Initialize LXMF router
print("8. Testing LXMF router initialization...")
try:
    storage_path = os.path.join(config_dir, "lxmf_storage_test")
    os.makedirs(storage_path, exist_ok=True)
    message_router = LXMF.LXMRouter(identity=identity, storagepath=storage_path)
    print(f"   ✅ LXMF router initialized")

    # Register destination
    destination = message_router.register_delivery_identity(identity, display_name="Test")
    print(f"   ✅ Destination registered: {RNS.prettyhexrep(destination.hash)}")
except Exception as e:
    print(f"   ❌ LXMF router failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
print()

# Test 9: Test WebSocket server
print("9. Testing WebSocket server...")

async def test_websocket_server():
    """Test if we can start a WebSocket server"""
    try:
        # Try to start server on port 4243
        async def handler(websocket):
            message = json.dumps({"type": "test", "data": "hello"})
            await websocket.send(message)

        print("   Starting WebSocket server on 0.0.0.0:4243...")
        server = await websockets.serve(handler, "0.0.0.0", 4243)
        print("   ✅ WebSocket server started successfully")

        # Test connection from localhost
        print("   Testing connection to ws://localhost:4243...")
        async with websockets.connect("ws://localhost:4243") as ws:
            msg = await ws.recv()
            data = json.loads(msg)
            if data["type"] == "test":
                print("   ✅ WebSocket connection successful")
            else:
                print(f"   ⚠️  Unexpected message: {data}")

        # Close server
        server.close()
        await server.wait_closed()
        print("   ✅ WebSocket server stopped cleanly")
        return True

    except OSError as e:
        if "Address already in use" in str(e):
            print(f"   ⚠️  Port 4243 already in use")
            print(f"   Run: lsof -i :4243  to see what's using it")
        else:
            print(f"   ❌ WebSocket server failed: {e}")
        return False
    except Exception as e:
        print(f"   ❌ WebSocket test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

try:
    result = asyncio.run(test_websocket_server())
    if not result:
        sys.exit(1)
except Exception as e:
    print(f"   ❌ Async test failed: {e}")
    sys.exit(1)

print()
print("=" * 60)
print("✅ All diagnostic tests passed!")
print("=" * 60)
print()
print("Reticulum service should work on this machine.")
print("If it's still crashing, check the service logs for errors.")
