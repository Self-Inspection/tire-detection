import { useState, useEffect, useRef, useCallback } from 'react';

const MIN_FRAME_INTERVAL_MS = 100; // throttle to ~10fps

export default function useDepthModel() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [modelError, setModelError]       = useState(null);
  const estimatorRef    = useRef(null);
  const lastFrameRef    = useRef(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const tf = await import('@tensorflow/tfjs');
        // Prefer WebGL; fall back to WASM/CPU on failure
        try {
          await tf.setBackend('webgl');
        } catch {
          await tf.setBackend('wasm');
        }
        await tf.ready();

        const depthEstimation = await import('@tensorflow-models/depth-estimation');
        const estimator = await depthEstimation.createEstimator(
          depthEstimation.SupportedModels.ARPortraitDepth
        );

        if (active) {
          estimatorRef.current = estimator;
          setIsModelLoaded(true);
        }
      } catch (err) {
        if (active) setModelError('Depth model failed to load: ' + err.message);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const estimateDepth = useCallback(async (videoElement) => {
    if (!estimatorRef.current || !videoElement) return null;
    if (videoElement.readyState < 2) return null;

    const now = performance.now();
    if (now - lastFrameRef.current < MIN_FRAME_INTERVAL_MS) return null;
    lastFrameRef.current = now;

    try {
      const depthMap = await estimatorRef.current.estimateDepth(videoElement, {
        minDepth: 0,
        maxDepth: 1
      });

      if (!depthMap?.depthTensor) return null;

      const tensor = depthMap.depthTensor;
      const [height, width] = tensor.shape;
      const rawData = await tensor.data(); // Float32Array
      depthMap.dispose();

      return { data: new Float32Array(rawData), width, height };
    } catch {
      return null;
    }
  }, []);

  return { estimateDepth, isModelLoaded, modelError };
}
