import { computeHistogram, findBimodalPeaks } from './scanQuality.js';

// 1/32 inch in mm
export const MM_PER_32ND = 0.794;
// Industry tread depth chart range: 2/32" (legal limit) to 10/32" (new/good)
export const MIN_TREAD_32NDS = 2;
export const MAX_TREAD_32NDS = 10;

export const TIRE_TYPES = [
  { id: 'car', label: 'Car', icon: '🚗', treadWidthMm: 190 }
];

export const DEFAULT_TIRE_TYPE = TIRE_TYPES[0];
export const MAX_GROOVES = 4;

// Rating bands match standard tread depth chart (32nds):
// 8–10/32" = GOOD, 4–7/32" = OKAY, 3/32" = BAD, 2/32" = legal limit
export function clamp32nds(value) {
  return Math.max(MIN_TREAD_32NDS, Math.min(MAX_TREAD_32NDS, Math.round(value)));
}

export function mmTo32nds(depthMm) {
  const raw = Math.round(depthMm / MM_PER_32ND);
  return Math.max(MIN_TREAD_32NDS, Math.min(MAX_TREAD_32NDS, raw));
}

export function getSafetyLevelFrom32nds(depth32nds) {
  if (depth32nds >= 8) return 'good';
  if (depth32nds >= 4) return 'fair';
  if (depth32nds >= 3) return 'poor';
  return 'danger';
}

export function getSafetyLevel(depthMm) {
  return getSafetyLevelFrom32nds(mmTo32nds(depthMm));
}

export function clampDepthMm(depthMm) {
  const minMm = MIN_TREAD_32NDS * MM_PER_32ND;
  const maxMm = MAX_TREAD_32NDS * MM_PER_32ND;
  return Math.max(minMm, Math.min(maxMm, depthMm));
}

export function formatDepthResult(depthMm) {
  const clampedMm = clampDepthMm(depthMm);
  const depth32nds = mmTo32nds(clampedMm);
  return {
    depthMm: parseFloat(clampedMm.toFixed(1)),
    depth32nds,
    rating: getSafetyLevelFrom32nds(depth32nds)
  };
}

// Legacy mm thresholds (kept for reference)
export const SAFETY_THRESHOLDS = { good: 6.35, fair: 3.18, poor: 2.38 };

// Estimated focal length for a typical phone rear camera (~4mm lens, ~6mm sensor, 1280px wide).
// Used only as a fallback — WebXR supplies the device's true focal length when available.
const DEFAULT_FOCAL_PX = 853;
// Fraction of frame width the guided bracket covers at calibration distance
const BRACKET_FRACTION = 0.60;
// Empirical scale factor tuning constant.
// Calibrate against a known tire (e.g., new tire = 8mm) and adjust until readings match.
const DEPTH_SCALE_TUNE = 0.5;

// Reference capture width the focal length is expressed in (matches useWebXR.js).
const REF_FRAME_WIDTH = 1280;

// mm of real depth per unit of normalized depth delta, via tread-width calibration.
// Prefers the device's true focal length (from WebXR) over the generic estimate.
function focalScaleMmPerUnit(treadWidthMm, focalLengthPx) {
  const refWidthMm   = treadWidthMm ?? 190;
  const treadWidthPx = REF_FRAME_WIDTH * BRACKET_FRACTION;
  const f            = (focalLengthPx && focalLengthPx > 0) ? focalLengthPx : DEFAULT_FOCAL_PX;
  // Z at calibration point (mm): Z = f * W_mm / W_px
  const Z_surface_mm = f * (refWidthMm / treadWidthPx);
  return Z_surface_mm * DEPTH_SCALE_TUNE;
}

/**
 * Converts a 32x32 downsampled depth ROI (Float32Array, values 0–1) into a groove depth.
 *
 * ARPortraitDepth outputs normalized depth: higher value = farther from camera.
 * Tire surface (rubber peaks) is closer → lower values.
 * Groove bottoms are farther → higher values.
 *
 * @param {Float32Array} depthRoi - 32x32 depth values
 * @param {{ treadWidthMm: number, metricsScaleFactor: number|null, focalLengthPx: number|null }} config
 * @returns {{ depthMm: number, depth32nds: number } | null}
 */
export function computeGrooveDepth(depthRoi, { treadWidthMm, metricsScaleFactor, focalLengthPx } = {}) {
  let min = Infinity, max = -Infinity;
  for (const v of depthRoi) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range < 0.05) return null;

  // Normalize to [0,1] within this ROI for histogram analysis
  const normalized = new Float32Array(depthRoi.length);
  for (let i = 0; i < depthRoi.length; i++) {
    normalized[i] = (depthRoi[i] - min) / range;
  }

  const histogram = computeHistogram(normalized, 64);
  const peaks = findBimodalPeaks(histogram);
  if (!peaks) return null;

  // peak1 (lower bin) = nearer = tire surface
  // peak2 (higher bin) = farther = groove bottom
  const d_surface = min + (peaks.peak1 / 64) * range;
  const d_groove  = min + (peaks.peak2 / 64) * range;
  const depthDelta = d_groove - d_surface; // positive

  let depthMm;

  if (metricsScaleFactor != null && metricsScaleFactor > 0) {
    // WebXR provides a reference metric depth in meters at the surface
    // Use it to scale the normalized depth delta
    depthMm = depthDelta * metricsScaleFactor * 1000 * DEPTH_SCALE_TUNE;
  } else {
    // Tread-width calibration, using the device's true focal length when WebXR provides it
    depthMm = depthDelta * focalScaleMmPerUnit(treadWidthMm, focalLengthPx);
  }

  depthMm = clampDepthMm(depthMm);

  return formatDepthResult(depthMm);
}

/**
 * Fallback when bimodal peaks aren't detectable.
 * Uses the P10–P90 depth range within the ROI as a proxy for groove depth.
 * Less accurate than bimodal analysis but always produces a value.
 */
export function computeFallbackGrooveDepth(depthRoi, { treadWidthMm, metricsScaleFactor, focalLengthPx } = {}) {
  const sorted = Float32Array.from(depthRoi).sort();
  const n = sorted.length;
  const p10 = sorted[Math.floor(n * 0.10)];
  const p90 = sorted[Math.floor(n * 0.90)];
  const depthDelta = p90 - p10;

  if (depthDelta < 0.015) return null; // ROI is flat — likely not on a tire

  let depthMm;
  if (metricsScaleFactor != null && metricsScaleFactor > 0) {
    depthMm = depthDelta * metricsScaleFactor * 1000 * DEPTH_SCALE_TUNE;
  } else {
    depthMm = depthDelta * focalScaleMmPerUnit(treadWidthMm, focalLengthPx);
  }

  depthMm = clampDepthMm(depthMm);
  return formatDepthResult(depthMm);
}
