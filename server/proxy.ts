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

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' })); // images arrive as base64 data URIs

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(API_KEY) });
});

app.post('/api/chat', async (req, res) => {
  if (!API_KEY) {
    res.status(503).json({
      error:
        'CEREBRAS_API_KEY not set on the proxy. Run in mock mode (VITE_USE_LIVE=false) or add a key to .env.',
    });
    return;
  }

  // Strip our client-only markers; pin the model to gemma-4-31b unless overridden.
  const body = { ...req.body, model: req.body?.model ?? MODEL };
  delete body.provider;
  delete body.mock;

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
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

app.listen(PORT, () => {
  console.log(
    `[augurforge] key-proxy on http://localhost:${PORT}  (model=${MODEL}, key=${API_KEY ? 'set' : 'MISSING'})`,
  );
});