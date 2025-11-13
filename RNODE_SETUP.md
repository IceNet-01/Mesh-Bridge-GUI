# RNode Setup Guide

## Overview

RNode is a physical LoRa radio device that provides the **actual mesh networking** capability for Reticulum. Without an RNode (or similar radio), you can only communicate via internet (TCP/UDP/AutoInterface).

## Prerequisites

- RNode device (v2.x or higher recommended)
- USB cable
- Reticulum with LXMF support installed

## Quick Start

### 1. Connect Your RNode

Connect your RNode device via USB to your computer.

### 2. Find the Serial Port

**Linux:**
```bash
ls /dev/ttyACM* /dev/ttyUSB*
# Usually: /dev/ttyACM0 or /dev/ttyUSB0
```

**macOS:**
```bash
ls /dev/cu.usbmodem*
# Usually: /dev/cu.usbmodem1101 or similar
```

**Windows:**
```
Check Device Manager → Ports (COM & LPT)
# Usually: COM3, COM4, etc.
```

### 3. Configure RNode Interface

Edit the Reticulum config file:

```bash
nano ~/.reticulum/config
```

Find the `[[RNode Interface]]` section and configure:

```ini
[[RNode Interface]]
  type = RNodeInterface
  interface_enabled = yes  # ⚠️ ENABLE THIS!

  # Set your port (from step 2)
  port = /dev/ttyACM0      # ⚠️ CHANGE THIS!

  # Radio settings for 915 MHz (US) - adjust for your region
  frequency = 915000000     # 915 MHz (US) or 868000000 (EU/UK)
  bandwidth = 125000        # 125 kHz
  txpower = 17              # 17 dBm (max for most RNodes)
  spreadingfactor = 9       # 7-12 (9 is good balance)
  codingrate = 6            # 5-8 (6 is recommended)
```

### 4. Verify RNode Connection

Before starting the service, test the RNode:

```bash
# Install rnodeconf if not installed
pip3 install rnodeconf

# Test RNode connection
rnodeconf /dev/ttyACM0

# Should show RNode firmware version and status
```

### 5. Restart Reticulum Service

```bash
# If using npm start
npm run start

# Or manually restart just Reticulum
fuser -k 4243/tcp
python3 reticulum-service/reticulum_service.py
```

### 6. Verify RNode is Active

Check the Reticulum startup logs for:

```
[INFO] RNode Interface: /dev/ttyACM0 - Online
[INFO] Frequency: 915.000 MHz
[INFO] Bandwidth: 125 kHz
[INFO] SF: 9, CR: 4/6
```

## Configuration Guide

### Frequency Selection

| Region | Frequency | Notes |
|--------|-----------|-------|
| **North America (US)** | 915 MHz | ISM band, license-free |
| **Europe (EU/UK)** | 868 MHz | ISM band, license-free |
| **Australia** | 915 MHz or 433 MHz | Check local regulations |
| **Asia** | Varies | Check local regulations |

### Spreading Factor (SF)

| SF | Range | Speed | Best For |
|----|-------|-------|----------|
| 7 | Shortest | Fastest | Urban, short range |
| 8 | Short | Fast | Suburban |
| **9** | **Medium** | **Balanced** | **Recommended default** |
| 10 | Long | Slow | Rural |
| 11 | Longer | Slower | Long range |
| 12 | Longest | Slowest | Maximum range |

### Bandwidth

| Bandwidth | Notes |
|-----------|-------|
| 125 kHz | **Recommended** - best balance |
| 250 kHz | Faster but shorter range |
| 500 kHz | Fastest but shortest range |

### Transmit Power

| TX Power | Notes |
|----------|-------|
| 2 dBm | Minimum, very short range |
| 10 dBm | Low power, battery saving |
| **17 dBm** | **Maximum for most RNodes** |
| 20+ dBm | Requires power amplifier |

## Example Configurations

### Urban/Short Range (Fast)
```ini
frequency = 915000000
bandwidth = 250000
txpower = 10
spreadingfactor = 7
codingrate = 5
```

### Balanced (Recommended)
```ini
frequency = 915000000
bandwidth = 125000
txpower = 17
spreadingfactor = 9
codingrate = 6
```

### Long Range (Rural)
```ini
frequency = 915000000
bandwidth = 125000
txpower = 17
spreadingfactor = 11
codingrate = 8
```

## Troubleshooting

### RNode Not Detected

1. **Check USB connection**: Try a different USB cable/port
2. **Check permissions**:
   ```bash
   sudo usermod -a -G dialout $USER
   # Log out and back in
   ```
3. **Check RNode firmware**:
   ```bash
   rnodeconf /dev/ttyACM0 --info
   ```

### No Communication with Other Nodes

1. **Verify same frequency**: All nodes must use same frequency
2. **Verify same SF/BW/CR**: Radio settings must match
3. **Check antenna**: Ensure antenna is properly connected
4. **Check range**: Start with devices close together (~1m)

### Service Won't Start

1. **Check port**: Verify correct port in config
2. **Check permissions**: User must have access to serial port
3. **Check logs**:
   ```bash
   cat /tmp/retic-*.log
   ```

## Advanced: Multiple RNodes

You can run multiple RNodes for redundancy or different frequencies:

```ini
[[RNode Interface A]]
  type = RNodeInterface
  interface_enabled = yes
  port = /dev/ttyACM0
  frequency = 915000000
  # ... settings ...

[[RNode Interface B]]
  type = RNodeInterface
  interface_enabled = yes
  port = /dev/ttyACM1
  frequency = 868000000
  # ... settings ...
```

## References

- [RNode Documentation](https://unsigned.io/rnode/)
- [Reticulum Manual](https://markqvist.github.io/Reticulum/manual/)
- [LXMF Specification](https://github.com/markqvist/lxmf)
- [NomadNet (Reference LXMF client)](https://github.com/markqvist/nomadnet)

## Your Specific Setup

Based on your requirements:

```ini
[[RNode Interface]]
  type = RNodeInterface
  interface_enabled = yes
  port = /dev/ttyACM0         # Or /dev/cu.usbmodem1101 on macOS
  frequency = 915000000        # 915 MHz
  bandwidth = 125000           # 125 kHz
  txpower = 17                 # 17 dBm
  spreadingfactor = 9          # SF9
  codingrate = 6               # CR 4/6
```

After configuring, restart the service and verify the RNode shows as "Online" in the logs.
