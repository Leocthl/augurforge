/**
 * DepthExplainer.tsx — the mountable feature. [OWNER: B / explainer]
 * Runs an EventSource (mock by default), reduces the stream into a growing graph, and overlays the
 * streamed caption + Cerebras TTFT/tokens-sec HUD. The graph assembles parts-by-parts -> speed felt.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, OnEvent } from './types';
import { applyEvent, initReasoning, type ReasoningState } from './reasoningGraph';
import { mockEventSource, type EventSource } from './eventSource';
import { ThinkingGraph } from './ThinkingGraph';

interface Props {
  /** Defaults to the offline mock cascade. Pass a live source to stream the real pipeline. */
  source?: EventSource;
}

export function DepthExplainer({ source }: Props) {
  const [state, setState] = useState<ReasoningState>(() => initReasoning(performance.now()));
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [started, setStarted] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const onEvent: OnEvent = useCallback((e: AgentEvent) => {
    setState((s) => applyEvent(s, e, performance.now()));
    if (e.timeInfo) setLatest({ ttftMs: e.timeInfo.ttftMs, tokensPerSec: e.timeInfo.tokensPerSec });
  }, []);

  const run = useCallback(() => {
    stopRef.current?.();
    setState(initReasoning(performance.now()));
    setLatest({});
    setStarted(true);
    const src = source ?? mockEventSource();
    stopRef.current = src.start(onEvent);
  }, [source, onEvent]);

  useEffect(() => {
    run();
    return () => stopRef.current?.();
  }, [run]);

  const captionList = Object.values(state.captions);
  const activeCaption = state.active ? state.captions[state.active] : captionList[captionList.length - 1];

  return (
    <div className="explainer-root">
      <div className="explainer-graph" ref={wrapRef}>
        <ThinkingGraph data={state.data} width={size.w} height={size.h} />
      </div>
      <div className="explainer-hud">
        <div className="explainer-hud-row">
          <span className="explainer-badge">Gemma 4 · Cerebras</span>
          <span className="explainer-stat">TTFT {latest.ttftMs != null ? `${latest.ttftMs} ms` : '—'}</span>
          <span className="explainer-stat">{latest.tokensPerSec != null ? `${Math.round(latest.tokensPerSec)} tok/s` : ''}</span>
          <span className="explainer-stat">{state.data.nodes.length} nodes</span>
          <button className="explainer-replay" onClick={run}>{started ? 'Replay' : 'Run'}</button>
        </div>
        <div className="explainer-caption">
          {state.active && <span className="explainer-active">{state.active}</span>}
          <span className="explainer-text">{activeCaption || 'Gemma is thinking…'}</span>
        </div>
      </div>
    </div>
  );
}