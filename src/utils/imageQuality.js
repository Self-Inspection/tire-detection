import { SCAN_ROI } from './scanRoi.js';

/**
 * Laplacian variance blur score on the scan ROI.
 * Higher = sharper. Typical phone tread shots: sharp > 120, blurry < 60.
 */
export const MIN_BLUR_SCORE = 80;

export function measureBlurScore(videoElement, {
  roi = SCAN_ROI,
  sampleWidth = 320
} = {}) {
  if (!videoElement || videoElement.readyState < 2) return 0;

  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;
  if (!vw || !vh) return 0;

  const sx = Math.floor(vw * roi.x);
  const sy = Math.floor(vh * roi.y);
  const sw = Math.floor(vw * roi.w);
  const sh = Math.floor(vh * roi.h);
  const scale = sampleWidth / sw;
  const dw = sampleWidth;
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, dw, dh);

  const { data, width, height } = ctx.getImageData(0, 0, dw, dh);
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = -4 * gray[i]
        + gray[i - 1] + gray[i + 1]
        + gray[i - width] + gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }

  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function isSharpEnough(videoElement, minScore = MIN_BLUR_SCORE) {
  return measureBlurScore(videoElement) >= minScore;
}

/** Score + frame pairs from a burst; returns sharpest frames up to maxCount. */
export function selectSharpBurstFrames(scoredFrames, {
  minScore = MIN_BLUR_SCORE,
  maxCount = 3
} = {}) {
  return scoredFrames
    .filter(f => f.frame && f.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount);
}

export function bestBurstScore(scoredFrames) {
  if (scoredFrames.length === 0) return 0;
  return Math.max(...scoredFrames.map(f => f.score));
}
