import { Card } from '../ui/Card';

interface EnvironmentalData {
  nodeId: string;
  nodeName: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  lastHeard: Date;
}

interface EnvironmentalSensorsProps {
  environmentalData: EnvironmentalData[];
}

export function EnvironmentalSensors({ environmentalData }: EnvironmentalSensorsProps) {
  if (environmentalData.length === 0) {
    return null;
  }

  return (
    <Card>
      <h3 className="card-header">🌡️ Environmental Sensors</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {environmentalData.map(sensor => (
          <div key={sensor.nodeId} className="bg-slate-800/50 p-4 rounded-lg">
            <div className="font-bold text-white mb-2">{sensor.nodeName}</div>

            {sensor.temperature !== undefined && (
              <div className="mb-2">
                <div className="text-xs text-slate-400">Temperature</div>
                <div className="text-2xl font-bold text-orange-400">
                  {sensor.temperature.toFixed(1)}°C
                </div>
              </div>
            )}

            {sensor.humidity !== undefined && (
              <div className="mb-2">
                <div className="text-xs text-slate-400">Humidity</div>
                <div className="text-2xl font-bold text-blue-400">
                  {sensor.humidity.toFixed(0)}%
                </div>
              </div>
            )}

            {sensor.pressure !== undefined && (
              <div className="mb-2">
                <div className="text-xs text-slate-400">Pressure</div>
                <div className="text-2xl font-bold text-purple-400">
                  {sensor.pressure.toFixed(1)} hPa
                </div>
              </div>
            )}

            <div className="text-xs text-slate-500 mt-2">
              Last update: {Math.floor((Date.now() - sensor.lastHeard.getTime()) / 60000)}m ago
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
