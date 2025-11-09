import React, { useState, useEffect } from 'react';
import { PortInfo } from '../types';

interface ConnectRadioModalProps {
  onClose: () => void;
}

function ConnectRadioModal({ onClose }: ConnectRadioModalProps) {
  const [scanning, setScanning] = useState(false);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    handleScan();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setError('');
    try {
      const foundPorts = await window.electronAPI.scanRadios();
      setPorts(foundPorts);
      if (foundPorts.length === 0) {
        setError('No serial ports detected. Make sure your Meshtastic device is connected.');
      }
    } catch (err) {
      setError('Failed to scan for radios');
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedPort) return;

    setConnecting(true);
    setError('');

    try {
      const result = await window.electronAPI.connectRadio(selectedPort);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to connect to radio');
      }
    } catch (err) {
      setError('Failed to connect to radio');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-white">Connect Meshtastic Radio</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-400">
              Available Serial Ports
            </label>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="btn-secondary text-sm py-1 px-3"
            >
              {scanning ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Scanning...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Rescan
                </>
              )}
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {ports.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <svg className="w-16 h-16 mx-auto mb-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium">No devices found</p>
                <p className="text-sm mt-2">
                  Connect your Meshtastic device via USB and click Rescan
                </p>
              </div>
            ) : (
              ports.map((port) => (
                <label
                  key={port.path}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedPort === port.path
                      ? 'bg-primary-500/10 border-primary-500'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="port"
                    value={port.path}
                    checked={selectedPort === port.path}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium font-mono">{port.path}</p>
                    {port.manufacturer && (
                      <p className="text-sm text-slate-400 mt-1">
                        Manufacturer: {port.manufacturer}
                      </p>
                    )}
                    {port.serialNumber && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        S/N: {port.serialNumber}
                      </p>
                    )}
                    {(port.vendorId || port.productId) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        VID: {port.vendorId} PID: {port.productId}
                      </p>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedPort || connecting}
            className="btn-primary"
          >
            {connecting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConnectRadioModal;
