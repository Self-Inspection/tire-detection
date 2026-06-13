export function computeHistogram(data, bins = 64) {
  const h = new Uint32Array(bins);
  for (const v of data) {
    const bin = Math.min(bins - 1, Math.floor(Math.max(0, v) * bins));
    h[bin]++;
  }
  return h;
}

// Returns { peak1, peak2 } (bin indices, peak1 < peak2) or null if not clearly bimodal.
export function findBimodalPeaks(histogram) {
  const bins = histogram.length;
  let max1 = 0, p1 = 0;
  for (let i = 0; i < bins; i++) {
    if (histogram[i] > max1) { max1 = histogram[i]; p1 = i; }
  }

  let max2 = 0, p2 = 0;
  const minSep = Math.floor(bins / 8);
  for (let i = 0; i < bins; i++) {
    if (Math.abs(i - p1) < minSep) continue;
    if (histogram[i] > max2) { max2 = histogram[i]; p2 = i; }
  }

  if (max2 < max1 * 0.12) return null;

  return { peak1: Math.min(p1, p2), peak2: Math.max(p1, p2) };
}

export function computeCV(values) {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 1;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// Returns 0..0.99 — never 1.0 (completion is determined by full gate in useScanAnalysis)
export function estimateProgress(frameCount, cv, bimodalFrac, minFrames = 30) {
  const frameFrac    = Math.min(1, frameCount / minFrames);
  const stabilityFrac = Math.max(0, 1 - cv / 0.15);
  return Math.min(0.99, 0.4 * frameFrac + 0.4 * stabilityFrac + 0.2 * bimodalFrac);
}
