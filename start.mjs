#!/usr/bin/env node
/**
 * Mesh Bridge GUI - Unified Startup Script
 *
 * Launches all three ecosystem services and web interfaces:
 * 1. Bridge Server (Meshtastic, LoRa) - Node.js - Port 3000
 * 2. Reticulum Service (LXMF Backend) - Python - Port 4243
 * 3. Reticulum Web Client (LXMF UI) - Python - Port 5555
 * 4. MeshCore Service (Future) - Python
 * 5. Main Web GUI - Vite dev server - Port 5173
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(emoji, color, message) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

function logInfo(message) {
  log('ℹ️', colors.cyan, message);
}

function logSuccess(message) {
  log('✅', colors.green, message);
}

function logError(message) {
  log('❌', colors.red, message);
}

function logWarning(message) {
  log('⚠️', colors.yellow, message);
}

class MeshBridgeApp {
  constructor() {
    this.services = {};
    this.shuttingDown = false;
  }

  /**
   * Check if Python dependencies are installed
   */
  checkPythonDeps() {
    logInfo('Checking Python dependencies...');

    try {
      const result = spawn('python3', ['-c', 'import RNS, LXMF, websockets'], {
        stdio: 'pipe'
      });

      return new Promise((resolve) => {
        result.on('close', (code) => {
          if (code === 0) {
            logSuccess('Python dependencies OK');
            resolve(true);
          } else {
            logWarning('Python dependencies missing or incomplete');
            logInfo('To install: pip3 install -r reticulum-service/requirements.txt');
            logInfo('Reticulum service will not start without dependencies');
            resolve(false);
          }
        });
      });
    } catch (error) {
      logWarning('Could not check Python dependencies');
      return false;
    }
  }

  /**
   * Start Bridge Server (Ecosystem 1: Meshtastic, LoRa)
   */
  startBridgeServer() {
    log('📡', colors.blue, 'Starting Bridge Server (Meshtastic, LoRa)...');

    const bridgeServerPath = join(__dirname, 'bridge-server', 'index.mjs');

    if (!fs.existsSync(bridgeServerPath)) {
      logError(`Bridge server not found: ${bridgeServerPath}`);
      return null;
    }

    const bridgeServer = spawn('node', [bridgeServerPath], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' }
    });

    bridgeServer.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.blue}[Bridge]${colors.reset} ${line.trim()}`);
        }
      });
    });

    bridgeServer.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.blue}[Bridge]${colors.reset} ${colors.red}${line.trim()}${colors.reset}`);
        }
      });
    });

    bridgeServer.on('close', (code) => {
      if (!this.shuttingDown) {
        logError(`Bridge Server exited with code ${code}`);
      }
    });

    bridgeServer.on('error', (error) => {
      logError(`Bridge Server error: ${error.message}`);
    });

    return bridgeServer;
  }

  /**
   * Start Reticulum Service (Ecosystem 2: LXMF)
   */
  startReticulumService() {
    log('🔐', colors.magenta, 'Starting Reticulum Service (LXMF)...');

    const reticulumServicePath = join(__dirname, 'reticulum-service', 'reticulum_service.py');

    if (!fs.existsSync(reticulumServicePath)) {
      logError(`Reticulum service not found: ${reticulumServicePath}`);
      return null;
    }

    const reticulumService = spawn('python3', [reticulumServicePath], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    reticulumService.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.magenta}[Reticulum]${colors.reset} ${line.trim()}`);
        }
      });
    });

    reticulumService.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.magenta}[Reticulum]${colors.reset} ${line.trim()}`);
        }
      });
    });

    reticulumService.on('close', (code) => {
      if (!this.shuttingDown) {
        logWarning(`Reticulum Service exited with code ${code}`);
        // Auto-restart after 3 seconds
        logInfo('Restarting Reticulum Service in 3 seconds...');
        setTimeout(() => {
          if (!this.shuttingDown) {
            this.services.reticulumService = this.startReticulumService();
          }
        }, 3000);
      }
    });

    reticulumService.on('error', (error) => {
      logError(`Reticulum Service error: ${error.message}`);
    });

    return reticulumService;
  }

  /**
   * Start MeshCore Service (Ecosystem 3: Future)
   */
  startMeshCoreService() {
    // Not implemented yet - placeholder
    log('🌐', colors.yellow, 'MeshCore Service (not yet implemented - placeholder)');
    return null;
  }

  /**
   * Start Reticulum Web Client (Standalone LXMF UI)
   */
  startReticulumWebClient() {
    log('💬', colors.green, 'Starting Reticulum Web Client (Standalone LXMF UI)...');

    const webClientServerPath = join(__dirname, 'reticulum-web-client', 'server.py');

    if (!fs.existsSync(webClientServerPath)) {
      logError(`Reticulum web client not found: ${webClientServerPath}`);
      return null;
    }

    const webClientServer = spawn('python3', ['server.py', '--port', '5555'], {
      cwd: join(__dirname, 'reticulum-web-client'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    webClientServer.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.green}[LXMF Web]${colors.reset} ${line.trim()}`);
        }
      });
    });

    webClientServer.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.green}[LXMF Web]${colors.reset} ${line.trim()}`);
        }
      });
    });

    webClientServer.on('close', (code) => {
      if (!this.shuttingDown) {
        logWarning(`Reticulum Web Client exited with code ${code}`);
      }
    });

    webClientServer.on('error', (error) => {
      logError(`Reticulum Web Client error: ${error.message}`);
    });

    return webClientServer;
  }

  /**
   * Start Web GUI
   */
  startWebGUI() {
    log('🌐', colors.cyan, 'Starting Web GUI...');

    const webServer = spawn('npm', ['run', 'dev'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    webServer.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.cyan}[Web]${colors.reset} ${line.trim()}`);
        }
      });
    });

    webServer.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${colors.cyan}[Web]${colors.reset} ${line.trim()}`);
        }
      });
    });

    webServer.on('close', (code) => {
      if (!this.shuttingDown) {
        logError(`Web GUI exited with code ${code}`);
      }
    });

    webServer.on('error', (error) => {
      logError(`Web GUI error: ${error.message}`);
    });

    return webServer;
  }

  /**
   * Start all services
   */
  async start() {
    console.log('\n' + '='.repeat(60));
    log('🚀', colors.bright, 'Mesh Bridge GUI - Three-Ecosystem Architecture');
    console.log('='.repeat(60) + '\n');

    // Check Python dependencies
    const pythonDepsOk = await this.checkPythonDeps();
    console.log();

    // Start services with delays to prevent output mixing
    this.services.bridgeServer = this.startBridgeServer();
    await this.delay(500);

    if (pythonDepsOk) {
      this.services.reticulumService = this.startReticulumService();
      await this.delay(500);

      // Start standalone Reticulum web client
      this.services.reticulumWebClient = this.startReticulumWebClient();
      await this.delay(500);
    } else {
      logWarning('Skipping Reticulum Service (dependencies not installed)');
    }

    // MeshCore service (future)
    this.services.meshcoreService = this.startMeshCoreService();
    await this.delay(500);

    // Start web GUI last
    this.services.webGUI = this.startWebGUI();

    // Give services time to start
    await this.delay(2000);

    console.log('\n' + '='.repeat(60));
    logSuccess('All services started!');
    console.log('='.repeat(60));
    console.log();
    console.log(`  ${colors.bright}Services:${colors.reset}`);
    console.log(`  ${colors.blue}📡 Bridge Server:${colors.reset}     http://localhost:3000/api`);

    if (pythonDepsOk) {
      console.log(`  ${colors.magenta}🔐 Reticulum Service:${colors.reset}  ws://localhost:4243`);
    } else {
      console.log(`  ${colors.yellow}🔐 Reticulum Service:${colors.reset}  ${colors.red}(not started)${colors.reset}`);
    }

    console.log(`  ${colors.yellow}🌐 MeshCore Service:${colors.reset}   ${colors.yellow}(future)${colors.reset}`);
    console.log();
    console.log(`  ${colors.bright}Web Interfaces:${colors.reset}`);
    console.log(`  ${colors.cyan}🌐 Main Web GUI:${colors.reset}       http://localhost:5173`);

    if (pythonDepsOk) {
      console.log(`  ${colors.green}💬 LXMF Web Client:${colors.reset}   http://localhost:5555`);
    } else {
      console.log(`  ${colors.yellow}💬 LXMF Web Client:${colors.reset}   ${colors.red}(not started)${colors.reset}`);
    }

    console.log();
    console.log(`  ${colors.bright}Press Ctrl+C to stop all services${colors.reset}`);
    console.log('='.repeat(60) + '\n');

    // Handle shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Setup graceful shutdown
   */
  setupShutdownHandlers() {
    const shutdown = async () => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;

      console.log('\n\n' + '='.repeat(60));
      log('🛑', colors.yellow, 'Shutting down Mesh Bridge GUI...');
      console.log('='.repeat(60) + '\n');

      // Kill all services
      for (const [name, service] of Object.entries(this.services)) {
        if (service) {
          logInfo(`Stopping ${name}...`);
          service.kill('SIGTERM');
        }
      }

      // Wait a bit for graceful shutdown
      await this.delay(1000);

      // Force kill if still running
      for (const [name, service] of Object.entries(this.services)) {
        if (service && !service.killed) {
          logWarning(`Force killing ${name}...`);
          service.kill('SIGKILL');
        }
      }

      console.log();
      logSuccess('All services stopped');
      console.log('='.repeat(60) + '\n');

      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logError(`Uncaught exception: ${error.message}`);
      console.error(error);
      shutdown();
    });
  }

  /**
   * Utility: delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
const app = new MeshBridgeApp();
app.start().catch((error) => {
  logError(`Failed to start: ${error.message}`);
  console.error(error);
  process.exit(1);
});
