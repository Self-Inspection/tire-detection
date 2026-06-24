export async function analyzeTireFrame({
  imageBase64,
  systemPrompt,
  userPrompt
}) {
  const response = await fetch('/api/analyze-frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, systemPrompt, userPrompt })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Analysis failed (${response.status})`);
  }

  return payload.analysis;
}
