import React, { useState, useEffect } from 'react';

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  models: Array<{ name: string; size: number }>;
}

const OllamaInstaller: React.FC = () => {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [pullingModel, setPullingModel] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [selectedModel, setSelectedModel] = useState('llama3.2');

  const popularModels = [
    { name: 'llama3.2', description: 'Latest Llama 3.2 (Small & Fast)', size: '2GB' },
    { name: 'llama3.1', description: 'Llama 3.1 (More Capable)', size: '4.7GB' },
    { name: 'llama2', description: 'Llama 2 (Stable)', size: '3.8GB' },
    { name: 'phi3', description: 'Phi-3 (Very Small)', size: '2.3GB' },
    { name: 'mistral', description: 'Mistral (Alternative)', size: '4.1GB' },
  ];

  const checkStatus = async () => {
    setLoading(true);

    try {
      const bridgeUrl = localStorage.getItem('bridge-server-url') || 'ws://localhost:8080';
      const httpUrl = bridgeUrl.replace('ws://', 'http://');

      const response = await fetch(`${httpUrl}/api/ollama/status`);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setStatus(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to check Ollama status: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const installOllama = async () => {
    if (!password) {
      alert('Please enter your sudo password to install Ollama');
      return;
    }

    setInstalling(true);
    setProgress([]);

    try {
      const bridgeUrl = localStorage.getItem('bridge-server-url') || 'ws://localhost:8080';
      const httpUrl = bridgeUrl.replace('ws://', 'http://');

      const response = await fetch(`${httpUrl}/api/ollama/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.type === 'progress') {
              setProgress(prev => [...prev, data.message]);
            } else if (data.type === 'error') {
              alert(`Installation failed: ${data.message}`);
            } else if (data.type === 'success') {
              setProgress(prev => [...prev, '✅ ' + data.message]);
              alert('Ollama installed successfully! Please wait a moment and then refresh status.');
              setPassword('');
              setTimeout(() => checkStatus(), 3000);
            }
          } catch (e) {
            console.error('Failed to parse progress line:', line);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Installation failed: ${errorMessage}`);
    } finally {
      setInstalling(false);
    }
  };

  const pullModel = async () => {
    if (!selectedModel) {
      alert('Please select a model to pull');
      return;
    }

    setPullingModel(true);
    setProgress([]);

    try {
      const bridgeUrl = localStorage.getItem('bridge-server-url') || 'ws://localhost:8080';
      const httpUrl = bridgeUrl.replace('ws://', 'http://');

      const response = await fetch(`${httpUrl}/api/ollama/pull-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.type === 'progress') {
              setProgress(prev => [...prev, data.message]);
            } else if (data.type === 'error') {
              alert(`Model pull failed: ${data.message}`);
            } else if (data.type === 'success') {
              setProgress(prev => [...prev, '✅ ' + data.message]);
              alert(`Model ${selectedModel} pulled successfully!`);
              setTimeout(() => checkStatus(), 2000);
            }
          } catch (e) {
            console.error('Failed to parse progress line:', line);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Model pull failed: ${errorMessage}`);
    } finally {
      setPullingModel(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Ollama AI Installation</h2>

      {/* Status Card */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Status</h3>

        {loading && (
          <div className="text-gray-400">Checking status...</div>
        )}

        {!loading && status && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Installed:</span>
              <span className={status.installed ? 'text-green-400' : 'text-red-400'}>
                {status.installed ? '✓ Yes' : '✗ No'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Running:</span>
              <span className={status.running ? 'text-green-400' : 'text-orange-400'}>
                {status.running ? '✓ Yes' : '✗ No'}
              </span>
            </div>

            {status.version && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Version:</span>
                <span className="text-white">{status.version}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Models:</span>
              <span className="text-white">{status.models.length} installed</span>
            </div>

            {status.models.length > 0 && (
              <div className="mt-3 bg-gray-900 rounded p-3">
                <div className="text-sm text-gray-400 mb-2">Installed Models:</div>
                {status.models.map((model, idx) => (
                  <div key={idx} className="text-sm text-white">
                    • {model.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={checkStatus}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white"
        >
          {loading ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>

      {/* Installation Card */}
      {!status?.installed && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Install Ollama</h3>

          <p className="text-gray-400 mb-4">
            Click the button below to install Ollama. This will run:
            <code className="block bg-gray-900 p-2 rounded mt-2 text-sm">
              curl -fsSL https://ollama.com/install.sh | sh
            </code>
          </p>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">
              Sudo Password (required for installation):
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your sudo password"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
              disabled={installing}
            />
          </div>

          <button
            onClick={installOllama}
            disabled={installing || !password}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white font-semibold"
          >
            {installing ? 'Installing...' : 'Install Ollama'}
          </button>
        </div>
      )}

      {/* Model Download Card */}
      {status?.installed && status?.running && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Download AI Model</h3>

          <p className="text-gray-400 mb-4">
            Choose a model to download. Smaller models are faster but less capable.
          </p>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Select Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
              disabled={pullingModel}
            >
              {popularModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} - {model.description} (~{model.size})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={pullModel}
            disabled={pullingModel}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-white font-semibold"
          >
            {pullingModel ? 'Downloading...' : 'Download Model'}
          </button>
        </div>
      )}

      {/* Ollama Not Running Card */}
      {status?.installed && !status?.running && (
        <div className="bg-orange-900 bg-opacity-30 border border-orange-600 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-orange-400 mb-2">Ollama Not Running</h3>
          <p className="text-gray-300 mb-4">
            Ollama is installed but not running. Start it with:
          </p>
          <code className="block bg-gray-900 p-2 rounded text-sm">
            ollama serve
          </code>
        </div>
      )}

      {/* Progress Log */}
      {progress.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold mb-3">Progress</h3>
          <div className="font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
            {progress.map((msg, idx) => (
              <div key={idx} className="text-gray-300">
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-blue-900 bg-opacity-30 border border-blue-600 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-400 mb-2">About Ollama</h3>
        <p className="text-gray-300">
          Ollama allows you to run large language models locally on your machine.
          Once installed and running, you can enable the AI assistant feature in your
          bridge configuration to get AI-powered responses on your mesh network.
        </p>
      </div>
    </div>
  );
};

export default OllamaInstaller;
