export async function analyzeTireFrame({
  imageBase64,
  systemPrompt,
  userPrompt,
  apiKey
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-OpenAI-Key'] = apiKey;

  const response = await fetch('/api/analyze-frame', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      imageBase64,
      systemPrompt,
      userPrompt,
      apiKey: apiKey || undefined
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Analysis failed (${response.status})`);
  }

  return payload.analysis;
}
