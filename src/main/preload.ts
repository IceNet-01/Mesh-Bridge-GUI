import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Radio operations
  scanRadios: () => ipcRenderer.invoke('scan-radios'),
  connectRadio: (port: string) => ipcRenderer.invoke('connect-radio', port),
  disconnectRadio: (radioId: string) => ipcRenderer.invoke('disconnect-radio', radioId),
  getRadios: () => ipcRenderer.invoke('get-radios'),

  // Bridge configuration
  getBridgeConfig: () => ipcRenderer.invoke('get-bridge-config'),
  updateBridgeConfig: (config: any) => ipcRenderer.invoke('update-bridge-config', config),

  // Statistics and monitoring
  getStatistics: () => ipcRenderer.invoke('get-statistics'),

  // Logging
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // Event listeners
  onRadioStatusChange: (callback: (data: any) => void) => {
    ipcRenderer.on('radio-status-change', (_, data) => callback(data));
  },
  onMessageReceived: (callback: (data: any) => void) => {
    ipcRenderer.on('message-received', (_, data) => callback(data));
  },
  onMessageForwarded: (callback: (data: any) => void) => {
    ipcRenderer.on('message-forwarded', (_, data) => callback(data));
  },
  onLogMessage: (callback: (data: any) => void) => {
    ipcRenderer.on('log-message', (_, data) => callback(data));
  },
  onStatisticsUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('statistics-update', (_, data) => callback(data));
  },
});
