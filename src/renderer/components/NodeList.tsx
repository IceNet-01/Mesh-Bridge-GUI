import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { MeshNode, Radio } from '../types';

interface NodeListProps {
  nodes: MeshNode[];
  radios: Radio[];
}

type SortField = 'longName' | 'lastHeard' | 'hwModel' | 'position' | 'batteryLevel';
type SortDirection = 'asc' | 'desc';

function NodeList({ nodes, radios }: NodeListProps) {
  const deleteNode = useStore(state => state.deleteNode);
  const clearAllNodes = useStore(state => state.clearAllNodes);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastHeard');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterHasGPS, setFilterHasGPS] = useState<'all' | 'gps' | 'no-gps'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleDeleteNode = (nodeId: string, nodeName: string) => {
    if (confirm(`Delete node "${nodeName}" (${nodeId}) from database?`)) {
      deleteNode(nodeId);
    }
  };

  const handleClearAll = () => {
    if (showClearConfirm) {
      clearAllNodes();
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
    }
  };

  const isRadio = (nodeId: string) => {
    return radios.some(r => r.nodeInfo?.nodeId === nodeId);
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedNodes = nodes
    .filter(node => {
      // Filter by search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          node.longName.toLowerCase().includes(search) ||
          node.shortName.toLowerCase().includes(search) ||
          node.nodeId.toLowerCase().includes(search) ||
          node.hwModel.toLowerCase().includes(search)
        );
      }
      return true;
    })
    .filter(node => {
      // Filter by GPS
      if (filterHasGPS === 'gps') return !!node.position;
      if (filterHasGPS === 'no-gps') return !node.position;
      return true;
    })
    .sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'longName':
          aVal = a.longName.toLowerCase();
          bVal = b.longName.toLowerCase();
          break;
        case 'lastHeard':
          aVal = a.lastHeard.getTime();
          bVal = b.lastHeard.getTime();
          break;
        case 'hwModel':
          aVal = a.hwModel.toLowerCase();
          bVal = b.hwModel.toLowerCase();
          break;
        case 'position':
          aVal = a.position ? 1 : 0;
          bVal = b.position ? 1 : 0;
          break;
        case 'batteryLevel':
          aVal = a.batteryLevel ?? -1;
          bVal = b.batteryLevel ?? -1;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const nodesWithGPS = nodes.filter(n => n.position).length;
  const nodesWithoutGPS = nodes.length - nodesWithGPS;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Node Database</h2>
          <p className="text-slate-400">
            Complete history of all mesh nodes seen by the bridge (180-day retention)
          </p>
        </div>
        <button
          onClick={handleClearAll}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            showClearConfirm
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          {showClearConfirm ? '⚠️ Click again to confirm' : '🗑️ Clear All Nodes'}
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-slate-400 mb-1">Total Nodes</div>
          <div className="text-2xl font-bold text-white">{nodes.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-400 mb-1">With GPS</div>
          <div className="text-2xl font-bold text-green-400">{nodesWithGPS}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-400 mb-1">Without GPS</div>
          <div className="text-2xl font-bold text-slate-400">{nodesWithoutGPS}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-400 mb-1">Connected Radios</div>
          <div className="text-2xl font-bold text-primary-400">
            {radios.filter(r => r.status === 'connected').length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterHasGPS('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filterHasGPS === 'all' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Nodes ({nodes.length})
          </button>
          <button
            onClick={() => setFilterHasGPS('gps')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filterHasGPS === 'gps' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            With GPS ({nodesWithGPS})
          </button>
          <button
            onClick={() => setFilterHasGPS('no-gps')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filterHasGPS === 'no-gps' ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Without GPS ({nodesWithoutGPS})
          </button>
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search nodes..."
            className="input w-full"
          />
        </div>
      </div>

      {/* Nodes Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Type</th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white"
                  onClick={() => handleSort('longName')}
                >
                  Name {sortField === 'longName' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Short / ID</th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white"
                  onClick={() => handleSort('hwModel')}
                >
                  Hardware {sortField === 'hwModel' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white"
                  onClick={() => handleSort('position')}
                >
                  GPS {sortField === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white"
                  onClick={() => handleSort('batteryLevel')}
                >
                  Battery {sortField === 'batteryLevel' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Temperature</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Signal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Telemetry</th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white"
                  onClick={() => handleSort('lastHeard')}
                >
                  Last Heard {sortField === 'lastHeard' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Seen By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredAndSortedNodes.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                    No nodes to display
                  </td>
                </tr>
              ) : (
                filteredAndSortedNodes.map((node) => {
                  const nodeIsRadio = isRadio(node.nodeId);

                  return (
                    <tr key={node.nodeId} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        {nodeIsRadio ? (
                          <span className="badge-primary">Radio</span>
                        ) : (
                          <span className="badge-success">Node</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-medium">
                        {node.longName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div>{node.shortName}</div>
                        <div className="text-xs text-slate-500 font-mono">{node.nodeId}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {node.hwModel}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {node.position ? (
                          <div className="text-green-400">
                            <div className="font-mono text-xs">
                              {node.position.latitude.toFixed(6)},
                            </div>
                            <div className="font-mono text-xs">
                              {node.position.longitude.toFixed(6)}
                            </div>
                            {node.position.altitude !== undefined && (
                              <div className="text-xs text-slate-500">
                                Alt: {node.position.altitude}m
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {node.batteryLevel !== undefined ? (
                          <div>
                            <div className={`font-medium ${
                              node.batteryLevel > 80 ? 'text-green-400' :
                              node.batteryLevel > 50 ? 'text-yellow-400' :
                              node.batteryLevel > 20 ? 'text-orange-400' : 'text-red-400'
                            }`}>
                              {node.batteryLevel}%
                            </div>
                            {node.voltage !== undefined && (
                              <div className="text-xs text-slate-500">
                                {node.voltage.toFixed(2)}V
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {node.temperature !== undefined ? (
                          <div className={`font-medium ${
                            node.temperature < 0 ? 'text-blue-400' :
                            node.temperature < 25 ? 'text-green-400' :
                            node.temperature < 35 ? 'text-yellow-400' :
                            node.temperature < 50 ? 'text-orange-400' : 'text-red-400'
                          }`}>
                            {node.temperature.toFixed(1)}°C
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {node.snr !== undefined ? (
                          <div>
                            <div className={`font-medium ${
                              node.snr > 5 ? 'text-green-400' :
                              node.snr > 0 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {node.snr.toFixed(1)} dB
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {node.channelUtilization !== undefined || node.airUtilTx !== undefined ? (
                          <div className="space-y-1">
                            {node.channelUtilization !== undefined && (
                              <div className="text-xs">
                                <span className="text-slate-400">Ch:</span>{' '}
                                <span className={`font-medium ${
                                  node.channelUtilization > 80 ? 'text-red-400' :
                                  node.channelUtilization > 50 ? 'text-yellow-400' : 'text-green-400'
                                }`}>
                                  {node.channelUtilization.toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {node.airUtilTx !== undefined && (
                              <div className="text-xs">
                                <span className="text-slate-400">Air:</span>{' '}
                                <span className={`font-medium ${
                                  node.airUtilTx > 80 ? 'text-red-400' :
                                  node.airUtilTx > 50 ? 'text-yellow-400' : 'text-green-400'
                                }`}>
                                  {node.airUtilTx.toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div>{formatTimeAgo(node.lastHeard)}</div>
                        <div className="text-xs text-slate-500" title={formatDateTime(node.lastHeard)}>
                          {formatDateTime(node.lastHeard)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono text-xs">
                        {node.fromRadio || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteNode(node.nodeId, node.longName)}
                          className="text-red-400 hover:text-red-300 transition-colors text-sm"
                          title="Delete node from database"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results summary */}
      <div className="text-sm text-slate-400 text-center">
        Showing {filteredAndSortedNodes.length} of {nodes.length} total nodes
      </div>
    </div>
  );
}

export default NodeList;
