#!/bin/bash

# Port cleanup script for Meshtastic Bridge
# Kills any processes using the required ports

BRIDGE_PORT=${1:-8080}

echo "🧹 Cleaning up ports..."

# Find and kill processes using the bridge port
PIDS=$(lsof -ti:${BRIDGE_PORT} 2>/dev/null)

if [ -z "$PIDS" ]; then
  echo "✅ Port ${BRIDGE_PORT} is already free"
else
  echo "🔍 Found processes on port ${BRIDGE_PORT}: ${PIDS}"
  for PID in $PIDS; do
    echo "   Killing process ${PID}..."
    kill -9 $PID 2>/dev/null || true
  done

  # Wait a moment for ports to be released
  sleep 1

  # Verify port is now free
  if lsof -ti:${BRIDGE_PORT} >/dev/null 2>&1; then
    echo "⚠️  Warning: Port ${BRIDGE_PORT} may still be in use"
    exit 1
  else
    echo "✅ Port ${BRIDGE_PORT} is now free"
  fi
fi

echo "✅ Port cleanup complete"
