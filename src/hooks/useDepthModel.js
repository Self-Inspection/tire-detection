import { useState, useEffect, useRef, useCallback } from 'react';

const MIN_FRAME_INTERVAL_MS = 100; // throttle to ~10fps
const MODEL_LOAD_TIMEOUT_MS = 40_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    )
  ]);
}

export default function useDepthModel() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [modelError, setModelError]       = useState(null);
  const estimatorRef    = useRef(null);
  const lastFrameRef    = useRef(0);
  const inferenceErrRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const tf = await import('@tensorflow/tfjs');
        // Prefer WebGL; fall back to CPU on failure
        try {
          await tf.setBackend('webgl');
          await tf.ready();
        } catch {
          await tf.setBackend('cpu');
          await tf.ready();
        }

        const depthEstimation = await import('@tensorflow-models/depth-estimation');

        // ARPortraitDepth: uses runtime:'tfjs' segmenter (no MediaPipe WASM needed).
        // Apply a hard timeout so the spinner never hangs indefinitely.
        const estimator = await withTimeout(
          depthEstimation.createEstimator(
            depthEstimation.SupportedModels.ARPortraitDepth,
            { runtime: 'tfjs' }
          ),
          MODEL_LOAD_TIMEOUT_MS,
          'Depth model'
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
      tensor.dispose(); // dispose the tensor we hold; depthMap has no .dispose() in 0.0.3

      return { data: new Float32Array(rawData), width, height };
    } catch (err) {
      if (!inferenceErrRef.current) {
        inferenceErrRef.current = true;
        setModelError('Depth inference failed: ' + err.message);
      }
      return null;
    }
  }, []);

  return { estimateDepth, isModelLoaded, modelError };
}
