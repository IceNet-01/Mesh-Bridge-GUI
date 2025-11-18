import { Card } from '../ui/Card';

interface NodeAirtime {
  nodeId: string;
  nodeName: string;
  messagesCount: number;
  estimatedAirtime: number;
  lastActive: Date;
}

interface AirtimeByNodeProps {
  airtimeByNode: NodeAirtime[];
}

export function AirtimeByNode({ airtimeByNode }: AirtimeByNodeProps) {
  return (
    <Card>
      <h3 className="card-header">⏱️ Airtime Usage by Node</h3>

      {airtimeByNode.length > 0 ? (
        <div className="space-y-3">
          {airtimeByNode.map(node => (
            <div key={node.nodeId} className="bg-slate-800/50 p-3 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-bold text-white">{node.nodeName}</span>
                  <span className="text-sm text-slate-400 ml-2">
                    ({node.messagesCount} msgs)
                  </span>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${
                    node.estimatedAirtime > 30 ? 'text-red-400' :
                    node.estimatedAirtime > 15 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {node.estimatedAirtime.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500">
                    {node.lastActive && (
                      <>Last: {Math.floor((Date.now() - node.lastActive.getTime()) / 60000)}m ago</>
                    )}
                  </div>
                </div>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    node.estimatedAirtime > 30 ? 'bg-red-500' :
                    node.estimatedAirtime > 15 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${node.estimatedAirtime}%` }}
                />
              </div>
              {node.estimatedAirtime > 30 && (
                <div className="mt-2 text-xs text-yellow-300">
                  ⚠️ High airtime usage - this node is transmitting frequently
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400">
          <p>No airtime data available</p>
          <p className="text-sm text-slate-500 mt-1">Data will appear as messages are received</p>
        </div>
      )}
    </Card>
  );
}
