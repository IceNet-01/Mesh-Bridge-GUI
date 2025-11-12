import { create } from 'zustand';
import { WebSocketRadioManager } from '../lib/webSocketManager';
import type { Radio, Statistics, LogEntry, BridgeConfig, Message } from '../types';

interface AppStore {
  // Manager instance
  manager: WebSocketRadioManager;

  // State
  bridgeConnected: boolean;
  radios: Radio[];
  statistics: Statistics | null;
  logs: LogEntry[];
  messages: Message[];
  bridgeConfig: BridgeConfig | null;

  // Actions
  initialize: () => void;
  connectToBridge: () => Promise<{ success: boolean; error?: string }>;
  scanAndConnectRadio: () => Promise<void>;
  disconnectRadio: (radioId: string) => Promise<void>;
  updateBridgeConfig: (config: Partial<BridgeConfig>) => void;
  clearLogs: () => void;
}

export const useStore = create<AppStore>((set) => {
  const manager = new WebSocketRadioManager();

  // Set up event listeners
  manager.on('radio-status-change', (radios: Radio[]) => {
    set({ radios });
  });

  manager.on('statistics-update', (statistics: Statistics) => {
    set({ statistics });
  });

  manager.on('log-message', (log: LogEntry) => {
    set(state => ({ logs: [...state.logs, log].slice(-1000) }));
  });

  manager.on('message-received', ({ message }: { radioId: string; message: Message }) => {
    set(state => {
      // Check if message already exists (prevent duplicates)
      const exists = state.messages.some(m => m.id === message.id);
      if (exists) {
        return state; // Don't add duplicate
      }
      return { messages: [message, ...state.messages].slice(0, 500) };
    });
  });

  manager.on('message-forwarded', ({ message }: { message: Message }) => {
    set(state => ({
      messages: state.messages.map(m =>
        m.id === message.id ? { ...m, forwarded: true } : m
      )
    }));
  });

  manager.on('logs-update', (logs: LogEntry[]) => {
    set({ logs });
  });

  manager.on('bridge-disconnected', () => {
    set({ bridgeConnected: false });
  });

  return {
    manager,
    bridgeConnected: false,
    radios: [],
    statistics: null,
    logs: [],
    messages: [],
    bridgeConfig: null,

    initialize: () => {
      const statistics = manager.getStatistics();
      const bridgeConfig = manager.getBridgeConfig();
      const logs = manager.getLogs();
      set({ statistics, bridgeConfig, logs });
    },

    connectToBridge: async () => {
      const result = await manager.connectToBridge();
      if (result.success) {
        set({ bridgeConnected: true });
      }
      return result;
    },

    scanAndConnectRadio: async () => {
      const ports = await manager.scanForRadios();
      console.log('Scanned ports:', ports);

      if (ports.length === 0) {
        throw new Error('No serial ports found. Make sure your Meshtastic radio is connected via USB and the bridge server is running.');
      }

      // Connect to ALL available ports
      console.log(`Connecting to ${ports.length} radio(s)...`);

      const results = await Promise.allSettled(
        ports.map(port => manager.connectRadio(port.path))
      );

      // Check if at least one succeeded
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failCount = results.length - successCount;

      if (successCount === 0) {
        throw new Error('Failed to connect to any radios. Check logs for details.');
      }

      console.log(`✅ Connected ${successCount} radio(s), ${failCount} failed`);

      if (failCount > 0) {
        console.warn(`⚠️ ${failCount} radio(s) failed to connect`);
      }
    },

    disconnectRadio: async (radioId: string) => {
      await manager.disconnectRadio(radioId);
    },

    updateBridgeConfig: (config: Partial<BridgeConfig>) => {
      manager.updateBridgeConfig(config);
      const bridgeConfig = manager.getBridgeConfig();
      set({ bridgeConfig });
    },

    clearLogs: () => {
      set({ logs: [] });
    },
  };
});
