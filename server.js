import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '20mb' }));

// Vision provider selection. Both speak the OpenAI Chat Completions format —
// Gemini via Google's OpenAI-compatible endpoint — so the request body is shared.
const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY',
    model: process.env.OPENAI_MODEL || 'gpt-5.1'
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: 'GEMINI_API_KEY',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview'
  }
};

const PROVIDER_NAME = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const PROVIDER = PROVIDERS[PROVIDER_NAME] ?? PROVIDERS.openai;

function resolveApiKey() {
  return process.env[PROVIDER.keyEnv] || null;
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
    provider: PROVIDER_NAME,
    hasServerKey: Boolean(resolveApiKey()),
    model: PROVIDER.model
  });
});

// Independent model runs per capture; client takes per-groove medians.
const MAX_SAMPLES = 3;

app.post('/api/analyze-frame', async (req, res) => {
  const {
    imageBase64,
    imagesBase64,
    systemPrompt,
    userPrompt,
    samples
  } = req.body ?? {};

  const apiKey = resolveApiKey();

  if (!apiKey) {
    return res.status(401).json({
      error: `${PROVIDER.keyEnv} is not configured on the server (provider: ${PROVIDER_NAME}).`
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

  const body = {
    model: PROVIDER.model,
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
  };
  // GPT-5-series reasoning models reject non-default temperature
  if (!/^gpt-5/.test(PROVIDER.model)) {
    body.temperature = 0.2;
  }

  async function runAnalysis() {
    const response = await fetch(PROVIDER.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();

    if (!response.ok) {
      const err = new Error(payload?.error?.message || `${PROVIDER_NAME} request failed (${response.status})`);
      err.status = response.status;
      throw err;
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      const err = new Error(`${PROVIDER_NAME} returned an empty response.`);
      err.status = 502;
      throw err;
    }

    return { analysis: extractJson(content), model: payload.model, usage: payload.usage };
  }

  const sampleCount = Math.min(MAX_SAMPLES, Math.max(1, parseInt(samples, 10) || 1));
  const startedAt = Date.now();
  console.log(`[analyze] start: ${images.length} images, ${sampleCount} samples, model=${PROVIDER.model}`);

  try {
    const settled = await Promise.allSettled(
      Array.from({ length: sampleCount }, () => runAnalysis())
    );
    const ok = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = settled.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.error(`[analyze] ${failed.length}/${sampleCount} runs failed: ${failed[0].reason?.message}`);
    }

    if (ok.length === 0) {
      const first = settled[0].reason ?? {};
      console.error(`[analyze] all runs failed after ${Date.now() - startedAt}ms`);
      return res.status(first.status ?? 500).json({ error: first.message || 'Failed to analyze frame.' });
    }

    console.log(`[analyze] done in ${Date.now() - startedAt}ms, ok=${ok.length}/${sampleCount}`);

    const usage = ok.reduce((sum, r) => {
      for (const [k, v] of Object.entries(r.usage ?? {})) {
        if (typeof v === 'number') sum[k] = (sum[k] ?? 0) + v;
      }
      return sum;
    }, {});

    res.json({
      analysis: ok[0].analysis, // back-compat with single-sample clients
      analyses: ok.map(r => r.analysis),
      samplesRequested: sampleCount,
      samplesCompleted: ok.length,
      model: ok[0].model,
      usage
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to analyze frame.' });
  }
});

if (isProd) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  // Hashed assets that don't exist must 404 — serving index.html here makes
  // stale clients execute HTML as JS ("'text/html' is not a valid MIME type").
  app.get('/assets/*', (_req, res) => {
    res.status(404).end();
  });
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT} (${isProd ? 'production' : 'dev API'})`);
});
