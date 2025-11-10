import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { RadioManager } from './radioManager';
import { setupAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let radioManager: RadioManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0f172a',
    title: 'Meshtastic Bridge GUI',
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  radioManager = new RadioManager(mainWindow);

  // Setup auto-updater in production
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
    if (mainWindow) {
      setupAutoUpdater(mainWindow);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('scan-radios', async () => {
  return await radioManager.scanForRadios();
});

ipcMain.handle('connect-radio', async (_, port: string) => {
  return await radioManager.connectRadio(port);
});

ipcMain.handle('disconnect-radio', async (_, radioId: string) => {
  return await radioManager.disconnectRadio(radioId);
});

ipcMain.handle('get-radios', () => {
  return radioManager.getRadios();
});

ipcMain.handle('get-bridge-config', () => {
  return radioManager.getBridgeConfig();
});

ipcMain.handle('update-bridge-config', (_, config) => {
  return radioManager.updateBridgeConfig(config);
});

ipcMain.handle('get-statistics', () => {
  return radioManager.getStatistics();
});

ipcMain.handle('clear-logs', () => {
  return radioManager.clearLogs();
});

ipcMain.handle('get-logs', () => {
  return radioManager.getLogs();
});
