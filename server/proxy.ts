/**
 * proxy.ts — the key-proxy. [OWNER: A]
 *
 * Holds CEREBRAS_API_KEY server-side and forwards /api/chat to Cerebras''s OpenAI-compatible
 * Chat Completions endpoint, passing SSE straight through for streaming. The browser only ever
 * talks to this proxy, so the key never ships in the client bundle. Ignored in mock mode.
 *
 * Run with:  npm run server      (or npm run dev:live to run web + proxy together)
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PROXY_PORT ?? 8787);
const API_KEY = process.env.CEREBRAS_API_KEY;
const BASE_URL = process.env.CEREBRAS_BASE_URL ?? 'https://api.cerebras.ai/v1';
const MODEL = process.env.CEREBRAS_MODEL ?? 'gemma-4-31b';
const BASELINE_API_KEY = process.env.BASELINE_API_KEY;
const BASELINE_BASE_URL = process.env.BASELINE_BASE_URL;
const BASELINE_MODEL = process.env.BASELINE_MODEL;
const MAX_MESSAGES = 12;
const MAX_TEXT_CHARS = 12_000;
const MAX_IMAGE_DATA_URL_CHARS = 9_000_000;
const MAX_TOKENS = 900;

const app = express();
// Restrict CORS to the dev origin so a deployed/forwarded proxy can't have its key quota drained.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
      else cb(new Error('Origin not allowed'), false);
    },
  }),
);
app.use(express.json({ limit: '12mb' })); // images arrive as base64 data URIs

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    hasKey: Boolean(API_KEY),
    baselineConfigured: Boolean(BASELINE_API_KEY && BASELINE_BASE_URL && BASELINE_MODEL),
  });
});

app.post('/api/chat', async (req, res) => {
  const wantsBaseline = req.body?.provider === 'baseline';
  const key = wantsBaseline ? BASELINE_API_KEY : API_KEY;
  const baseUrl = wantsBaseline ? BASELINE_BASE_URL : BASE_URL;
  const model = wantsBaseline ? BASELINE_MODEL : MODEL;

  if (!key || !baseUrl || !model) {
    res.status(503).json({
      error: wantsBaseline
        ? 'Baseline provider is not configured. Set BASELINE_API_KEY, BASELINE_BASE_URL, and BASELINE_MODEL, or use mock fallback.'
        : 'CEREBRAS_API_KEY not set on the proxy. Run in mock mode (VITE_USE_LIVE=false) or add a key to .env.',
    });
    return;
  }

  const upstreamUrl = safeChatCompletionsUrl(baseUrl);
  if (!upstreamUrl) {
    res.status(500).json({ error: 'Configured upstream base URL must be http(s).' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = sanitizeChatBody(req.body, model);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });

    if (body.stream && upstream.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
      res.send(text);
    }
  } catch (err) {
    res.status(502).json({
      error: `Proxy upstream error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

function safeChatCompletionsUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return new URL('chat/completions', url.href.endsWith('/') ? url.href : `${url.href}/`).toString();
  } catch {
    return null;
  }
}

function sanitizeChatBody(raw: unknown, model: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Request body must be a JSON object.');
  }
  const body = raw as Record<string, unknown>;
  return {
    model,
    messages: sanitizeMessages(body.messages),
    stream: body.stream === true,
    ...(body.response_format && typeof body.response_format === 'object' ? { response_format: body.response_format } : {}),
    ...(isReasoningEffort(body.reasoning_effort) ? { reasoning_effort: body.reasoning_effort } : {}),
    ...(typeof body.temperature === 'number' ? { temperature: clamp(body.temperature, 0, 1) } : {}),
    ...(typeof body.max_tokens === 'number' ? { max_tokens: Math.round(clamp(body.max_tokens, 1, MAX_TOKENS)) } : {}),
  };
}

function sanitizeMessages(raw: unknown): unknown[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) {
    throw new Error(`messages must be a non-empty array with at most ${MAX_MESSAGES} entries.`);
  }
  return raw.map((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new Error('Each message must be an object.');
    }
    const m = message as Record<string, unknown>;
    if (!['system', 'user', 'assistant'].includes(String(m.role))) {
      throw new Error('Invalid message role.');
    }
    return { role: m.role, content: sanitizeContent(m.content) };
  });
}

function sanitizeContent(content: unknown): unknown {
  if (typeof content === 'string') return content.slice(0, MAX_TEXT_CHARS);
  if (!Array.isArray(content)) throw new Error('Message content must be text or content parts.');
  return content.map((part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw new Error('Invalid content part.');
    const p = part as Record<string, unknown>;
    if (p.type === 'text') return { type: 'text', text: String(p.text ?? '').slice(0, MAX_TEXT_CHARS) };
    if (p.type === 'image_url' && p.image_url && typeof p.image_url === 'object') {
      const image = p.image_url as Record<string, unknown>;
      const url = String(image.url ?? '');
      if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(url) || url.length > MAX_IMAGE_DATA_URL_CHARS) {
        throw new Error('image_url must be a png/jpeg/webp data URI under the configured size cap.');
      }
      return { type: 'image_url', image_url: { url } };
    }
    throw new Error('Unsupported content part type.');
  });
}

function isReasoningEffort(value: unknown): value is string {
  return value === 'none' || value === 'low' || value === 'medium' || value === 'high';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

app.listen(PORT, () => {
  console.log(
    `[augurforge] key-proxy on http://localhost:${PORT}  (model=${MODEL}, key=${API_KEY ? 'set' : 'MISSING'}, baseline=${
      BASELINE_API_KEY ? 'set' : 'mock'
    })`,
  );
});
