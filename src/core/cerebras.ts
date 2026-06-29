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

/**
 * Which backend serves a call — used by the speed race. 'baseline' is the comparator,
 * configured (via the proxy's BASELINE_* env) to run the SAME Gemma 4 on OpenRouter, so
 * the race isolates inference hardware: Cerebras vs commodity GPUs.
 */
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
  signal?: AbortSignal;
  /** Explicit opt-in for the speed baseline when a live baseline provider is not configured. */
  fallbackToMock?: boolean;
  /** MOCK mode only: the canned reply this call should resolve to. */
  mock?: { text: string; json?: unknown };
}

export interface ChatResult {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: any;
  timeInfo: TimeInfo;
  /** True when these numbers came from mock timing (offline, or a live call that fell back). */
  simulated?: boolean;
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
  try {
    return await schedule(() => liveChat(opts, onToken));
  } catch (err) {
    if (opts.fallbackToMock && !opts.signal?.aborted) return mockChat(opts, onToken);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// MOCK implementation — realistic streaming cadence per provider
// ---------------------------------------------------------------------------

function mockProfile(provider: Provider): { ttftMs: number; tokensPerSec: number } {
  // Cerebras is the hero: tiny TTFT, wafer-scale throughput. The baseline mirrors a
  // representative OpenRouter Gemma 4 deployment on commodity GPUs (not a strawman) —
  // so the offline rehearsal previews a credible, honest live margin.
  return provider === 'baseline'
    ? { ttftMs: 480, tokensPerSec: 65 }
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
    simulated: true,
  };
}

/** Split into word-ish chunks so streamed prose looks natural. */
function chunkForStream(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

// ---------------------------------------------------------------------------
// LIVE implementation — proxy + SSE passthrough. Untested until a key exists.
// TODO(branch: feat/agents): exercise against the real Cerebras tier, confirm the exact
// `time_info` field names, and thread an AbortSignal so a superseded cascade cancels its
// in-flight fetch (saves RPM under the 100 req/min cap).
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
    signal: opts.signal,
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
    json: parseJsonLoose(text),
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
  // Comparators without Cerebras-style `time_info` (e.g. OpenRouter) leave tokens/sec blank.
  // Derive a real, client-measured rate from the streamed body over the generation window
  // so the head-to-head HUD reports all three axes (TTFT · tokens/s · total) for both sides.
  if (timeInfo.totalTokens === undefined && text) {
    timeInfo.totalTokens = Math.max(1, Math.round(text.length / 4));
  }
  if (timeInfo.tokensPerSec === undefined && timeInfo.totalTokens) {
    const genMs = Math.max(1, (timeInfo.totalMs ?? Date.now() - start) - (timeInfo.ttftMs ?? 0));
    timeInfo.tokensPerSec = Math.round((timeInfo.totalTokens / genMs) * 1000);
  }
  return { text, json: parseJsonLoose(text), timeInfo };
}

/** Cerebras returns `time_info` on the response/usage. Tolerate a few field spellings. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readTimeInfo(data: any, start: number): TimeInfo {
  const ti = data?.time_info ?? data?.timeInfo ?? {};
  const usage = data?.usage ?? {};
  const totalMs = Date.now() - start;
  const totalTokens: number | undefined =
    usage.completion_tokens ?? usage.total_tokens ?? ti.total_tokens ?? ti.totalTokens;
  const seconds =
    ti.generation_time ??
    ti.completion_time ??
    ti.inference_time ??
    (typeof ti.total_time === 'number' ? ti.total_time : undefined);
  const queueAndInference = (ti.queue_time ?? 0) + (ti.inference_time ?? 0);
  const tokensPerSec: number | undefined =
    ti.tokens_per_second ??
    ti.tokensPerSecond ??
    ti.output_tokens_per_second ??
    (totalTokens && seconds ? totalTokens / seconds : undefined) ??
    (totalTokens && queueAndInference ? totalTokens / queueAndInference : undefined);
  const ttftSeconds =
    ti.time_to_first_token ??
    ti.ttft ??
    ti.ttft_s ??
    ti.prompt_time;
  return {
    ttftMs: ttftSeconds !== undefined ? Math.round(ttftSeconds * 1000) : undefined,
    tokensPerSec: tokensPerSec ? Math.round(tokensPerSec) : undefined,
    totalTokens,
    totalMs,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonLoose(text: string): any {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = [trimmed, unfenced, extractJsonObject(unfenced)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return undefined;
  return text.slice(start, end + 1);
}
