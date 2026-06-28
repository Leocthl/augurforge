/**
 * cerebras.ts — the one shared client every agent calls.  [OWNER: A]
 *
 * - In LIVE mode (VITE_USE_LIVE=true) it POSTs to the key-proxy at /api/chat
 *   (never the Cerebras endpoint directly), parses streamed SSE, and surfaces
 *   `time_info` (TTFT, tokens/sec) into a TimeInfo.
 * - In MOCK mode (default) it returns canned results with a *realistic* token
 *   cadence, so the whole streaming cascade + speed race run offline with no key.
 *
 * The model is pinned to gemma-4-31b. Images use the OpenAI multimodal format.
 * A tiny rate guard spaces live calls to stay under the ~100 RPM hackathon tier.
 */
import type { TimeInfo } from './contract';

export const DEFAULT_MODEL = 'gemma-4-31b';
export const USE_LIVE = import.meta.env.VITE_USE_LIVE === 'true';

// ---------------------------------------------------------------------------
// OpenAI-compatible message shapes (supports image_url parts for the Modeler)
// ---------------------------------------------------------------------------

export type ChatRole = 'system' | 'user' | 'assistant';
export interface TextPart { type: 'text'; text: string; }
export interface ImagePart { type: 'image_url'; image_url: { url: string }; }
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[];
}

/** Which model serves a call — used by the speed race (baseline is a slow GPU stand-in). */
export type Provider = 'cerebras' | 'baseline';

export interface ChatOpts {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  /** Strict JSON schema for structured agents (orchestrator/modeler/visualizer/risk). */
  responseFormat?: object;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  temperature?: number;
  maxTokens?: number;
  provider?: Provider;
  /** MOCK mode only: the canned reply this call should resolve to. */
  mock?: { text: string; json?: unknown };
}

export interface ChatResult {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;
  timeInfo: TimeInfo;
}

export type OnToken = (t: string) => void;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Rate guard — sequential, min-spaced. Applied to LIVE calls only (mock is free).
// ~1.5 req/s keeps us safely under the ~1.6 req/s (100 RPM) cap.
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 650;
let lastDispatch = 0;
let chain: Promise<unknown> = Promise.resolve();

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, lastDispatch + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await delay(wait);
    lastDispatch = Date.now();
    return fn();
  };
  const result = chain.then(run, run);
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function chat(opts: ChatOpts, onToken?: OnToken): Promise<ChatResult> {
  if (!USE_LIVE) return mockChat(opts, onToken);
  return schedule(() => liveChat(opts, onToken));
}

// ---------------------------------------------------------------------------
// MOCK implementation — realistic streaming cadence per provider
// ---------------------------------------------------------------------------

function mockProfile(provider: Provider): { ttftMs: number; tokensPerSec: number } {
  // Cerebras is the hero: tiny TTFT, very high throughput. Baseline = laggy GPU.
  return provider === 'baseline'
    ? { ttftMs: 850, tokensPerSec: 28 }
    : { ttftMs: 110, tokensPerSec: 1700 };
}

async function mockChat(opts: ChatOpts, onToken?: OnToken): Promise<ChatResult> {
  const provider = opts.provider ?? 'cerebras';
  const { ttftMs, tokensPerSec } = mockProfile(provider);
  const text = opts.mock?.text ?? '';
  const start = Date.now();

  await delay(ttftMs);

  if (opts.stream && onToken && text) {
    const chunks = chunkForStream(text);
    const perChunkMs = Math.max(4, Math.round((1000 / tokensPerSec) * 2.2));
    for (const c of chunks) {
      onToken(c);
      await delay(perChunkMs);
    }
  } else if (text) {
    // Non-streamed: still pace the body so the HUD timing is believable.
    await delay(Math.round((text.length / 4 / tokensPerSec) * 1000));
  }

  const totalMs = Date.now() - start;
  const totalTokens = Math.max(1, Math.round(text.length / 4));
  return {
    text,
    json: opts.mock?.json,
    timeInfo: { ttftMs, tokensPerSec, totalTokens, totalMs },
  };
}

/** Split into word-ish chunks so streamed prose looks natural. */
function chunkForStream(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

// ---------------------------------------------------------------------------
// LIVE implementation — proxy + SSE passthrough. Untested until a key exists.
// TODO(branch: feat/agents): exercise against the real Cerebras tier, confirm
// the exact `time_info` field names on the streamed chunks.
// ---------------------------------------------------------------------------

async function liveChat(opts: ChatOpts, onToken?: OnToken): Promise<ChatResult> {
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages: opts.messages,
    stream: opts.stream ?? false,
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.provider ? { provider: opts.provider } : {}),
  };

  const start = Date.now();
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Cerebras proxy error ${res.status}: ${detail}`);
  }

  if (body.stream && res.body) {
    return parseSseStream(res.body, start, onToken);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return {
    text,
    json: tryParseJson(text),
    timeInfo: readTimeInfo(data, start),
  };
}

async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  start: number,
  onToken?: OnToken,
): Promise<ChatResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let ttftMs: number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastChunk: any = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          lastChunk = chunk;
          const delta: string = chunk?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            if (ttftMs === undefined) ttftMs = Date.now() - start;
            text += delta;
            onToken?.(delta);
          }
        } catch {
          // Partial JSON across chunk boundaries — ignore; it re-buffers.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const timeInfo = readTimeInfo(lastChunk, start);
  if (timeInfo.ttftMs === undefined) timeInfo.ttftMs = ttftMs;
  return { text, json: tryParseJson(text), timeInfo };
}

/** Cerebras returns `time_info` on the response/usage. Tolerate a few field spellings. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readTimeInfo(data: any, start: number): TimeInfo {
  const ti = data?.time_info ?? data?.timeInfo ?? {};
  const usage = data?.usage ?? {};
  const totalMs = Date.now() - start;
  const totalTokens: number | undefined =
    usage.completion_tokens ?? usage.total_tokens ?? ti.total_tokens;
  const queueAndInference = (ti.queue_time ?? 0) + (ti.inference_time ?? 0);
  const tokensPerSec: number | undefined =
    ti.tokens_per_second ??
    (totalTokens && queueAndInference ? totalTokens / queueAndInference : undefined);
  return {
    ttftMs: ti.prompt_time !== undefined ? Math.round(ti.prompt_time * 1000) : undefined,
    tokensPerSec: tokensPerSec ? Math.round(tokensPerSec) : undefined,
    totalTokens,
    totalMs,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}