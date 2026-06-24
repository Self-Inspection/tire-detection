import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '12mb' }));

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function resolveApiKey(bodyKey, headerKey) {
  return process.env.OPENAI_API_KEY || bodyKey || headerKey || null;
}

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Response was not valid JSON');
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasServerKey: Boolean(process.env.OPENAI_API_KEY),
    model: DEFAULT_MODEL
  });
});

app.post('/api/analyze-frame', async (req, res) => {
  const {
    imageBase64,
    systemPrompt,
    userPrompt,
    model,
    apiKey: bodyApiKey
  } = req.body ?? {};

  const apiKey = resolveApiKey(bodyApiKey, req.headers['x-openai-key']);

  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing OpenAI API key. Set OPENAI_API_KEY on the server or enter a key in the app.'
    });
  }

  if (!imageBase64 || !systemPrompt) {
    return res.status(400).json({ error: 'imageBase64 and systemPrompt are required.' });
  }

  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt || 'Analyze this tire scan frame and return strict JSON.' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
            ]
          }
        ]
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      const message = payload?.error?.message || `OpenAI request failed (${response.status})`;
      return res.status(response.status).json({ error: message });
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'OpenAI returned an empty response.' });
    }

    const analysis = extractJson(content);
    res.json({ analysis, model: payload.model, usage: payload.usage });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to analyze frame.' });
  }
});

if (isProd) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT} (${isProd ? 'production' : 'dev API'})`);
});
