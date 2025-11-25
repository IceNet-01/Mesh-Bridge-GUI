import { useState, useEffect } from 'react';
import { Radio } from '../types';

interface RadioSettingsProps {
  radioId: string;
  radio?: Radio;
  onGetConfig: (radioId: string, configType: string) => void;
  onSetConfig: (radioId: string, configType: string, config: any) => void;
}

interface ConfigSection {
  id: string;
  title: string;
  icon: string;
  expanded: boolean;
}

interface LoRaConfig {
  region: string;
  modemPreset: string;
  hopLimit: number;
  txEnabled: boolean;
  txPower: number;
  channelNum: number;
  overrideDutyCycle: boolean;
  sx126xRxBoostedGain: boolean;
  overrideFrequency: number;
  paFanDisabled: boolean;
}

interface DeviceConfig {
  role: string;
  serialEnabled: boolean;
  debugLogEnabled: boolean;
  rebroadcastMode: string;
  nodeInfoBroadcastSecs: number;
  doubleTapAsButtonPress: boolean;
}

interface PositionConfig {
  positionBroadcastSecs: number;
  positionBroadcastSmartEnabled: boolean;
  fixedPosition: boolean;
  gpsEnabled: boolean;
  gpsUpdateInterval: number;
  gpsAttemptTime: number;
  positionFlags: number;
  rxGpio: number;
  txGpio: number;
}

interface PowerConfig {
  isPowerSaving: boolean;
  onBatteryShutdownAfterSecs: number;
  adcMultiplierOverride: number;
  waitBluetoothSecs: number;
  meshSdsTimeoutSecs: number;
  sdsSecs: number;
  lsSecs: number;
  minWakeSecs: number;
}

interface NetworkConfig {
  wifiEnabled: boolean;
  wifiSsid: string;
  wifiPsk: string;
  ntpServer: string;
  ethEnabled: boolean;
  addressMode: string;
}

interface DisplayConfig {
  screenOnSecs: number;
  gpsFormat: string;
  autoScreenCarouselSecs: number;
  compassNorthTop: boolean;
  flipScreen: boolean;
  units: string;
  oled: string;
  displaymode: string;
  headingBold: boolean;
  wakeOnTapOrMotion: boolean;
}

interface BluetoothConfig {
  enabled: boolean;
  mode: string;
  fixedPin: number;
}

function RadioSettings({ radioId, radio, onGetConfig, onSetConfig }: RadioSettingsProps) {
  const [sections, setSections] = useState<ConfigSection[]>([
    { id: 'lora', title: 'LoRa Configuration', icon: '📡', expanded: true },
    { id: 'device', title: 'Device Settings', icon: '⚙️', expanded: false },
    { id: 'position', title: 'Position/GPS', icon: '📍', expanded: false },
    { id: 'power', title: 'Power Management', icon: '🔋', expanded: false },
    { id: 'network', title: 'Network (WiFi/Eth)', icon: '🌐', expanded: false },
    { id: 'display', title: 'Display', icon: '🖥️', expanded: false },
    { id: 'bluetooth', title: 'Bluetooth', icon: '📲', expanded: false },
    { id: 'modules', title: 'Modules', icon: '🧩', expanded: false },
  ]);

  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const [loraConfig, setLoraConfig] = useState<LoRaConfig>({
    region: 'US',
    modemPreset: 'LONG_FAST',
    hopLimit: 3,
    txEnabled: true,
    txPower: 30,
    channelNum: 0,
    overrideDutyCycle: false,
    sx126xRxBoostedGain: false,
    overrideFrequency: 0,
    paFanDisabled: false,
  });

  const [deviceConfig, setDeviceConfig] = useState<DeviceConfig>({
    role: 'CLIENT',
    serialEnabled: true,
    debugLogEnabled: false,
    rebroadcastMode: 'ALL',
    nodeInfoBroadcastSecs: 900,
    doubleTapAsButtonPress: false,
  });

  const [positionConfig, setPositionConfig] = useState<PositionConfig>({
    positionBroadcastSecs: 900,
    positionBroadcastSmartEnabled: false,
    fixedPosition: false,
    gpsEnabled: true,
    gpsUpdateInterval: 120,
    gpsAttemptTime: 30,
    positionFlags: 3,
    rxGpio: 0,
    txGpio: 0,
  });

  const [powerConfig, setPowerConfig] = useState<PowerConfig>({
    isPowerSaving: false,
    onBatteryShutdownAfterSecs: 0,
    adcMultiplierOverride: 0,
    waitBluetoothSecs: 60,
    meshSdsTimeoutSecs: 0,
    sdsSecs: 0,
    lsSecs: 0,
    minWakeSecs: 10,
  });

  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>({
    wifiEnabled: false,
    wifiSsid: '',
    wifiPsk: '',
    ntpServer: 'pool.ntp.org',
    ethEnabled: false,
    addressMode: 'DHCP',
  });

  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>({
    screenOnSecs: 60,
    gpsFormat: 'DEC',
    autoScreenCarouselSecs: 0,
    compassNorthTop: false,
    flipScreen: false,
    units: 'METRIC',
    oled: 'AUTO',
    displaymode: 'DEFAULT',
    headingBold: false,
    wakeOnTapOrMotion: false,
  });

  const [bluetoothConfig, setBluetoothConfig] = useState<BluetoothConfig>({
    enabled: true,
    mode: 'RANDOM_PIN',
    fixedPin: 123456,
  });

  // Map region enum values to string keys
  const REGION_REVERSE_MAP: Record<number, string> = {
    0: 'UNSET', 1: 'US', 2: 'EU_433', 3: 'EU_868', 4: 'CN', 5: 'JP',
    6: 'ANZ', 7: 'KR', 8: 'TW', 9: 'RU', 10: 'IN', 11: 'NZ_865',
    12: 'TH', 14: 'UA_433', 15: 'UA_868', 16: 'MY_433', 17: 'MY_919', 18: 'SG_923'
  };

  const MODEM_PRESET_REVERSE_MAP: Record<number, string> = {
    0: 'LONG_FAST', 1: 'LONG_SLOW', 2: 'VERY_LONG_SLOW', 3: 'MEDIUM_SLOW',
    4: 'MEDIUM_FAST', 5: 'SHORT_SLOW', 6: 'SHORT_FAST', 7: 'LONG_MODERATE'
  };

  // Populate config from radio data when it changes
  useEffect(() => {
    if (radio?.protocolMetadata?.loraConfig) {
      const lora = radio.protocolMetadata.loraConfig;
      console.log('[RadioSettings] Loading LoRa config from radio:', lora);

      setLoraConfig(prev => ({
        ...prev,
        region: typeof lora.region === 'string' ? lora.region : (typeof lora.region === 'number' ? (REGION_REVERSE_MAP[lora.region] || 'US') : 'US'),
        modemPreset: typeof lora.modemPreset === 'string' ? lora.modemPreset : (typeof lora.modemPreset === 'number' ? (MODEM_PRESET_REVERSE_MAP[lora.modemPreset] || 'LONG_FAST') : 'LONG_FAST'),
        hopLimit: lora.hopLimit ?? prev.hopLimit,
        txEnabled: lora.txEnabled ?? prev.txEnabled,
        txPower: lora.txPower ?? prev.txPower,
        channelNum: lora.channelNum ?? prev.channelNum,
      }));
    }
  }, [radio?.protocolMetadata?.loraConfig]);

  const toggleSection = (id: string) => {
    setSections(sections.map(s =>
      s.id === id ? { ...s, expanded: !s.expanded } : s
    ));
  };

  const handleGetConfig = (configType: string) => {
    if (!radioId) return;
    onGetConfig(radioId, configType);
  };

  // Enum mappings for converting string values to integers
  const REGION_ENUM: Record<string, number> = {
    'UNSET': 0, 'US': 1, 'EU_433': 2, 'EU_868': 3, 'CN': 4, 'JP': 5,
    'ANZ': 6, 'KR': 7, 'TW': 8, 'RU': 9, 'IN': 10, 'NZ_865': 11,
    'TH': 12, 'UA_433': 14, 'UA_868': 15, 'MY_433': 16, 'MY_919': 17, 'SG_923': 18
  };

  const MODEM_PRESET_ENUM: Record<string, number> = {
    'LONG_FAST': 0, 'LONG_SLOW': 1, 'VERY_LONG_SLOW': 2, 'MEDIUM_SLOW': 3,
    'MEDIUM_FAST': 4, 'SHORT_SLOW': 5, 'SHORT_FAST': 6, 'LONG_MODERATE': 7
  };

  const handleSetConfig = (configType: string) => {
    if (!radioId) return;

    // Get the appropriate config object based on type
    let config;
    switch (configType) {
      case 'lora':
        // Convert string enums to integers for LoRa config
        config = {
          ...loraConfig,
          region: REGION_ENUM[loraConfig.region] ?? loraConfig.region,
          modemPreset: MODEM_PRESET_ENUM[loraConfig.modemPreset] ?? loraConfig.modemPreset,
        };
        break;
      case 'device':
        config = deviceConfig;
        break;
      case 'position':
        config = positionConfig;
        break;
      case 'power':
        config = powerConfig;
        break;
      case 'network':
        config = networkConfig;
        break;
      case 'display':
        config = displayConfig;
        break;
      case 'bluetooth':
        config = bluetoothConfig;
        break;
      default:
        console.error(`Unknown config type: ${configType}`);
        return;
    }

    onSetConfig(radioId, configType, config);
  };

  if (!radioId) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-400">Please select a radio to configure</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* LoRa Configuration */}
      {sections.find(s => s.id === 'lora')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📡</span>
              <div>
                <h3 className="text-xl font-bold text-white">LoRa Configuration</h3>
                <p className="text-sm text-slate-400">Radio frequency and modulation settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('lora')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('lora')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Region */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Region <span className="text-red-400">*</span>
              </label>
              <select
                value={loraConfig.region}
                onChange={(e) => setLoraConfig({ ...loraConfig, region: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="UNSET">Unset</option>
                <option value="US">US (902-928 MHz)</option>
                <option value="EU_433">EU 433 (433 MHz)</option>
                <option value="EU_868">EU 868 (868 MHz)</option>
                <option value="CN">CN (470-510 MHz)</option>
                <option value="JP">JP (920-923 MHz)</option>
                <option value="ANZ">ANZ (915-928 MHz)</option>
                <option value="KR">KR (920-923 MHz)</option>
                <option value="TW">TW (920-925 MHz)</option>
                <option value="RU">RU (868-870 MHz)</option>
                <option value="IN">IN (865-867 MHz)</option>
                <option value="NZ_865">NZ 865 (864-868 MHz)</option>
                <option value="TH">TH (920-925 MHz)</option>
                <option value="UA_433">UA 433 (433 MHz)</option>
                <option value="UA_868">UA 868 (868 MHz)</option>
                <option value="MY_433">MY 433 (433 MHz)</option>
                <option value="MY_919">MY 919 (919-924 MHz)</option>
                <option value="SG_923">SG 923 (917-925 MHz)</option>
              </select>
            </div>

            {/* Modem Preset */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Modem Preset
              </label>
              <select
                value={loraConfig.modemPreset}
                onChange={(e) => setLoraConfig({ ...loraConfig, modemPreset: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="LONG_FAST">Long Fast (Default)</option>
                <option value="LONG_SLOW">Long Slow</option>
                <option value="VERY_LONG_SLOW">Very Long Slow</option>
                <option value="MEDIUM_SLOW">Medium Slow</option>
                <option value="MEDIUM_FAST">Medium Fast</option>
                <option value="SHORT_SLOW">Short Slow</option>
                <option value="SHORT_FAST">Short Fast</option>
                <option value="LONG_MODERATE">Long Moderate</option>
              </select>
            </div>

            {/* Hop Limit */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Hop Limit (Max Retransmissions)
              </label>
              <input
                type="number"
                min="0"
                max="7"
                value={loraConfig.hopLimit}
                onChange={(e) => setLoraConfig({ ...loraConfig, hopLimit: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">Max number of hops (0-7)</p>
            </div>

            {/* TX Power */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                TX Power (dBm)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                value={loraConfig.txPower}
                onChange={(e) => setLoraConfig({ ...loraConfig, txPower: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">Transmit power in dBm (0-30)</p>
            </div>

            {/* Channel Number */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Channel Number
              </label>
              <input
                type="number"
                min="0"
                max="255"
                value={loraConfig.channelNum}
                onChange={(e) => setLoraConfig({ ...loraConfig, channelNum: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">LoRa channel number</p>
            </div>

            {/* Override Frequency */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Override Frequency (MHz)
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={loraConfig.overrideFrequency}
                onChange={(e) => setLoraConfig({ ...loraConfig, overrideFrequency: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">0 = use default for region</p>
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={loraConfig.txEnabled}
                  onChange={(e) => setLoraConfig({ ...loraConfig, txEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>TX Enabled (Allow Transmission)</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={loraConfig.overrideDutyCycle}
                  onChange={(e) => setLoraConfig({ ...loraConfig, overrideDutyCycle: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Override Duty Cycle Limits (Use with caution)</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={loraConfig.sx126xRxBoostedGain}
                  onChange={(e) => setLoraConfig({ ...loraConfig, sx126xRxBoostedGain: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>SX126x RX Boosted Gain (Better receive sensitivity)</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={loraConfig.paFanDisabled}
                  onChange={(e) => setLoraConfig({ ...loraConfig, paFanDisabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Disable PA Fan (For devices with cooling fan)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Device Configuration */}
      {sections.find(s => s.id === 'device')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <h3 className="text-xl font-bold text-white">Device Settings</h3>
                <p className="text-sm text-slate-400">General device configuration</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('device')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('device')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Device Role
              </label>
              <select
                value={deviceConfig.role}
                onChange={(e) => setDeviceConfig({ ...deviceConfig, role: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="CLIENT">Client (Default)</option>
                <option value="CLIENT_MUTE">Client Mute (No retransmit)</option>
                <option value="ROUTER">Router (Always retransmit)</option>
                <option value="ROUTER_CLIENT">Router Client</option>
                <option value="REPEATER">Repeater</option>
                <option value="TRACKER">Tracker</option>
                <option value="SENSOR">Sensor</option>
                <option value="TAK">TAK</option>
                <option value="CLIENT_HIDDEN">Client Hidden</option>
                <option value="LOST_AND_FOUND">Lost and Found</option>
                <option value="TAK_TRACKER">TAK Tracker</option>
              </select>
            </div>

            {/* Rebroadcast Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Rebroadcast Mode
              </label>
              <select
                value={deviceConfig.rebroadcastMode}
                onChange={(e) => setDeviceConfig({ ...deviceConfig, rebroadcastMode: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="ALL">All (Default)</option>
                <option value="ALL_SKIP_DECODING">All Skip Decoding</option>
                <option value="LOCAL_ONLY">Local Only</option>
                <option value="KNOWN_ONLY">Known Only</option>
              </select>
            </div>

            {/* Node Info Broadcast Interval */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Node Info Broadcast Interval (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={deviceConfig.nodeInfoBroadcastSecs}
                onChange={(e) => setDeviceConfig({ ...deviceConfig, nodeInfoBroadcastSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">How often to broadcast node info (default: 900s)</p>
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={deviceConfig.serialEnabled}
                  onChange={(e) => setDeviceConfig({ ...deviceConfig, serialEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Serial Console Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={deviceConfig.debugLogEnabled}
                  onChange={(e) => setDeviceConfig({ ...deviceConfig, debugLogEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Debug Log Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={deviceConfig.doubleTapAsButtonPress}
                  onChange={(e) => setDeviceConfig({ ...deviceConfig, doubleTapAsButtonPress: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Double Tap as Button Press</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Position/GPS Configuration */}
      {sections.find(s => s.id === 'position')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📍</span>
              <div>
                <h3 className="text-xl font-bold text-white">Position/GPS Configuration</h3>
                <p className="text-sm text-slate-400">GPS and location settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('position')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('position')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Position Broadcast Interval */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Position Broadcast Interval (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={positionConfig.positionBroadcastSecs}
                onChange={(e) => setPositionConfig({ ...positionConfig, positionBroadcastSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">How often to broadcast position (default: 900s)</p>
            </div>

            {/* GPS Update Interval */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                GPS Update Interval (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={positionConfig.gpsUpdateInterval}
                onChange={(e) => setPositionConfig({ ...positionConfig, gpsUpdateInterval: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">How often GPS attempts to acquire position</p>
            </div>

            {/* GPS Attempt Time */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                GPS Attempt Time (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={positionConfig.gpsAttemptTime}
                onChange={(e) => setPositionConfig({ ...positionConfig, gpsAttemptTime: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">How long GPS stays on trying to acquire</p>
            </div>

            {/* RX GPIO */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                GPS RX GPIO Pin
              </label>
              <input
                type="number"
                min="0"
                value={positionConfig.rxGpio}
                onChange={(e) => setPositionConfig({ ...positionConfig, rxGpio: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* TX GPIO */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                GPS TX GPIO Pin
              </label>
              <input
                type="number"
                min="0"
                value={positionConfig.txGpio}
                onChange={(e) => setPositionConfig({ ...positionConfig, txGpio: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={positionConfig.gpsEnabled}
                  onChange={(e) => setPositionConfig({ ...positionConfig, gpsEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>GPS Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={positionConfig.fixedPosition}
                  onChange={(e) => setPositionConfig({ ...positionConfig, fixedPosition: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Fixed Position (Disable GPS updates)</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={positionConfig.positionBroadcastSmartEnabled}
                  onChange={(e) => setPositionConfig({ ...positionConfig, positionBroadcastSmartEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Smart Position Broadcast (Only when moved)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Power Configuration */}
      {sections.find(s => s.id === 'power')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔋</span>
              <div>
                <h3 className="text-xl font-bold text-white">Power Management</h3>
                <p className="text-sm text-slate-400">Battery and power saving settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('power')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('power')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Shutdown After */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Shutdown After (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={powerConfig.onBatteryShutdownAfterSecs}
                onChange={(e) => setPowerConfig({ ...powerConfig, onBatteryShutdownAfterSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">0 = never shutdown</p>
            </div>

            {/* Wait Bluetooth */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Wait for Bluetooth (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={powerConfig.waitBluetoothSecs}
                onChange={(e) => setPowerConfig({ ...powerConfig, waitBluetoothSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">Wait for Bluetooth before sleeping</p>
            </div>

            {/* Mesh SDS Timeout */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Mesh SDS Timeout (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={powerConfig.meshSdsTimeoutSecs}
                onChange={(e) => setPowerConfig({ ...powerConfig, meshSdsTimeoutSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* SDS Secs */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Super Deep Sleep (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={powerConfig.sdsSecs}
                onChange={(e) => setPowerConfig({ ...powerConfig, sdsSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* LS Secs */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Light Sleep (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={powerConfig.lsSecs}
                onChange={(e) => setPowerConfig({ ...powerConfig, lsSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Min Wake */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Minimum Wake Time (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={powerConfig.minWakeSecs}
                onChange={(e) => setPowerConfig({ ...powerConfig, minWakeSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* ADC Multiplier Override */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                ADC Multiplier Override
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={powerConfig.adcMultiplierOverride}
                onChange={(e) => setPowerConfig({ ...powerConfig, adcMultiplierOverride: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">Battery voltage calibration</p>
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={powerConfig.isPowerSaving}
                  onChange={(e) => setPowerConfig({ ...powerConfig, isPowerSaving: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Power Saving Mode Enabled</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Network Configuration */}
      {sections.find(s => s.id === 'network')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌐</span>
              <div>
                <h3 className="text-xl font-bold text-white">Network Configuration</h3>
                <p className="text-sm text-slate-400">WiFi and Ethernet settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('network')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('network')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* WiFi SSID */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                WiFi SSID
              </label>
              <input
                type="text"
                value={networkConfig.wifiSsid}
                onChange={(e) => setNetworkConfig({ ...networkConfig, wifiSsid: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                placeholder="My Network"
              />
            </div>

            {/* WiFi Password */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                WiFi Password
              </label>
              <input
                type="password"
                value={networkConfig.wifiPsk}
                onChange={(e) => setNetworkConfig({ ...networkConfig, wifiPsk: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                placeholder="••••••••"
              />
            </div>

            {/* NTP Server */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                NTP Server
              </label>
              <input
                type="text"
                value={networkConfig.ntpServer}
                onChange={(e) => setNetworkConfig({ ...networkConfig, ntpServer: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                placeholder="pool.ntp.org"
              />
            </div>

            {/* Address Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Address Mode
              </label>
              <select
                value={networkConfig.addressMode}
                onChange={(e) => setNetworkConfig({ ...networkConfig, addressMode: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="DHCP">DHCP</option>
                <option value="STATIC">Static IP</option>
              </select>
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={networkConfig.wifiEnabled}
                  onChange={(e) => setNetworkConfig({ ...networkConfig, wifiEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>WiFi Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={networkConfig.ethEnabled}
                  onChange={(e) => setNetworkConfig({ ...networkConfig, ethEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Ethernet Enabled</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Display Configuration */}
      {sections.find(s => s.id === 'display')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🖥️</span>
              <div>
                <h3 className="text-xl font-bold text-white">Display Configuration</h3>
                <p className="text-sm text-slate-400">Screen and display settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('display')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('display')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Screen On Duration */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Screen On Duration (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={displayConfig.screenOnSecs}
                onChange={(e) => setDisplayConfig({ ...displayConfig, screenOnSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">0 = always on</p>
            </div>

            {/* Auto Carousel */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Auto Screen Carousel (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={displayConfig.autoScreenCarouselSecs}
                onChange={(e) => setDisplayConfig({ ...displayConfig, autoScreenCarouselSecs: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              />
              <p className="text-xs text-slate-500 mt-1">0 = disabled</p>
            </div>

            {/* GPS Format */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                GPS Coordinate Format
              </label>
              <select
                value={displayConfig.gpsFormat}
                onChange={(e) => setDisplayConfig({ ...displayConfig, gpsFormat: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="DEC">Decimal (DEC)</option>
                <option value="DMS">Degrees Minutes Seconds (DMS)</option>
                <option value="UTM">UTM</option>
                <option value="MGRS">MGRS</option>
                <option value="OLC">Open Location Code (OLC)</option>
                <option value="OSGR">Ordnance Survey (OSGR)</option>
              </select>
            </div>

            {/* Units */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Units
              </label>
              <select
                value={displayConfig.units}
                onChange={(e) => setDisplayConfig({ ...displayConfig, units: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="METRIC">Metric</option>
                <option value="IMPERIAL">Imperial</option>
              </select>
            </div>

            {/* OLED Type */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                OLED Type
              </label>
              <select
                value={displayConfig.oled}
                onChange={(e) => setDisplayConfig({ ...displayConfig, oled: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="AUTO">Auto</option>
                <option value="SSD1306">SSD1306</option>
                <option value="SH1106">SH1106</option>
                <option value="SH1107">SH1107</option>
              </select>
            </div>

            {/* Display Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Display Mode
              </label>
              <select
                value={displayConfig.displaymode}
                onChange={(e) => setDisplayConfig({ ...displayConfig, displaymode: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="DEFAULT">Default</option>
                <option value="TWOCOLOR">Two Color</option>
                <option value="INVERTED">Inverted</option>
                <option value="COLOR">Color</option>
              </select>
            </div>

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={displayConfig.compassNorthTop}
                  onChange={(e) => setDisplayConfig({ ...displayConfig, compassNorthTop: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Compass North Top (Rotate compass to north)</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={displayConfig.flipScreen}
                  onChange={(e) => setDisplayConfig({ ...displayConfig, flipScreen: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Flip Screen 180°</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={displayConfig.headingBold}
                  onChange={(e) => setDisplayConfig({ ...displayConfig, headingBold: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Bold Heading Text</span>
              </label>
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={displayConfig.wakeOnTapOrMotion}
                  onChange={(e) => setDisplayConfig({ ...displayConfig, wakeOnTapOrMotion: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Wake on Tap or Motion</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Bluetooth Configuration */}
      {sections.find(s => s.id === 'bluetooth')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📲</span>
              <div>
                <h3 className="text-xl font-bold text-white">Bluetooth Configuration</h3>
                <p className="text-sm text-slate-400">Bluetooth pairing settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleGetConfig('bluetooth')} className="btn-secondary text-sm">
                📥 Get
              </button>
              <button onClick={() => handleSetConfig('bluetooth')} className="btn-primary text-sm">
                💾 Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pairing Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Pairing Mode
              </label>
              <select
                value={bluetoothConfig.mode}
                onChange={(e) => setBluetoothConfig({ ...bluetoothConfig, mode: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
              >
                <option value="RANDOM_PIN">Random PIN</option>
                <option value="FIXED_PIN">Fixed PIN</option>
                <option value="NO_PIN">No PIN</option>
              </select>
            </div>

            {/* Fixed PIN */}
            {bluetoothConfig.mode === 'FIXED_PIN' && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Fixed PIN
                </label>
                <input
                  type="number"
                  min="0"
                  max="999999"
                  value={bluetoothConfig.fixedPin}
                  onChange={(e) => setBluetoothConfig({ ...bluetoothConfig, fixedPin: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            )}

            {/* Checkboxes */}
            <div className="md:col-span-2 space-y-3">
              <label className="flex items-center gap-2 text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={bluetoothConfig.enabled}
                  onChange={(e) => setBluetoothConfig({ ...bluetoothConfig, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span>Bluetooth Enabled</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Modules Section */}
      {sections.find(s => s.id === 'modules')?.expanded && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🧩</span>
            <div>
              <h3 className="text-xl font-bold text-white">Module Configuration</h3>
              <p className="text-sm text-slate-400">Configure optional modules and features</p>
            </div>
          </div>

          {!selectedModule ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { name: 'MQTT', icon: '📨', desc: 'MQTT Gateway' },
                  { name: 'Serial', icon: '🔌', desc: 'Serial Module' },
                  { name: 'External Notification', icon: '🔔', desc: 'LED/Buzzer alerts' },
                  { name: 'Store & Forward', icon: '💾', desc: 'Message store & forward' },
                  { name: 'Range Test', icon: '📏', desc: 'Range testing' },
                  { name: 'Telemetry', icon: '📊', desc: 'Device telemetry' },
                  { name: 'Canned Message', icon: '💬', desc: 'Predefined messages' },
                  { name: 'Audio', icon: '🔊', desc: 'Audio codec' },
                  { name: 'Remote Hardware', icon: '🎛️', desc: 'GPIO control' },
                  { name: 'Neighbor Info', icon: '👥', desc: 'Neighbor tracking' },
                  { name: 'Ambient Lighting', icon: '💡', desc: 'RGB LED control' },
                  { name: 'Detection Sensor', icon: '🚨', desc: 'Motion detection' },
                  { name: 'Paxcounter', icon: '👤', desc: 'People counter' },
                ].map((module) => (
                  <button
                    key={module.name}
                    className="card p-4 hover:border-primary-500 transition-all text-left group"
                    onClick={() => setSelectedModule(module.name)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{module.icon}</span>
                      <h4 className="font-semibold text-white group-hover:text-primary-400">
                        {module.name}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400">{module.desc}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-400">
                  Click on a module to configure its specific settings
                </p>
              </div>
            </>
          ) : (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-lg font-semibold text-white">{selectedModule} Settings</h4>
                <button
                  onClick={() => setSelectedModule(null)}
                  className="btn-secondary text-sm"
                >
                  ← Back to Modules
                </button>
              </div>

              <div className="p-6 bg-slate-800/50 rounded-lg mb-4">
                <p className="text-slate-400 text-sm mb-4">
                  Module configuration will be available via get/set config commands for: <span className="font-semibold text-white">{selectedModule}</span>
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-white cursor-pointer">
                      <input type="checkbox" className="w-4 h-4" />
                      <span>Enable {selectedModule} Module</span>
                    </label>
                  </div>

                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-400">
                      ℹ️ Module-specific settings will be implemented based on Meshtastic protocol requirements.
                      Use the "Get Config" and "Set Config" methods via the backend to manage module configurations.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        console.log(`Getting ${selectedModule} config`);
                        alert(`Getting ${selectedModule} configuration from radio...`);
                      }}
                      className="btn-secondary flex-1"
                    >
                      📥 Get Config
                    </button>
                    <button
                      onClick={() => {
                        console.log(`Setting ${selectedModule} config`);
                        alert(`Setting ${selectedModule} configuration...`);
                      }}
                      className="btn-primary flex-1"
                    >
                      💾 Save Config
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section Toggle Buttons */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Configuration Sections</h3>
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                section.expanded
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {section.icon} {section.title}
            </button>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="card p-4 bg-red-500/10 border border-red-500/30">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h4 className="text-red-400 font-semibold mb-1">Important Warning</h4>
            <p className="text-red-400 text-sm">
              Changing radio configuration can break connectivity and prevent communication with other devices.
              Make sure you understand each setting before making changes. Some changes require a device reboot to take effect.
              Incorrect LoRa region settings may violate local regulations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RadioSettings;
