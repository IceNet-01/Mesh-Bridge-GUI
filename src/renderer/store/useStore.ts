import { create } from 'zustand';
import { WebSerialRadioManager } from '../lib/webSerialManager';
import type { Radio, Statistics, LogEntry, BridgeConfig, Message } from '../types';

interface AppStore {
  // Manager instance
  manager: WebSerialRadioManager;

  // State
  radios: Radio[];
  statistics: Statistics | null;
  logs: LogEntry[];
  messages: Message[];
  bridgeConfig: BridgeConfig | null;

  // Actions
  initialize: () => void;
  scanAndConnectRadio: () => Promise<void>;
  disconnectRadio: (radioId: string) => Promise<void>;
  updateBridgeConfig: (config: Partial<BridgeConfig>) => void;
  clearLogs: () => void;
  forceCloseAllPorts: () => Promise<void>;
}

export const useStore = create<AppStore>((set) => {
  const manager = new WebSerialRadioManager();

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
    set(state => ({ messages: [message, ...state.messages].slice(0, 500) }));
  });

  manager.on('message-forwarded', ({ message }: { message: Message }) => {
    set(state => ({
      messages: state.messages.map(m =>
        m.id === message.id ? { ...m, forwarded: true } : m
      )
    }));
  });

  return {
    manager,
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

    scanAndConnectRadio: async () => {
      const ports = await manager.scanForRadios();
      console.log('Scanned ports:', ports);

      if (ports.length === 0) {
        throw new Error('No serial port selected. Please select a device when prompted.');
      }

      const result = await manager.connectRadio(ports[0]);
      console.log('Connection result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Failed to connect to radio');
      }
    },

    disconnectRadio: async (radioId: string) => {
      await manager.disconnectRadio(radioId);
    },

    updateBridgeConfig: (config: Partial<BridgeConfig>) => {
      const updated = manager.updateBridgeConfig(config);
      set({ bridgeConfig: updated });
    },

    clearLogs: () => {
      manager.clearLogs();
      set({ logs: [] });
    },

    forceCloseAllPorts: async () => {
      await manager.forceCloseAllPorts();
    },
  };
});
