import { useState, useEffect } from 'react';
import { Radio } from '../types';

interface RadioSettingsProps {
  radioId: string;
  radio?: Radio;
  onSetConfig: (radioId: string, configType: string, config: any) => void;
}

// Enum mappings for LoRa settings
const REGIONS = [
  { value: 0, label: 'Unset' },
  { value: 1, label: 'US (902-928 MHz)' },
  { value: 2, label: 'EU 433 (433 MHz)' },
  { value: 3, label: 'EU 868 (868 MHz)' },
  { value: 4, label: 'CN (470-510 MHz)' },
  { value: 5, label: 'JP (920-923 MHz)' },
  { value: 6, label: 'ANZ (915-928 MHz)' },
  { value: 7, label: 'KR (920-923 MHz)' },
  { value: 8, label: 'TW (920-925 MHz)' },
  { value: 9, label: 'RU (868-870 MHz)' },
  { value: 10, label: 'IN (865-867 MHz)' },
  { value: 11, label: 'NZ 865 (864-868 MHz)' },
  { value: 12, label: 'TH (920-925 MHz)' },
  { value: 14, label: 'UA 433 (433 MHz)' },
  { value: 15, label: 'UA 868 (868 MHz)' },
];

const MODEM_PRESETS = [
  { value: 0, label: 'Long Fast (Default)' },
  { value: 1, label: 'Long Slow' },
  { value: 2, label: 'Very Long Slow' },
  { value: 3, label: 'Medium Slow' },
  { value: 4, label: 'Medium Fast' },
  { value: 5, label: 'Short Slow' },
  { value: 6, label: 'Short Fast' },
  { value: 7, label: 'Long Moderate' },
];

function parseRegion(region: any): number {
  if (typeof region === 'number') return region;
  if (typeof region === 'string') {
    const found = REGIONS.find(r => r.label.toLowerCase().includes(region.toLowerCase()));
    return found?.value ?? 1;
  }
  return 1;
}

function parseModemPreset(preset: any): number {
  if (typeof preset === 'number') return preset;
  if (typeof preset === 'string') {
    const found = MODEM_PRESETS.find(p => p.label.toLowerCase().includes(preset.toLowerCase()));
    return found?.value ?? 0;
  }
  return 0;
}

function RadioSettings({ radioId, radio, onSetConfig }: RadioSettingsProps) {
  // LoRa Configuration State
  const [region, setRegion] = useState<number>(1);
  const [modemPreset, setModemPreset] = useState<number>(0);
  const [hopLimit, setHopLimit] = useState<number>(3);
  const [txEnabled, setTxEnabled] = useState<boolean>(true);
  const [txPower, setTxPower] = useState<number>(30);
  const [channelNum, setChannelNum] = useState<number>(0);

  // Track if settings have been modified
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load config from radio when it changes
  useEffect(() => {
    if (radio?.protocolMetadata?.loraConfig) {
      const lora = radio.protocolMetadata.loraConfig;
      console.log('[RadioSettings] Loading config from radio:', lora);

      setRegion(parseRegion(lora.region));
      setModemPreset(parseModemPreset(lora.modemPreset));
      setHopLimit(lora.hopLimit ?? 3);
      setTxEnabled(lora.txEnabled ?? true);
      setTxPower(lora.txPower ?? 30);
      setChannelNum(lora.channelNum ?? 0);
      setHasChanges(false);
    }
  }, [radio?.protocolMetadata?.loraConfig]);

  const handleSave = async () => {
    if (!radioId) return;

    setIsSaving(true);
    try {
      const config = {
        region,
        modemPreset,
        hopLimit,
        txEnabled,
        txPower,
        channelNum,
      };

      await onSetConfig(radioId, 'lora', config);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const markChanged = () => setHasChanges(true);

  if (!radioId || !radio) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-400">Please select a radio to configure</p>
      </div>
    );
  }

  const hasLoraConfig = radio?.protocolMetadata?.loraConfig;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">📡 LoRa Configuration</h3>
            <p className="text-slate-400">Radio frequency and modulation settings</p>
            {!hasLoraConfig && (
              <p className="text-yellow-400 text-sm mt-2">⏳ Waiting for radio configuration...</p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`btn-primary px-6 py-3 ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSaving ? '⏳ Saving...' : '💾 Save Changes'}
          </button>
        </div>
      </div>

      {/* LoRa Settings */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Region <span className="text-red-400">*</span>
            </label>
            <select
              value={region}
              onChange={(e) => { setRegion(Number(e.target.value)); markChanged(); }}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            >
              {REGIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">⚠️ Must match your local regulations</p>
          </div>

          {/* Modem Preset */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Modem Preset
            </label>
            <select
              value={modemPreset}
              onChange={(e) => { setModemPreset(Number(e.target.value)); markChanged(); }}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            >
              {MODEM_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Balance between range and speed</p>
          </div>

          {/* Hop Limit */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Hop Limit
            </label>
            <input
              type="number"
              min="0"
              max="7"
              value={hopLimit}
              onChange={(e) => { setHopLimit(Number(e.target.value)); markChanged(); }}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">Max mesh hops (0-7)</p>
          </div>

          {/* TX Power */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              TX Power (dBm)
            </label>
            <input
              type="number"
              min="0"
              max="30"
              value={txPower}
              onChange={(e) => { setTxPower(Number(e.target.value)); markChanged(); }}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">Transmit power (0-30 dBm)</p>
          </div>

          {/* Channel Number */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Channel Number
            </label>
            <input
              type="number"
              min="0"
              max="255"
              value={channelNum}
              onChange={(e) => { setChannelNum(Number(e.target.value)); markChanged(); }}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">LoRa channel (0-255)</p>
          </div>

          {/* TX Enabled */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Transmit
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={txEnabled}
                onChange={(e) => { setTxEnabled(e.target.checked); markChanged(); }}
                className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-primary-500 focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-white">Enable Transmission</span>
            </label>
            <p className="text-xs text-slate-500 mt-1">Allow this radio to transmit</p>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="card p-4 bg-red-500/10 border border-red-500/30">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h4 className="text-red-400 font-semibold mb-1">Important Warning</h4>
            <p className="text-red-400 text-sm">
              Changing LoRa configuration can break connectivity and prevent communication with other devices.
              Incorrect region settings may violate local radio regulations. Changes require a device reboot to take effect.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RadioSettings;
