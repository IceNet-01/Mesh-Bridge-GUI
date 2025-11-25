import { create } from 'zustand';
import { WebSocketRadioManager } from '../lib/webSocketManager';
import type { Radio, Statistics, LogEntry, BridgeConfig, Message, AIConfig, AIModel, AIStatus, AIModelPullProgress, CommunicationConfig, EmailConfig, DiscordConfig, MQTTConfig, AdvertisementBotConfig, MeshNode, TelemetrySnapshot } from '../types';

interface AppStore {
  // Manager instance
  manager: WebSocketRadioManager;

  // State
  bridgeConnected: boolean;
  radios: Radio[];
  statistics: Statistics | null;
  logs: LogEntry[];
  consoleLines: Array<{ timestamp: string; level: string; message: string }>; // Raw console output
  messages: Message[];
  nodes: MeshNode[];
  bridgeConfig: BridgeConfig | null;
  telemetryHistory: Map<string, TelemetrySnapshot[]>; // nodeId -> snapshots

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

  // MQTT State
  mqttConfig: MQTTConfig | null;

  // Advertisement Bot State
  adBotConfig: AdvertisementBotConfig | null;

  // Actions
  initialize: () => void;
  connectToBridge: () => Promise<{ success: boolean; error?: string }>;
  connectRadio: (port: string, protocol: string) => Promise<{ success: boolean; error?: string }>;
  scanAndConnectRadio: () => Promise<void>;
  autoScanForNewRadios: () => Promise<void>;
  setAutoScanEnabled: (enabled: boolean) => void;
  setAutoScanInterval: (interval: number) => void;
  disconnectRadio: (radioId: string) => Promise<void>;
  rebootRadio: (radioId: string) => Promise<void>;
  syncRadioTime: (radioId: string) => Promise<void>;
  shutdownServer: () => Promise<void>;
  getChannel: (radioId: string, channelIndex: number) => Promise<void>;
  setChannel: (radioId: string, channelConfig: any) => Promise<void>;
  getRadioConfig: (radioId: string, configType: string) => Promise<void>;
  setRadioConfig: (radioId: string, configType: string, config: any) => Promise<void>;
  sendMessage: (radioId: string, text: string, channel?: number) => Promise<void>;
  updateBridgeConfig: (config: Partial<BridgeConfig>) => void;
  clearLogs: () => void;
  deleteNode: (nodeId: string) => void;
  clearAllNodes: () => void;
  getNodeTelemetryHistory: (nodeId: string) => TelemetrySnapshot[];

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

  // MQTT Actions
  getMQTTConfig: () => Promise<void>;
  setMQTTConfig: (config: MQTTConfig) => Promise<void>;
  setMQTTEnabled: (enabled: boolean) => Promise<void>;
  testMQTT: () => Promise<void>;

  // Advertisement Bot Actions
  getAdBotConfig: () => Promise<void>;
  setAdBotConfig: (config: AdvertisementBotConfig) => Promise<void>;
  testAdBot: () => Promise<void>;
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
    set(state => ({
      statistics: state.statistics ? { ...state.statistics, ...statistics } : statistics
    }));
  });

  manager.on('log-message', (log: LogEntry) => {
    set(state => ({ logs: [...state.logs, log].slice(-1000) }));
  });

  manager.on('console-update', (consoleLines: Array<{ timestamp: string; level: string; message: string }>) => {
    set({ consoleLines });
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

  manager.on('node-update', (node: MeshNode) => {
    set(state => {
      // DEDUPLICATION: Check by 'num' field first, then by nodeId
      // This prevents duplicates when same node has different ID formats
      let existingIndex = state.nodes.findIndex(n => n.nodeId === node.nodeId);
      let duplicateIndex = -1;

      if (existingIndex < 0 && node.num) {
        // Node ID not found, check if node with same 'num' exists
        duplicateIndex = state.nodes.findIndex(n => n.num === node.num);
        if (duplicateIndex >= 0) {
          // Duplicate node found - merge with existing
          existingIndex = duplicateIndex; // Treat duplicate as existing node
        }
      }

      let updatedNodes: MeshNode[];
      if (existingIndex >= 0) {
        // Update existing node
        const updated = [...state.nodes];
        updated[existingIndex] = node;
        updatedNodes = updated;
      } else {
        // Add new node
        updatedNodes = [...state.nodes, node];
      }

      // Capture telemetry snapshot if any telemetry data exists
      const hasTelemetry =
        node.batteryLevel !== undefined ||
        node.voltage !== undefined ||
        node.temperature !== undefined ||
        node.humidity !== undefined ||
        node.pressure !== undefined ||
        node.snr !== undefined ||
        node.channelUtilization !== undefined ||
        node.airUtilTx !== undefined;

      if (hasTelemetry) {
        const snapshot: TelemetrySnapshot = {
          timestamp: new Date(),
          nodeId: node.nodeId,
          batteryLevel: node.batteryLevel,
          voltage: node.voltage,
          temperature: node.temperature,
          humidity: node.humidity,
          pressure: node.pressure,
          snr: node.snr,
          channelUtilization: node.channelUtilization,
          airUtilTx: node.airUtilTx,
        };

        const newHistory = new Map(state.telemetryHistory);
        let existingSnapshots = newHistory.get(node.nodeId) || [];

        // If we merged a duplicate node, also merge its telemetry history
        if (duplicateIndex >= 0 && state.nodes[duplicateIndex].nodeId !== node.nodeId) {
          const oldNodeId = state.nodes[duplicateIndex].nodeId;
          const oldSnapshots = newHistory.get(oldNodeId) || [];
          if (oldSnapshots.length > 0) {
            // Merge telemetry snapshots from duplicate node
            existingSnapshots = [...oldSnapshots, ...existingSnapshots];
            newHistory.delete(oldNodeId); // Remove old history
          }
        }

        // Add new snapshot
        const updatedSnapshots = [...existingSnapshots, snapshot];

        // Keep last 24 hours of snapshots (assuming ~5min intervals = 288 snapshots/day)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filteredSnapshots = updatedSnapshots.filter(
          s => new Date(s.timestamp).getTime() > oneDayAgo
        );

        newHistory.set(node.nodeId, filteredSnapshots);

        return { nodes: updatedNodes, telemetryHistory: newHistory };
      }

      return { nodes: updatedNodes };
    });
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

  // MQTT event listeners
  manager.on('mqtt-config-changed', (config: MQTTConfig) => {
    set({ mqttConfig: config });
  });

  return {
    manager,
    bridgeConnected: false,
    radios: [],
    statistics: null,
    logs: [],
    consoleLines: [],
    messages: [],
    nodes: [],
    bridgeConfig: null,
    telemetryHistory: new Map(),
    autoScanEnabled: false,
    autoScanInterval: 30000, // 30 seconds default
    lastScan: null,
    aiConfig: null,
    aiModels: [],
    aiStatus: null,
    aiPullProgress: null,
    commConfig: null,
    mqttConfig: null,
    adBotConfig: null,

    initialize: () => {
      const statistics = manager.getStatistics();
      const bridgeConfig = manager.getBridgeConfig();
      const logs = manager.getLogs();
      const nodes = manager.getNodes();
      set({ statistics, bridgeConfig, logs, nodes });
    },

    connectToBridge: async () => {
      const result = await manager.connectToBridge();
      if (result.success) {
        set({ bridgeConnected: true });

        // Auto-enable auto-scan when bridge connects
        const state = get();
        if (!state.autoScanEnabled) {
          get().setAutoScanEnabled(true);
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

        set({ lastScan: new Date() });

        const ports = await manager.scanForRadios();

        // Get currently connected radio ports
        const connectedPorts = state.radios
          .filter(r => r.status === 'connected')
          .map(r => r.port);

        // Filter for NEW ports not already connected
        const newPorts = ports.filter(port => !connectedPorts.includes(port.path));

        if (newPorts.length === 0) {
          return;
        }

        // Connect to new ports only using Meshtastic protocol
        await Promise.allSettled(
          newPorts.map(port => manager.connectRadio(port.path, 'meshtastic'))
        );
      } catch (error) {
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

      if (ports.length === 0) {
        throw new Error('No serial ports found. Make sure your radio is connected via USB and the bridge server is running.');
      }

      // Connect to ALL available ports using Meshtastic protocol
      const results = await Promise.allSettled(
        ports.map(port => manager.connectRadio(port.path, 'meshtastic'))
      );

      // Check if at least one succeeded
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

      if (successCount === 0) {
        throw new Error('Failed to connect to any radios. Check logs for details.');
      }
    },

    disconnectRadio: async (radioId: string) => {
      await manager.disconnectRadio(radioId);
    },

    rebootRadio: async (radioId: string) => {
      await manager.rebootRadio(radioId);
    },

    syncRadioTime: async (radioId: string) => {
      await manager.syncRadioTime(radioId);
    },

    shutdownServer: async () => {
      await manager.shutdownServer();
    },

    getChannel: async (radioId: string, channelIndex: number) => {
      await manager.getChannel(radioId, channelIndex);
    },

    setChannel: async (radioId: string, channelConfig: any) => {
      await manager.setChannel(radioId, channelConfig);
    },

    getRadioConfig: async (radioId: string, configType: string) => {
      await manager.getRadioConfig(radioId, configType);
    },

    setRadioConfig: async (radioId: string, configType: string, config: any) => {
      await manager.setRadioConfig(radioId, configType, config);
    },

    sendMessage: async (radioId: string, text: string, channel: number = 0) => {
      await manager.sendText(radioId, text, channel);
    },

    updateBridgeConfig: (config: Partial<BridgeConfig>) => {
      manager.updateBridgeConfig(config);
      const bridgeConfig = manager.getBridgeConfig();
      set({ bridgeConfig });
    },

    clearLogs: () => {
      set({ logs: [] });
    },

    deleteNode: (nodeId: string) => {
      manager.deleteNode(nodeId);
      set(state => ({
        nodes: state.nodes.filter(n => n.nodeId !== nodeId)
      }));
    },

    clearAllNodes: () => {
      manager.clearAllNodes();
      set({ nodes: [], telemetryHistory: new Map() });
    },

    getNodeTelemetryHistory: (nodeId: string) => {
      const state = get();
      return state.telemetryHistory.get(nodeId) || [];
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

    // MQTT Actions
    getMQTTConfig: async () => {
      const config = await manager.getMQTTConfig();
      if (config) {
        set({ mqttConfig: config });
      }
    },

    setMQTTConfig: async (config: MQTTConfig) => {
      await manager.setMQTTConfig(config);
    },

    setMQTTEnabled: async (enabled: boolean) => {
      await manager.setMQTTEnabled(enabled);
    },

    testMQTT: async () => {
      await manager.testMQTT();
    },

    // Advertisement Bot Actions
    getAdBotConfig: async () => {
      const config = await manager.getAdBotConfig();
      if (config) {
        set({ adBotConfig: config });
      }
    },

    setAdBotConfig: async (config: AdvertisementBotConfig) => {
      await manager.setAdBotConfig(config);
    },

    testAdBot: async () => {
      await manager.testAdBot();
    },
  };
});
