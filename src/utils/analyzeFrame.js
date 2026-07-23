/** Independent model runs per capture — aggregated client-side (median per groove). */
export const ANALYSIS_SAMPLES = 3;

/** Hard client-side cap — reasoning models on multi-image input can take minutes. */
export const ANALYSIS_TIMEOUT_MS = 180_000;

/**
 * Analyze tread photos server-side. Returns an ARRAY of raw analyses,
 * one per completed model run (the server fans out `samples` parallel runs).
 */
export async function analyzeTireFrame({
  imageBase64,
  imagesBase64,
  systemPrompt,
  userPrompt,
  samples = ANALYSIS_SAMPLES
}) {
  const images = imagesBase64?.length
    ? imagesBase64
    : (imageBase64 ? [imageBase64] : []);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  let response;
  try {
    response = await fetch('/api/analyze-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagesBase64: images, systemPrompt, userPrompt, samples }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Analysis timed out after 3 minutes — record again');
    }
    throw new Error('Could not reach the analysis server — check your connection and record again');
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Analysis failed (${response.status})`);
  }

  return payload.analyses ?? [payload.analysis];
}
