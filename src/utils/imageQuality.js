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

/**
 * Mean brightness (0-255) and glare/blown-out-highlight fraction on the scan ROI.
 * Directional/chevron tread relies on shadow contrast to tell grooves from lugs —
 * too dark loses that contrast, and glare (flash reflecting off wet/glossy rubber)
 * washes it out, both of which make grooves easy to miscount.
 */
export const MIN_BRIGHTNESS = 40;
export const MAX_GLARE_FRACTION = 0.12;

export function measureLighting(videoElement, {
  roi = SCAN_ROI,
  sampleWidth = 160
} = {}) {
  if (!videoElement || videoElement.readyState < 2) return { brightness: 0, glareFraction: 1 };

  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;
  if (!vw || !vh) return { brightness: 0, glareFraction: 1 };

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

  const { data } = ctx.getImageData(0, 0, dw, dh);
  let sum = 0;
  let blown = 0;
  const n = dw * dh;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const luma = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    sum += luma;
    if (luma >= 250) blown++;
  }

  return { brightness: sum / n, glareFraction: blown / n };
}

export function isLightingOk(videoElement, {
  minBrightness = MIN_BRIGHTNESS,
  maxGlareFraction = MAX_GLARE_FRACTION
} = {}) {
  const { brightness, glareFraction } = measureLighting(videoElement);
  return brightness >= minBrightness && glareFraction <= maxGlareFraction;
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
