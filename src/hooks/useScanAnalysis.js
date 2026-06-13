import { useState, useRef, useEffect } from 'react';
import { computeGrooveDepth, getSafetyLevel } from '../utils/depthToTread.js';
import { computeMotionMagnitude } from '../utils/opticalFlow.js';
import { computeHistogram, findBimodalPeaks, computeCV, estimateProgress } from '../utils/scanQuality.js';

const DS = 32;               // downsample target (DS x DS)
const ROI_X = 0.30;          // center 40% of frame width
const ROI_W = 0.40;
const MIN_FRAMES       = 30;
const TARGET_CV        = 0.15;
const STABLE_MS        = 2000;
const MOTION_THRESHOLD = 0.05;

function downsample(data, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH);
  const sx = srcW / dstW, sy = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      let sum = 0, n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.min(srcW, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.min(srcH, Math.ceil((y + 1) * sy));
      for (let py = y0; py < y1; py++)
        for (let px = x0; px < x1; px++) { sum += data[py * srcW + px]; n++; }
      out[y * dstW + x] = n > 0 ? sum / n : 0;
    }
  }
  return out;
}

function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function useScanAnalysis({ videoRef, estimateDepth, isModelLoaded, tireType, metricsScaleFactor }) {
  const [guidance,   setGuidance]   = useState(null);
  const [progress,   setProgress]   = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [depthMap,   setDepthMap]   = useState(null);

  const depthBuf      = useRef([]); // rolling: { depthMm }
  const bimodalBuf    = useRef([]); // rolling: 0 or 1
  const stableStart   = useRef(null);
  const prevDs        = useRef(null);
  const running       = useRef(false);
  const rafId         = useRef(null);

  // Keep calibration context up-to-date in the RAF loop via refs
  const tireTypeRef         = useRef(tireType);
  const metricsScaleRef     = useRef(metricsScaleFactor);
  useEffect(() => { tireTypeRef.current = tireType; }, [tireType]);
  useEffect(() => { metricsScaleRef.current = metricsScaleFactor; }, [metricsScaleFactor]);

  useEffect(() => {
    if (!isModelLoaded) return;
    running.current = true;

    async function loop() {
      if (!running.current) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const frame = await estimateDepth(video);
        if (frame && running.current) processFrame(frame);
      }

      rafId.current = requestAnimationFrame(loop);
    }

    rafId.current = requestAnimationFrame(loop);
    return () => {
      running.current = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [isModelLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function processFrame({ data, width, height }) {
    // Extract center ROI
    const roiX = Math.floor(width * ROI_X);
    const roiW = Math.floor(width * ROI_W);
    const roi = new Float32Array(roiW * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < roiW; x++)
        roi[y * roiW + x] = data[y * width + roiX + x];

    // Downsample to DS×DS
    const ds = downsample(roi, roiW, height, DS, DS);
    setDepthMap(ds);

    // Bimodal check (indicates groove/surface visible)
    const hist = computeHistogram(ds, 64);
    const peaks = findBimodalPeaks(hist);
    const hasBimodal = peaks !== null;

    // Motion magnitude
    const motion = computeMotionMagnitude(prevDs.current, ds);
    prevDs.current = ds;

    // Surface depth for distance guidance — MiDaS: higher bin = closer = surface at peak2
    const surfaceNorm = hasBimodal ? peaks.peak2 / 63 : null;

    // Determine guidance
    let g = null;
    if (!hasBimodal) {
      g = 'tilt_phone';
    } else if (surfaceNorm < 0.15) {
      g = 'too_far';
    } else if (surfaceNorm > 0.80) {
      g = 'too_close';
    } else if (motion > MOTION_THRESHOLD) {
      g = 'move_slower';
    }

    // Accumulate depth readings only when quality is acceptable
    if (hasBimodal && g !== 'move_slower' && g !== 'too_far' && g !== 'too_close') {
      const result = computeGrooveDepth(ds, {
        treadWidthMm: tireTypeRef.current?.treadWidthMm,
        metricsScaleFactor: metricsScaleRef.current
      });
      if (result) {
        depthBuf.current.push(result.depthMm);
        if (depthBuf.current.length > 90) depthBuf.current.shift();
      }
    }

    bimodalBuf.current.push(hasBimodal ? 1 : 0);
    if (bimodalBuf.current.length > 90) bimodalBuf.current.shift();

    const frames       = depthBuf.current.length;
    const recent       = depthBuf.current.slice(-30);
    const cv           = frames >= 5 ? computeCV(recent) : 1;
    const bimodalFrac  = bimodalBuf.current.slice(-30).reduce((a, b) => a + b, 0) /
                         Math.min(30, bimodalBuf.current.length);

    // Refine guidance at lower priority
    if (g === null) {
      g = cv < TARGET_CV * 1.3 && frames >= MIN_FRAMES * 0.7 ? 'almost_done' : 'keep_going';
    }

    setGuidance(g);
    setProgress(estimateProgress(frames, cv, bimodalFrac, MIN_FRAMES));

    // Completion gate: all 5 conditions
    const stable = frames >= MIN_FRAMES
                && cv < TARGET_CV
                && bimodalFrac >= 0.8
                && g !== 'move_slower'
                && g !== 'too_far'
                && g !== 'too_close';

    if (stable) {
      if (!stableStart.current) stableStart.current = performance.now();
      else if (performance.now() - stableStart.current >= STABLE_MS) {
        const medianDepth = medianOf(depthBuf.current.slice(-30));
        const depth32nds  = Math.max(1, Math.min(20, Math.round(medianDepth / 0.794)));
        const result = {
          depthMm:     parseFloat(medianDepth.toFixed(1)),
          depth32nds,
          rating:      getSafetyLevel(medianDepth)
        };
        setScanResult(result);
        setProgress(1);
        setIsComplete(true);
        running.current = false;
      }
    } else {
      stableStart.current = null;
    }
  }

  return { guidance, progress, isComplete, scanResult, depthMap };
}
