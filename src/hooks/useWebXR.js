import { useState, useEffect, useRef } from 'react';

// Optional WebXR depth sensing — Android ARCore only; iOS always unsupported.
// Provides a metric scale factor to improve MiDaS calibration accuracy.
// Degrades silently when unavailable.
export default function useWebXR() {
  const [metricsScaleFactor, setMetricsScaleFactor] = useState(null);
  const sessionRef = useRef(null);
  const samplesRef = useRef([]);

  useEffect(() => {
    let active = true;

    async function tryStart() {
      try {
        if (!navigator.xr) return;
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!supported || !active) return;

        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['depth-sensing'],
          depthSensing: {
            usagePreference: ['cpu-optimized'],
            dataFormatPreference: ['luminance-alpha']
          }
        });

        if (!active) { session.end(); return; }
        sessionRef.current = session;
        session.addEventListener('end', () => { sessionRef.current = null; });

        const refSpace = await session.requestReferenceSpace('local');

        session.requestAnimationFrame(function tick(_, frame) {
          if (!sessionRef.current) return;
          session.requestAnimationFrame(tick);

          const pose = frame.getViewerPose(refSpace);
          if (!pose) return;

          for (const view of pose.views) {
            const di = frame.getDepthInformation(view);
            if (!di) continue;
            const d = di.getDepthInMeters(0.5, 0.5) * (di.rawValueToMeters ?? 1);
            if (d > 0.05 && d < 1.5) {
              samplesRef.current.push(d);
              if (samplesRef.current.length > 30) samplesRef.current.shift();
              const mean = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
              setMetricsScaleFactor(mean);
            }
          }
        });
      } catch {
        // Not available; proceed with MiDaS-only calibration
      }
    }

    tryStart();
    return () => {
      active = false;
      sessionRef.current?.end().catch(() => {});
    };
  }, []);

  return { metricsScaleFactor };
}
