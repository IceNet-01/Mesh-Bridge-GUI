import { useState } from 'react';
import { Card } from './ui/Card';
import { useStore } from '../store/useStore';

export function BluetoothDeviceScanner() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  const scanBluetoothDevices = useStore(state => state.scanBluetoothDevices);
  const connectRadio = useStore(state => state.connectRadio);

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);

    try {
      const foundDevices = await scanBluetoothDevices((device) => {
        // Update UI as devices are found
        setDevices(prev => {
          if (prev.find(d => d.id === device.id)) {
            return prev;
          }
          return [...prev, device];
        });
      });

      console.log(`Scan complete. Found ${foundDevices.length} device(s)`);
    } catch (error) {
      console.error('Bluetooth scan error:', error);
      alert(`Bluetooth scan failed: ${error}`);
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (device: any) => {
    setConnecting(device.id);

    try {
      const result = await connectRadio(device.address || device.id, 'bluetooth');

      if (result.success) {
        alert(`Successfully connected to ${device.name}`);
        setDevices([]); // Clear device list after successful connection
      } else {
        alert(`Failed to connect: ${result.error}`);
      }
    } catch (error) {
      console.error('Connection error:', error);
      alert(`Connection failed: ${error}`);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Bluetooth Device Scanner</h2>
        <p className="text-slate-400">
          Scan for and connect to Meshtastic devices via Bluetooth
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Available Bluetooth Devices</h3>
              <p className="text-sm text-slate-400">
                {scanning ? 'Scanning for nearby devices...' : 'Click "Scan" to search for Bluetooth devices'}
              </p>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className={`btn-primary ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {scanning ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Scanning...</span>
                </div>
              ) : (
                '🔵 Scan for Devices'
              )}
            </button>
          </div>

          {devices.length > 0 && (
            <div className="space-y-2">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{device.name}</h4>
                      <p className="text-sm text-slate-400 font-mono">
                        {device.address || device.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">RSSI</p>
                      <p className={`text-sm font-semibold ${
                        device.rssi > -60 ? 'text-green-400' :
                        device.rssi > -75 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {device.rssi} dBm
                      </p>
                    </div>
                    <button
                      onClick={() => handleConnect(device)}
                      disabled={connecting !== null}
                      className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${
                        connecting !== null ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {connecting === device.id ? (
                        <div className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Connecting...</span>
                        </div>
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!scanning && devices.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <p>No devices found yet</p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <strong className="font-semibold">Bluetooth Requirements:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Ensure Bluetooth is enabled on your computer</li>
                <li>Your Meshtastic device must have Bluetooth enabled</li>
                <li>Device must be within range (typically 10-30 meters)</li>
                <li>On Linux, you may need to grant Bluetooth permissions</li>
                <li>Scan duration: ~10 seconds</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
