import { computeHistogram, findBimodalPeaks } from './scanQuality.js';

export const TIRE_TYPES = [
  { id: 'car',        label: 'Car',          icon: '🚗', treadWidthMm: 190 },
  { id: 'truck',      label: 'Truck / SUV',  icon: '🚙', treadWidthMm: 230 },
  { id: 'motorcycle', label: 'Motorcycle',   icon: '🏍️', treadWidthMm: 130 }
];

// Safety thresholds in mm (converted from 32nds: 6/32=4.76, 4/32=3.18, 2/32=1.59)
export const SAFETY_THRESHOLDS = { good: 4.76, fair: 3.18, poor: 1.59 };

export function getSafetyLevel(depthMm) {
  if (depthMm >= SAFETY_THRESHOLDS.good) return 'good';
  if (depthMm >= SAFETY_THRESHOLDS.fair) return 'fair';
  if (depthMm >= SAFETY_THRESHOLDS.poor) return 'poor';
  return 'danger';
}

// Estimated focal length for a typical phone rear camera (~4mm lens, ~6mm sensor, 1280px wide)
const DEFAULT_FOCAL_PX = 853;
// Fraction of frame width the guided bracket covers at calibration distance
const BRACKET_FRACTION = 0.60;
// Empirical scale factor tuning constant.
// Calibrate against a known tire (e.g., new tire = 8mm) and adjust until readings match.
const DEPTH_SCALE_TUNE = 0.5;

/**
 * Converts a 32x32 downsampled depth ROI (Float32Array, values 0–1) into a groove depth.
 *
 * ARPortraitDepth outputs normalized depth: higher value = farther from camera.
 * Tire surface (rubber peaks) is closer → lower values.
 * Groove bottoms are farther → higher values.
 *
 * @param {Float32Array} depthRoi - 32x32 depth values
 * @param {{ treadWidthMm: number, metricsScaleFactor: number|null }} config
 * @returns {{ depthMm: number, depth32nds: number } | null}
 */
export function computeGrooveDepth(depthRoi, { treadWidthMm, metricsScaleFactor } = {}) {
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
    // Estimate scale from tread width calibration
    const refWidthMm = treadWidthMm ?? 190;
    const frameWidthPx = 1280; // assume ideal capture width
    const treadWidthPx = frameWidthPx * BRACKET_FRACTION;
    // Z at calibration point (meters): Z = f * W_mm / W_px
    const Z_surface_mm = DEFAULT_FOCAL_PX * (refWidthMm / treadWidthPx);
    // Scale: mm of depth per normalized delta unit
    const scaleMmPerUnit = Z_surface_mm * DEPTH_SCALE_TUNE;
    depthMm = depthDelta * scaleMmPerUnit;
  }

  depthMm = Math.max(0.5, Math.min(20, depthMm));

  return {
    depthMm,
    depth32nds: Math.max(1, Math.round(depthMm / 0.794)) // 1/32" = 0.794mm
  };
}
