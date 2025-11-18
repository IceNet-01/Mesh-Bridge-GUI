/**
 * Format seconds into human-readable uptime string
 */
export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${minutes}m ${secs}s`;
}

/**
 * Format a date as "time ago" string
 */
export function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const seconds = Math.floor((now - timestamp) / 1000);

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format percentage with specified decimal places
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(lat: number, lon: number, decimals: number = 6): string {
  return `${lat.toFixed(decimals)}, ${lon.toFixed(decimals)}`;
}

/**
 * Format file size in bytes to human-readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format timestamp to locale time string
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString();
}

/**
 * Format timestamp to locale date and time string
 */
export function formatDateTime(date: Date): string {
  return date.toLocaleString();
}
