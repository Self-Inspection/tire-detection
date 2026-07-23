import { useState, useEffect, useCallback } from 'react';

/** Within ~25° of vertical: gravity mostly in the screen plane, not through it. */
const MAX_GRAVITY_Z = 4.2; // m/s²
/** Pre-record stability: rotation below this = holding steady. */
const STEADY_MAX_DEG_S = 25;

/**
 * Motion/orientation checks for the guided tread scan:
 * - parallelOk: phone held roughly vertical (parallel to the tire face)
 * - steadyOk:   phone not shaking/swinging (pre-record gate)
 * - sweepSpeed: rotation magnitude in deg/s (recording pace feedback)
 *
 * All values are null until sensor data arrives — callers must treat null as
 * "unknown, don't block" (desktop browsers and denied permissions).
 */
export default function useDeviceMotion() {
  const [permission, setPermission] = useState('unknown'); // unknown | granted | denied
  const [parallelOk, setParallelOk] = useState(null);
  const [steadyOk, setSteadyOk] = useState(null);
  const [sweepSpeed, setSweepSpeed] = useState(null);

  // iOS Safari requires an explicit permission request from a user gesture.
  // Everywhere else devicemotion just works — treat as granted.
  const needsPermissionPrompt =
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function';

  const requestPermission = useCallback(async () => {
    if (!needsPermissionPrompt) {
      setPermission('granted');
      return 'granted';
    }
    try {
      const result = await DeviceMotionEvent.requestPermission();
      setPermission(result);
      return result;
    } catch {
      setPermission('denied');
      return 'denied';
    }
  }, [needsPermissionPrompt]);

  useEffect(() => {
    if (!needsPermissionPrompt) setPermission('granted');
  }, [needsPermissionPrompt]);

  useEffect(() => {
    if (permission !== 'granted' || typeof window === 'undefined') return;

    let lastUpdate = 0;
    function onMotion(e) {
      const now = performance.now();
      if (now - lastUpdate < 180) return; // ~5 Hz state updates
      lastUpdate = now;

      const g = e.accelerationIncludingGravity;
      if (g && g.z != null) {
        setParallelOk(Math.abs(g.z) < MAX_GRAVITY_Z);
      }

      const r = e.rotationRate;
      if (r && (r.alpha != null || r.beta != null || r.gamma != null)) {
        const speed = Math.sqrt(
          (r.alpha ?? 0) ** 2 + (r.beta ?? 0) ** 2 + (r.gamma ?? 0) ** 2
        );
        setSweepSpeed(speed);
        setSteadyOk(speed < STEADY_MAX_DEG_S);
      }
    }

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [permission]);

  return { permission, requestPermission, parallelOk, steadyOk, sweepSpeed };
}
