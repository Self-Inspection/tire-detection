/**
 * Fire-and-forget scan history recording. Failures are swallowed —
 * recording must never break or slow down the scan flow itself.
 */

export function newScanLogId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function logScan(record) {
  try {
    fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      keepalive: true
    }).catch(() => {});
  } catch { /* recording is best-effort */ }
}

export function logScanAdjustment(clientId, patch) {
  if (!clientId) return;
  try {
    fetch(`/api/scans/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      keepalive: true
    }).catch(() => {});
  } catch { /* recording is best-effort */ }
}
