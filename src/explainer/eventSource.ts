/**
 * eventSource.ts — drives the graph. [OWNER: B / explainer]
 * `mockEventSource` replays a realistic cascade fully offline (mock-first, no key) so the speed
 * visual works everywhere. `liveEventSource` adapts AugurForge''s real OnEvent stream when wired.
 */
import type { AgentId, OnEvent } from './types';

export interface EventSource {
  /** begin emitting; returns a stop() that cancels pending emits. */
  start(onEvent: OnEvent): () => void;
}

interface Beat {
  agent: AgentId;
  text: string;
  result?: unknown;
}

/** Two narrative depths for the mock cascade — mirrors the live runTweak entry/expert split. */
export type MockDepth = 'entry' | 'expert';

function cascade(depth: MockDepth): Beat[] {
  const expert = depth === 'expert';
  return [
    { agent: 'orchestrator', text: 'Routing this to the Monte Carlo (GBM) model.', result: { templateId: 'monte-carlo' } },
    { agent: 'modeler', text: 'Reading the chart — inferring volatility, drift and horizon.', result: { params: { sigma: 18, drift: 7, horizon: 30 } } },
    { agent: 'visualizer', text: 'Designing a 2D fan plus a 3D probability mountain.', result: { templateId: 'monte-carlo' } },
    {
      agent: 'sensitivity',
      text: expert
        ? 'Tail dominated by σ: a 1pt vol rise lifts 95% ES more than a 1pt drift change shifts the median.'
        : 'Volatility dominates the tail; drift only shifts the median.',
      result: { text: 'sensitivity' },
    },
    { agent: 'risk', text: 'Ruin probability sits within the Solvency II buffer.', result: { flags: [{ level: 'ok' }, { level: 'warning' }] } },
    {
      agent: 'explainer',
      text: expert
        ? 'Daily GBM, 10k antithetic paths, Brownian-bridge barrier correction; ruin is the share breaching the floor.'
        : 'Most paths grow, but a few fall through the floor — that is the ruin chance.',
      result: { text: 'explanation' },
    },
  ];
}

/** Cerebras-fast cadence: tiny TTFT, rapid token stream — the whole cascade lands in ~2s. */
export function mockEventSource(opts?: { ttftMs?: number; tokenMs?: number; depth?: MockDepth }): EventSource {
  const ttftMs = opts?.ttftMs ?? 110;
  const tokenMs = opts?.tokenMs ?? 16;
  const beats = cascade(opts?.depth ?? 'entry');
  return {
    start(onEvent) {
      let cancelled = false;
      const timers: number[] = [];
      const at = (ms: number, fn: () => void) => {
        timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms));
      };
      let cursor = 250;
      for (const beat of beats) {
        const startAt = cursor;
        at(startAt, () => onEvent({ agent: beat.agent, status: 'start' }));
        const words = beat.text.match(/\S+\s*/g) ?? [beat.text];
        let wt = startAt + ttftMs;
        for (const w of words) {
          const when = wt;
          at(when, () => onEvent({ agent: beat.agent, status: 'token', delta: w }));
          wt += tokenMs;
        }
        const doneAt = wt + 60;
        at(doneAt, () =>
          onEvent({
            agent: beat.agent,
            status: 'done',
            result: beat.result,
            timeInfo: { ttftMs, tokensPerSec: 1700, totalTokens: words.length, totalMs: doneAt - startAt },
          }),
        );
        cursor = doneAt + 120; // next agent starts shortly after — fast, readable cascade
      }
      return () => {
        cancelled = true;
        timers.forEach((t) => clearTimeout(t));
      };
    },
  };
}

/**
 * Wrap AugurForge''s real pipeline stream. `register` hooks an OnEvent into the live pipeline and
 * returns an unsubscribe — e.g. from App when it calls runPipeline/runTweak.
 */
export function liveEventSource(register: (onEvent: OnEvent) => () => void): EventSource {
  return { start: (onEvent) => register(onEvent) };
}