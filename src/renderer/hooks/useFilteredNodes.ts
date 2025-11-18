import { useMemo } from 'react';
import { MeshNode } from '../types';

export interface NodeFilterOptions {
  search?: string;
  onlyActive?: boolean;
  onlyWithPosition?: boolean;
  radioId?: string;
  minBattery?: number;
}

/**
 * Filter nodes based on various criteria
 */
export function useFilteredNodes(
  nodes: MeshNode[],
  filters: NodeFilterOptions
): MeshNode[] {
  return useMemo(() => {
    let filtered = [...nodes];

    // Search filter (name or ID)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(n =>
        n.longName.toLowerCase().includes(searchLower) ||
        n.shortName.toLowerCase().includes(searchLower) ||
        n.nodeId.toLowerCase().includes(searchLower)
      );
    }

    // Active filter (heard within last 15 minutes)
    if (filters.onlyActive) {
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
      filtered = filtered.filter(n =>
        n.lastHeard && n.lastHeard.getTime() > fifteenMinutesAgo
      );
    }

    // Position filter
    if (filters.onlyWithPosition) {
      filtered = filtered.filter(n => n.position);
    }

    // Radio filter
    if (filters.radioId) {
      filtered = filtered.filter(n => n.fromRadio === filters.radioId);
    }

    // Battery filter
    if (filters.minBattery !== undefined) {
      const minBattery = filters.minBattery;
      filtered = filtered.filter(n =>
        n.batteryLevel !== undefined && n.batteryLevel >= minBattery
      );
    }

    return filtered;
  }, [nodes, filters]);
}
