export async function analyzeTireFrame({
  imageBase64,
  imagesBase64,
  systemPrompt,
  userPrompt
}) {
  const images = imagesBase64?.length
    ? imagesBase64
    : (imageBase64 ? [imageBase64] : []);

  const response = await fetch('/api/analyze-frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagesBase64: images, systemPrompt, userPrompt })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Analysis failed (${response.status})`);
  }

  return payload.analysis;
}
