import { useState, useEffect, useRef } from 'react';

// Width (px) the extracted focal length is normalized to. depthToTread.js
// assumes the same reference width for its tread-width calibration, so the
// focal/width ratio stays consistent regardless of actual capture resolution.
const REF_FRAME_WIDTH = 1280;

// Optional WebXR — Android ARCore only; iOS always unsupported.
// Provides two calibration aids, both degrading silently when unavailable:
//   • metricsScaleFactor — metric depth (m) at frame center, when depth-sensing is granted
//   • focalLengthPx       — true camera focal length (px @ REF_FRAME_WIDTH) from the
//                           AR projection matrix, available whenever an AR session starts
export default function useWebXR() {
  const [metricsScaleFactor, setMetricsScaleFactor] = useState(null);
  const [focalLengthPx,      setFocalLengthPx]      = useState(null);
  const sessionRef     = useRef(null);
  const samplesRef     = useRef([]);
  const focalSetRef    = useRef(false);

  useEffect(() => {
    let active = true;

    async function tryStart() {
      try {
        if (!navigator.xr) return;
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!supported || !active) return;

        // depth-sensing is OPTIONAL so the session still starts on AR-capable
        // phones without it — we can still read focal length from the projection
        // matrix. Phones that grant depth-sensing additionally get metric scale.
        const session = await navigator.xr.requestSession('immersive-ar', {
          optionalFeatures: ['depth-sensing'],
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
            // Focal length from the perspective projection matrix.
            // projectionMatrix[0] = 1 / tan(hfov/2) for a symmetric frustum, so
            // f_px = (W/2) * projectionMatrix[0]. Set once — it doesn't change.
            if (!focalSetRef.current) {
              const p0 = view.projectionMatrix?.[0];
              if (p0 > 0) {
                focalSetRef.current = true;
                setFocalLengthPx((REF_FRAME_WIDTH / 2) * p0);
              }
            }

            const di = frame.getDepthInformation?.(view);
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
        // Not available; proceed with focal/MiDaS-only calibration
      }
    }

    tryStart();
    return () => {
      active = false;
      sessionRef.current?.end().catch(() => {});
    };
  }, []);

  return { metricsScaleFactor, focalLengthPx };
}
