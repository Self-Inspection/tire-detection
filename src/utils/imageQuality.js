/**
 * Laplacian variance blur score on the tread ROI.
 * Higher = sharper. Typical phone tread shots: sharp > 120, blurry < 60.
 */
export const MIN_BLUR_SCORE = 80;

export function measureBlurScore(videoElement, {
  roiX = 0.30,
  roiW = 0.40,
  sampleWidth = 320
} = {}) {
  if (!videoElement || videoElement.readyState < 2) return 0;

  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;
  if (!vw || !vh) return 0;

  const sx = Math.floor(vw * roiX);
  const sw = Math.floor(vw * roiW);
  const scale = sampleWidth / sw;
  const dw = sampleWidth;
  const dh = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoElement, sx, 0, sw, vh, 0, 0, dw, dh);

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
