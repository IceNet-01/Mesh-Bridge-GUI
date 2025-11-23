/**
 * Utility to clear localStorage and fix corrupted timestamp data
 * Run this from browser console if you're experiencing timestamp issues
 */

export function clearMessageStorage() {
  localStorage.removeItem('mesh-bridge-messages');
  localStorage.removeItem('mesh-bridge-nodes');
  console.log('✅ Cleared message and node storage. Refresh the page to reload fresh data.');
}

export function clearAllStorage() {
  localStorage.clear();
  console.log('✅ Cleared all localStorage. Refresh the page to start fresh.');
}

// Make available globally (always available for debugging)
if (typeof window !== 'undefined') {
  (window as any).clearMessageStorage = clearMessageStorage;
  (window as any).clearAllStorage = clearAllStorage;
  console.log('💡 Storage utilities available: clearMessageStorage(), clearAllStorage()');
}
