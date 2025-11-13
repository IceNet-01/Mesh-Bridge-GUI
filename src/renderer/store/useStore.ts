import { create } from 'zustand';
import { WebSocketRadioManager } from '../lib/webSocketManager';
import type { Radio, Statistics, LogEntry, BridgeConfig, Message, AIConfig, AIModel, AIStatus, AIModelPullProgress, CommunicationConfig, EmailConfig, DiscordConfig } from '../types';

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

  // Auto-scan state
  autoScanEnabled: boolean;
  autoScanInterval: number; // milliseconds
  lastScan: Date | null;

  // AI State
  aiConfig: AIConfig | null;
  aiModels: AIModel[];
  aiStatus: AIStatus | null;
  aiPullProgress: AIModelPullProgress | null;

  // Communication State
  commConfig: CommunicationConfig | null;

  // Actions
  initialize: () => void;
  connectToBridge: () => Promise<{ success: boolean; error?: string }>;
  connectRadio: (port: string, protocol: string) => Promise<{ success: boolean; error?: string }>;
  scanAndConnectRadio: () => Promise<void>;
  autoScanForNewRadios: () => Promise<void>;
  setAutoScanEnabled: (enabled: boolean) => void;
  setAutoScanInterval: (interval: number) => void;
  disconnectRadio: (radioId: string) => Promise<void>;
  updateBridgeConfig: (config: Partial<BridgeConfig>) => void;
  clearLogs: () => void;

  // AI Actions
  getAIConfig: () => Promise<void>;
  setAIEnabled: (enabled: boolean) => Promise<void>;
  listAIModels: () => Promise<void>;
  setAIModel: (model: string) => Promise<void>;
  pullAIModel: (model: string) => Promise<void>;
  checkAIStatus: () => Promise<void>;

  // Communication Actions
  getCommConfig: () => Promise<void>;
  setEmailConfig: (config: EmailConfig) => Promise<void>;
  setDiscordConfig: (config: DiscordConfig) => Promise<void>;
  testEmail: () => Promise<void>;
  testDiscord: () => Promise<void>;
}

export const useStore = create<AppStore>((set, get) => {
  const manager = new WebSocketRadioManager();

  // Auto-scan timer
  let autoScanTimer: NodeJS.Timeout | null = null;

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

  // AI event listeners
  manager.on('ai-config-update', (config: AIConfig) => {
    set({ aiConfig: config });
  });

  manager.on('ai-models-list', (models: AIModel[]) => {
    set({ aiModels: models });
  });

  manager.on('ai-status-update', (status: AIStatus) => {
    set({ aiStatus: status });
  });

  manager.on('ai-pull-started', ({ model }: { model: string }) => {
    set({ aiPullProgress: { model, status: 'Starting...', completed: 0, total: 0 } });
  });

  manager.on('ai-pull-progress', (progress: AIModelPullProgress) => {
    set({ aiPullProgress: progress });
  });

  manager.on('ai-pull-complete', () => {
    set({ aiPullProgress: null });
  });

  // Communication event listeners
  manager.on('comm-config-update', (config: CommunicationConfig) => {
    set({ commConfig: config });
  });

  return {
    manager,
    bridgeConnected: false,
    radios: [],
    statistics: null,
    logs: [],
    messages: [],
    bridgeConfig: null,
    autoScanEnabled: false,
    autoScanInterval: 30000, // 30 seconds default
    lastScan: null,
    aiConfig: null,
    aiModels: [],
    aiStatus: null,
    aiPullProgress: null,
    commConfig: null,

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

        // Auto-enable auto-scan when bridge connects
        const state = get();
        if (!state.autoScanEnabled) {
          get().setAutoScanEnabled(true);
          console.log('🔍 Auto-scan enabled (30s interval)');
        }
      }
      return result;
    },

    connectRadio: async (port: string, protocol: string) => {
      const result = await manager.connectRadio(port, protocol as any);
      return result;
    },

    autoScanForNewRadios: async () => {
      try {
        const state = get();

        // Don't scan if bridge isn't connected
        if (!state.bridgeConnected) {
          return;
        }

        console.log('🔍 Auto-scanning for new radios...');
        set({ lastScan: new Date() });

        const ports = await manager.scanForRadios();

        // Get currently connected radio ports
        const connectedPorts = state.radios
          .filter(r => r.status === 'connected')
          .map(r => r.port);

        // Filter for NEW ports not already connected
        const newPorts = ports.filter(port => !connectedPorts.includes(port.path));

        if (newPorts.length === 0) {
          console.log('  ℹ️  No new radios found');
          return;
        }

        console.log(`  ✨ Found ${newPorts.length} new radio(s), connecting...`);

        // Connect to new ports only
        const results = await Promise.allSettled(
          newPorts.map(port => manager.connectRadio(port.path, 'meshcore'))
        );

        const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;

        if (successCount > 0) {
          console.log(`  ✅ Connected ${successCount} new radio(s)`);
        }
      } catch (error) {
        console.error('Auto-scan error:', error);
        // Don't throw - we don't want auto-scan errors to crash the app
      }
    },

    setAutoScanEnabled: (enabled: boolean) => {
      set({ autoScanEnabled: enabled });

      // Clear existing timer
      if (autoScanTimer) {
        clearInterval(autoScanTimer);
        autoScanTimer = null;
      }

      // Start new timer if enabled
      if (enabled) {
        const state = get();

        // Initial scan
        setTimeout(() => {
          get().autoScanForNewRadios();
        }, 2000); // 2 second delay after enable

        // Set up recurring scans
        autoScanTimer = setInterval(() => {
          get().autoScanForNewRadios();
        }, state.autoScanInterval);

        console.log(`✅ Auto-scan enabled (${state.autoScanInterval/1000}s interval)`);
      } else {
        console.log('⏸️  Auto-scan disabled');
      }
    },

    setAutoScanInterval: (interval: number) => {
      set({ autoScanInterval: interval });

      // If auto-scan is enabled, restart with new interval
      const state = get();
      if (state.autoScanEnabled) {
        get().setAutoScanEnabled(false);
        get().setAutoScanEnabled(true);
      }
    },

    scanAndConnectRadio: async () => {
      const ports = await manager.scanForRadios();
      console.log('Scanned ports:', ports);

      if (ports.length === 0) {
        throw new Error('No serial ports found. Make sure your radio is connected via USB and the bridge server is running.');
      }

      // Connect to ALL available ports using meshcore for auto-detection
      console.log(`Connecting to ${ports.length} radio(s) with auto-detection...`);

      const results = await Promise.allSettled(
        ports.map(port => manager.connectRadio(port.path, 'meshcore'))
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

    // AI Actions
    getAIConfig: async () => {
      const config = await manager.getAIConfig();
      if (config) {
        set({ aiConfig: config });
      }
    },

    setAIEnabled: async (enabled: boolean) => {
      await manager.setAIEnabled(enabled);
    },

    listAIModels: async () => {
      const models = await manager.listAIModels();
      set({ aiModels: models });
    },

    setAIModel: async (model: string) => {
      await manager.setAIModel(model);
    },

    pullAIModel: async (model: string) => {
      await manager.pullAIModel(model);
    },

    checkAIStatus: async () => {
      const status = await manager.checkAIStatus();
      if (status) {
        set({ aiStatus: status });
      }
    },

    // Communication Actions
    getCommConfig: async () => {
      const config = await manager.getCommConfig();
      if (config) {
        set({ commConfig: config });
      }
    },

    setEmailConfig: async (config: EmailConfig) => {
      await manager.setEmailConfig(config);
    },

    setDiscordConfig: async (config: DiscordConfig) => {
      await manager.setDiscordConfig(config);
    },

    testEmail: async () => {
      await manager.testEmail();
    },

    testDiscord: async () => {
      await manager.testDiscord();
    },
  };
});
