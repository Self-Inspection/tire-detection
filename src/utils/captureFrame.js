/**
 * Capture a JPEG base64 data URL from a live video element.
 * Draws the center ROI bracket region to match on-screen guidance.
 */
export function captureVideoFrame(videoElement, {
  maxWidth = 480,
  roiX = 0.30,
  roiW = 0.40
} = {}) {
  if (!videoElement || videoElement.readyState < 2) return null;

  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;
  if (!vw || !vh) return null;

  const sx = Math.floor(vw * roiX);
  const sw = Math.floor(vw * roiW);
  const scale = Math.min(1, maxWidth / sw);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, sx, 0, sw, vh, 0, 0, dw, dh);

  return canvas.toDataURL('image/jpeg', 0.6);
}
