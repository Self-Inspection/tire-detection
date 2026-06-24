import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '20mb' }));

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

function resolveApiKey() {
  return process.env.OPENAI_API_KEY || null;
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
    model: OPENAI_MODEL
  });
});

app.post('/api/analyze-frame', async (req, res) => {
  const {
    imageBase64,
    imagesBase64,
    systemPrompt,
    userPrompt
  } = req.body ?? {};

  const apiKey = resolveApiKey();

  if (!apiKey) {
    return res.status(401).json({
      error: 'OpenAI API key is not configured on the server.'
    });
  }

  const images = Array.isArray(imagesBase64) && imagesBase64.length
    ? imagesBase64
    : (imageBase64 ? [imageBase64] : []);

  if (images.length === 0 || !systemPrompt) {
    return res.status(400).json({ error: 'imagesBase64 (or imageBase64) and systemPrompt are required.' });
  }

  const imageParts = images.map(img => {
    const imageUrl = img.startsWith('data:')
      ? img
      : `data:image/jpeg;base64,${img}`;
    return { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } };
  });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt || 'Analyze these tire tread photos and return strict JSON.' },
              ...imageParts
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
