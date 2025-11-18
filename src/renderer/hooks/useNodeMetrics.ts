import { useMemo } from 'react';
import { MeshNode } from '../types';

interface NodeMetrics {
  total: number;
  active: number;
  withPosition: number;
  withTelemetry: number;
  recentlyActive: number;
}

/**
 * Calculate various node metrics from node list
 * A node is considered "active" if heard within last 15 minutes
 * A node is considered "recently active" if heard within last 5 minutes
 */
export function useNodeMetrics(nodes: MeshNode[]): NodeMetrics {
  return useMemo(() => {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    const fiveMinutes = 5 * 60 * 1000;

    const active = nodes.filter(n =>
      n.lastHeard && (now - n.lastHeard.getTime()) < fifteenMinutes
    ).length;

    const recentlyActive = nodes.filter(n =>
      n.lastHeard && (now - n.lastHeard.getTime()) < fiveMinutes
    ).length;

    const withPosition = nodes.filter(n => n.position).length;

    const withTelemetry = nodes.filter(n =>
      n.batteryLevel !== undefined ||
      n.temperature !== undefined ||
      n.channelUtilization !== undefined
    ).length;

    return {
      total: nodes.length,
      active,
      withPosition,
      withTelemetry,
      recentlyActive,
    };
  }, [nodes]);
}
