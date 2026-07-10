/** Independent model runs per capture — aggregated client-side (median per groove). */
export const ANALYSIS_SAMPLES = 3;

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

  const response = await fetch('/api/analyze-frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagesBase64: images, systemPrompt, userPrompt, samples })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Analysis failed (${response.status})`);
  }

  return payload.analyses ?? [payload.analysis];
}
