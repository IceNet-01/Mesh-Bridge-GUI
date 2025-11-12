import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

const RECOMMENDED_MODELS = [
  {
    name: 'llama3.2:1b',
    size: '700MB',
    description: 'Ultra-fast, perfect for Pi 4+ (4GB)',
    hardware: 'Raspberry Pi 4+ (4GB RAM)',
    speed: '2-4 seconds'
  },
  {
    name: 'phi3:mini',
    size: '2.2GB',
    description: 'Excellent quality/speed balance',
    hardware: 'Raspberry Pi 5 (8GB RAM)',
    speed: '4-6 seconds'
  },
  {
    name: 'llama3.2:3b',
    size: '2GB',
    description: 'Great quality, needs more RAM',
    hardware: 'Desktop/Pi 5 (8GB+ RAM)',
    speed: '6-10 seconds'
  },
  {
    name: 'tinyllama:latest',
    size: '637MB',
    description: 'Fastest, lower quality',
    hardware: 'Raspberry Pi 4+ (2GB RAM)',
    speed: '1-2 seconds'
  }
];

function AISettings() {
  const {
    aiConfig,
    aiModels,
    aiStatus,
    aiPullProgress,
    getAIConfig,
    setAIEnabled,
    listAIModels,
    setAIModel,
    pullAIModel,
    checkAIStatus
  } = useStore();

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [installingModel, setInstallingModel] = useState<string | null>(null);

  useEffect(() => {
    // Load initial data
    getAIConfig();
    checkAIStatus();
    listAIModels();
  }, []);

  useEffect(() => {
    if (aiConfig && !selectedModel) {
      setSelectedModel(aiConfig.model);
    }
  }, [aiConfig]);

  const handleToggleAI = async () => {
    if (!aiConfig) return;
    await setAIEnabled(!aiConfig.enabled);
  };

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    await setAIModel(model);
    await getAIConfig();
  };

  const handleInstallModel = async (modelName: string) => {
    setInstallingModel(modelName);
    await pullAIModel(modelName);
    await listAIModels();
    setInstallingModel(null);
  };

  const handleRefresh = async () => {
    await checkAIStatus();
    await listAIModels();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getProgressPercentage = (): number => {
    if (!aiPullProgress || !aiPullProgress.total) return 0;
    return Math.round((aiPullProgress.completed || 0) / aiPullProgress.total * 100);
  };

  if (!aiConfig) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">AI Assistant</h2>
          <p className="text-slate-400">Loading AI configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">AI Assistant</h2>
        <p className="text-slate-400">Configure local AI model for mesh network queries</p>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-purple-500/10 border border-purple-500/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div>
            <p className="text-white font-medium">Local AI powered by Ollama</p>
            <p className="text-sm text-purple-200 mt-1">
              Users can send <span className="font-mono bg-purple-500/20 px-1 rounded">#ai [question]</span> or <span className="font-mono bg-purple-500/20 px-1 rounded">#ask [question]</span> via
              Meshtastic messages. Responses are automatically shortened to fit mesh network constraints (~200 chars).
              Requires <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-100 underline">Ollama</a> installed
              locally (works on Raspberry Pi 4+).
            </p>
          </div>
        </div>
      </div>

      {/* Ollama Status */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Ollama Status</h3>
          <button
            onClick={handleRefresh}
            className="btn-secondary"
            title="Refresh status"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
          <div className={`w-3 h-3 rounded-full ${aiStatus?.available ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <div className="flex-1">
            <p className="text-white font-medium">
              {aiStatus?.available ? 'Connected' : 'Not Running'}
            </p>
            <p className="text-sm text-slate-400">
              {aiStatus?.available
                ? `Ollama ${aiStatus.version || 'running'}`
                : 'Install Ollama from https://ollama.ai'}
            </p>
          </div>
        </div>
      </div>

      {/* AI Settings */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">AI Settings</h3>

        <div className="space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
            <div>
              <p className="text-white font-medium">Enable AI Assistant</p>
              <p className="text-sm text-slate-400">
                Allow users to query AI via #ai or #ask commands
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={aiConfig.enabled}
                onChange={handleToggleAI}
                disabled={!aiStatus?.available}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 peer-disabled:opacity-50"></div>
            </label>
          </div>

          {/* Active Model Selector */}
          {aiModels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Active Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="input w-full"
                disabled={!aiStatus?.available}
              >
                <option value="">Select a model...</option>
                {aiModels.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name} ({formatBytes(model.size)})
                  </option>
                ))}
              </select>
              <p className="text-sm text-slate-400 mt-2">
                {aiModels.length} model(s) installed
              </p>
            </div>
          )}

          {/* Config Details */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-900/50 rounded-lg text-sm">
            <div>
              <p className="text-slate-400">Rate Limit</p>
              <p className="text-white font-medium">{aiConfig.rateLimit} queries/min</p>
            </div>
            <div>
              <p className="text-slate-400">Timeout</p>
              <p className="text-white font-medium">{aiConfig.timeout / 1000}s</p>
            </div>
            <div>
              <p className="text-slate-400">Max Tokens</p>
              <p className="text-white font-medium">{aiConfig.maxTokens}</p>
            </div>
            <div>
              <p className="text-slate-400">Max Response</p>
              <p className="text-white font-medium">{aiConfig.maxResponseLength} chars</p>
            </div>
          </div>
        </div>
      </div>

      {/* Model Installation */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Install Models</h3>

        {aiPullProgress && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-white font-medium">
                Downloading {aiPullProgress.model}...
              </p>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
            <p className="text-sm text-slate-400 mt-2">
              {aiPullProgress.status} {aiPullProgress.total ? `(${getProgressPercentage()}%)` : ''}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {RECOMMENDED_MODELS.map((model) => {
            const isInstalled = aiModels.some(m => m.name === model.name);
            const isInstalling = installingModel === model.name;
            const isActive = selectedModel === model.name;

            return (
              <div
                key={model.name}
                className={`p-4 rounded-lg border ${
                  isActive
                    ? 'bg-primary-500/10 border-primary-500/50'
                    : 'bg-slate-900/50 border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-mono font-medium">{model.name}</p>
                      {isActive && (
                        <span className="px-2 py-0.5 text-xs bg-primary-500/20 text-primary-300 rounded">
                          Active
                        </span>
                      )}
                      {isInstalled && !isActive && (
                        <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded">
                          Installed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{model.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>💾 {model.size}</span>
                      <span>⚡ {model.speed} response</span>
                      <span>🖥️ {model.hardware}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {!isInstalled ? (
                      <button
                        onClick={() => handleInstallModel(model.name)}
                        disabled={!aiStatus?.available || isInstalling || !!aiPullProgress}
                        className="btn-primary whitespace-nowrap"
                      >
                        {isInstalling ? 'Installing...' : 'Install'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleModelChange(model.name)}
                        disabled={!aiStatus?.available || isActive}
                        className="btn-secondary whitespace-nowrap"
                      >
                        {isActive ? 'Active' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-sm text-amber-200">
            <strong>Note:</strong> Model downloads can be large (600MB-2GB). First download may take several minutes
            depending on your internet connection. Models are cached locally and only downloaded once.
          </p>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Usage</h3>
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 mb-1">Ask a question:</p>
            <code className="text-primary-300 font-mono">#ai What is the weather like?</code>
          </div>
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 mb-1">Alternative command:</p>
            <code className="text-primary-300 font-mono">#ask How far is the moon?</code>
          </div>
          <div className="p-3 bg-slate-900/50 rounded-lg">
            <p className="text-slate-400 mb-1">Get command help:</p>
            <code className="text-primary-300 font-mono">#help</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AISettings;
