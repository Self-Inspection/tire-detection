import { SCAN_ROI } from './scanRoi.js';

/**
 * Capture a JPEG base64 data URL from the scan ROI on a live video frame.
 */
export function captureVideoFrame(videoElement, {
  maxWidth = 1280,
  quality = 0.85,
  roi = SCAN_ROI
} = {}) {
  if (!videoElement || videoElement.readyState < 2) return null;

  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;
  if (!vw || !vh) return null;

  const sx = Math.floor(vw * roi.x);
  const sy = Math.floor(vh * roi.y);
  const sw = Math.floor(vw * roi.w);
  const sh = Math.floor(vh * roi.h);
  const scale = Math.min(1, maxWidth / sw);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, dw, dh);

  return canvas.toDataURL('image/jpeg', quality);
}

export const BURST_COUNT = 3;
export const BURST_INTERVAL_MS = 200;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Grab several frames in quick succession. Caller scores sharpness per frame.
 */
export async function captureBurstFrames(videoElement, {
  count = BURST_COUNT,
  intervalMs = BURST_INTERVAL_MS,
  ...captureOpts
} = {}) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    const frame = captureVideoFrame(videoElement, captureOpts);
    if (frame) frames.push(frame);
    if (i < count - 1) await delay(intervalMs);
  }
  return frames;
}
