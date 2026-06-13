import { useState, useRef, useEffect } from 'react';
import { computeGrooveDepth, computeFallbackGrooveDepth, getSafetyLevel } from '../utils/depthToTread.js';
import { computeMotionMagnitude } from '../utils/opticalFlow.js';
import { computeHistogram, findBimodalPeaks, computeCV } from '../utils/scanQuality.js';

const DS = 32;
const ROI_X = 0.30;
const ROI_W = 0.40;
const MIN_FRAMES       = 40;   // total frames before completion is possible
const TARGET_CV        = 0.25; // relaxed — noisy depth maps are expected
const STABLE_MS        = 1500;
const MOTION_THRESHOLD = 0.08;

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

export default function useScanAnalysis({ videoRef, estimateDepth, isModelLoaded, tireType, metricsScaleFactor, focalLengthPx }) {
  const [guidance,   setGuidance]   = useState(null);
  const [progress,   setProgress]   = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [depthMap,   setDepthMap]   = useState(null);

  const depthBuf      = useRef([]); // rolling depth readings (mm)
  const totalFrames   = useRef(0);  // every frame received from model
  const stableStart   = useRef(null);
  const prevDs        = useRef(null);
  const running       = useRef(false);
  const rafId         = useRef(null);

  const tireTypeRef     = useRef(tireType);
  const metricsScaleRef = useRef(metricsScaleFactor);
  const focalLengthRef  = useRef(focalLengthPx);
  useEffect(() => { tireTypeRef.current = tireType; }, [tireType]);
  useEffect(() => { metricsScaleRef.current = metricsScaleFactor; }, [metricsScaleFactor]);
  useEffect(() => { focalLengthRef.current = focalLengthPx; }, [focalLengthPx]);

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
    totalFrames.current++;

    // Extract center-40% ROI
    const roiX = Math.floor(width * ROI_X);
    const roiW = Math.floor(width * ROI_W);
    const roi = new Float32Array(roiW * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < roiW; x++)
        roi[y * roiW + x] = data[y * width + roiX + x];

    const ds = downsample(roi, roiW, height, DS, DS);
    setDepthMap(ds);

    const hist = computeHistogram(ds, 64);
    const peaks = findBimodalPeaks(hist);
    const hasBimodal = peaks !== null;

    const motion = computeMotionMagnitude(prevDs.current, ds);
    prevDs.current = ds;

    // Distance guidance: use overall depth mean as proxy when no bimodal
    const depthMean = ds.reduce((a, b) => a + b, 0) / ds.length;
    let g = null;
    if (depthMean < 0.10) {
      g = 'too_far';
    } else if (depthMean > 0.90) {
      g = 'too_close';
    } else if (motion > MOTION_THRESHOLD) {
      g = 'move_slower';
    }

    // Accumulate depth readings — try bimodal first, then fallback
    if (g !== 'too_far' && g !== 'too_close') {
      const config = {
        treadWidthMm: tireTypeRef.current?.treadWidthMm,
        metricsScaleFactor: metricsScaleRef.current,
        focalLengthPx: focalLengthRef.current
      };
      const result = (hasBimodal && computeGrooveDepth(ds, config))
                  ?? computeFallbackGrooveDepth(ds, config);
      if (result) {
        depthBuf.current.push(result.depthMm);
        if (depthBuf.current.length > 90) depthBuf.current.shift();
      }
    }

    const tf = totalFrames.current;
    const frames = depthBuf.current.length;
    const recent = depthBuf.current.slice(-20);
    const cv     = frames >= 5 ? computeCV(recent) : 1;

    // Progress: 70% from total frame count, 30% from depth stability
    const frameFrac     = Math.min(1, tf / MIN_FRAMES);
    const stabilityFrac = frames >= 10 ? Math.max(0, 1 - cv / TARGET_CV) : 0;
    const newProgress   = Math.min(0.99, 0.7 * frameFrac + 0.3 * stabilityFrac);

    // Guidance label
    if (g === null) {
      g = frameFrac > 0.75 ? 'almost_done' : 'keep_going';
    }
    setGuidance(g);
    setProgress(newProgress);

    // Completion: enough total frames + depth buffer is stable
    // Also force-complete after 3× MIN_FRAMES regardless (graceful timeout)
    const stableEnough = tf >= MIN_FRAMES && frames >= 15 && cv < TARGET_CV;
    const forceDone    = tf >= MIN_FRAMES * 3 && frames >= 10;

    if (stableEnough || forceDone) {
      if (!stableStart.current) stableStart.current = performance.now();
      else if (performance.now() - stableStart.current >= STABLE_MS) {
        const medianDepth = medianOf(depthBuf.current.slice(-20));
        const depth32nds  = Math.max(1, Math.min(20, Math.round(medianDepth / 0.794)));
        setScanResult({
          depthMm:    parseFloat(medianDepth.toFixed(1)),
          depth32nds,
          rating:     getSafetyLevel(medianDepth)
        });
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
