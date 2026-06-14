import { useState, useEffect, useRef } from 'react';

const REF_FRAME_WIDTH = 1280;

// Optional WebXR — Android ARCore + iPhone Pro (iOS 17+) with LiDAR.
// Accepts an existing XR session (started in a user-gesture handler) or tries
// to start one automatically (works on Android; iOS requires the gesture path).
//
// Returns:
//   metricsScaleFactor — metric depth (m) at center, for scale calibration
//   focalLengthPx      — true camera focal length from the projection matrix
//   lidarFrameRef      — ref to the latest { data: Float32Array (meters), width, height }
//                        Only populated when depth-sensing is available (LiDAR)
export default function useWebXR({ existingSession } = {}) {
  const [metricsScaleFactor, setMetricsScaleFactor] = useState(null);
  const [focalLengthPx,      setFocalLengthPx]      = useState(null);
  const sessionRef     = useRef(null);
  const samplesRef     = useRef([]);
  const focalSetRef    = useRef(false);
  const lidarFrameRef  = useRef(null);

  useEffect(() => {
    let active = true;

    async function start(session) {
      if (!active) { session.end(); return; }
      sessionRef.current = session;
      session.addEventListener('end', () => {
        sessionRef.current = null;
        lidarFrameRef.current = null;
      });

      const refSpace = await session.requestReferenceSpace('local');

      session.requestAnimationFrame(function tick(_, frame) {
        if (!sessionRef.current) return;
        session.requestAnimationFrame(tick);

        const pose = frame.getViewerPose(refSpace);
        if (!pose) return;

        for (const view of pose.views) {
          if (!focalSetRef.current) {
            const p0 = view.projectionMatrix?.[0];
            if (p0 > 0) {
              focalSetRef.current = true;
              setFocalLengthPx((REF_FRAME_WIDTH / 2) * p0);
            }
          }

          const di = frame.getDepthInformation?.(view);
          if (!di) continue;

          const depthMeters = new Float32Array(di.width * di.height);
          for (let i = 0; i < di.data.length; i++) {
            depthMeters[i] = di.data[i] * di.rawValueToMeters;
          }
          lidarFrameRef.current = { data: depthMeters, width: di.width, height: di.height };

          const d = di.getDepthInMeters(0.5, 0.5) * (di.rawValueToMeters ?? 1);
          if (d > 0.05 && d < 1.5) {
            samplesRef.current.push(d);
            if (samplesRef.current.length > 30) samplesRef.current.shift();
            const mean = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
            setMetricsScaleFactor(mean);
          }
        }
      });
    }

    if (existingSession) {
      start(existingSession);
    } else {
      async function tryStart() {
        try {
          if (!navigator.xr) return;
          const supported = await navigator.xr.isSessionSupported('immersive-ar');
          if (!supported || !active) return;

          const session = await navigator.xr.requestSession('immersive-ar', {
            optionalFeatures: ['depth-sensing'],
            depthSensing: {
              usagePreference: ['cpu-optimized'],
              dataFormatPreference: ['luminance-alpha']
            }
          });
          start(session);
        } catch {
          // Not available; proceed without WebXR calibration
        }
      }
      tryStart();
    }

    return () => {
      active = false;
      sessionRef.current?.end().catch(() => {});
    };
  }, [existingSession]); // eslint-disable-line react-hooks/exhaustive-deps

  return { metricsScaleFactor, focalLengthPx, lidarFrameRef };
}
