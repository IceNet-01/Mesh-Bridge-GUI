/**
 * Get color class based on health score (0-100)
 */
export function getHealthColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

/**
 * Get color class based on SNR value
 */
export function getSignalQualityColor(snr: number): string {
  if (snr > 10) return 'green';
  if (snr > 5) return 'yellow';
  if (snr > 0) return 'orange';
  return 'red';
}

/**
 * Get color class based on RSSI value (dBm)
 */
export function getRSSIColor(rssi: number): string {
  if (rssi > -70) return 'green';
  if (rssi > -85) return 'yellow';
  if (rssi > -100) return 'orange';
  return 'red';
}

/**
 * Get color class based on battery level percentage
 */
export function getBatteryColor(level: number): string {
  if (level > 60) return 'green';
  if (level > 30) return 'yellow';
  if (level > 15) return 'orange';
  return 'red';
}

/**
 * Get color class based on channel utilization percentage
 */
export function getUtilizationColor(utilization: number): string {
  if (utilization < 40) return 'green';
  if (utilization < 60) return 'yellow';
  if (utilization < 80) return 'orange';
  return 'red';
}

/**
 * Get Tailwind color classes for different status levels
 */
export function getStatusColorClasses(status: 'success' | 'warning' | 'error' | 'info'): {
  bg: string;
  border: string;
  text: string;
} {
  const colorMap = {
    success: {
      bg: 'bg-green-500/10',
      border: 'border-green-500',
      text: 'text-green-400',
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500',
      text: 'text-yellow-400',
    },
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500',
      text: 'text-red-400',
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500',
      text: 'text-blue-400',
    },
  };

  return colorMap[status];
}
