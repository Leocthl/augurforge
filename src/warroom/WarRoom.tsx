/**
 * WarRoom.tsx — the Gemma swarm as a business "situation room". [OWNER: B / warroom]
 * Six stickmen (one per agent) at desks; each has a thought bubble that streams its reasoning live
 * as the AgentEvent cascade arrives. A SECOND view of the same stream the thinking-graph uses, so it
 * reuses the explainer''s event sources + reducer (DRY). Mock-first; real-pipeline toggle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, AgentId, OnEvent } from '../core/contract';
import {
  applyEvent,
  initReasoning,
  mockEventSource,
  realPipelineSource,
  type EventSource,
  type ReasoningState,
} from '../explainer';
import { ROLE_COLOR } from '../explainer/types';
import { Stickman } from './Stickman';

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'orchestrator', label: 'Orchestrator' },
  { id: 'modeler', label: 'Modeler' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'risk', label: 'Risk' },
  { id: 'explainer', label: 'Explainer' },
];

export function WarRoom({ source }: { source?: EventSource }) {
  const [state, setState] = useState<ReasoningState>(() => initReasoning(performance.now()));
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [useReal, setUseReal] = useState(false);
  const stopRef = useRef<null | (() => void)>(null);

  const onEvent: OnEvent = useCallback((e: AgentEvent) => {
    setState((s) => applyEvent(s, e, performance.now()));
    if (e.timeInfo) setLatest({ ttftMs: e.timeInfo.ttftMs, tokensPerSec: e.timeInfo.tokensPerSec });
  }, []);

  const run = useCallback(() => {
    stopRef.current?.();
    setState(initReasoning(performance.now()));
    setLatest({});
    const src = source ?? (useReal ? realPipelineSource('entry') : mockEventSource());
    stopRef.current = src.start(onEvent);
  }, [source, useReal, onEvent]);

  useEffect(() => {
    run();
    return () => stopRef.current?.();
  }, [run]);

  return (
    <div className="warroom-root">
      <div className="warroom-board">
        <span className="warroom-badge">Gemma 4 · Cerebras · Situation Room</span>
        <span className="warroom-stat">TTFT {latest.ttftMs != null ? `${latest.ttftMs} ms` : '—'}</span>
        <span className="warroom-stat">{latest.tokensPerSec != null ? `${Math.round(latest.tokensPerSec)} tok/s` : ''}</span>
        <span className="warroom-spacer" />
        {!source && (
          <button className="warroom-toggle" onClick={() => setUseReal((v) => !v)}>
            {useReal ? 'Real pipeline' : 'Mock cascade'}
          </button>
        )}
        <button className="warroom-replay" onClick={run}>Replay</button>
      </div>

      <div className="warroom-floor">
        {AGENTS.map((a) => {
          const node = state.data.nodes.find((n) => n.id === a.id);
          const caption = state.captions[a.id] ?? '';
          const started = !!node || a.id in state.captions;
          const thinking = node?.pulse === true;
          const status: 'idle' | 'thinking' | 'done' = thinking ? 'thinking' : started ? 'done' : 'idle';
          return (
            <div className={`warroom-agent ${status}`} key={a.id}>
              <div className={`warroom-bubble ${started ? 'show' : ''}`}>
                <span className="warroom-bubble-text">{caption}</span>
                {thinking && <span className="warroom-caret" />}
              </div>
              <Stickman color={ROLE_COLOR[a.id]} state={status} />
              <div className="warroom-desk" />
              <div className="warroom-label" style={{ color: ROLE_COLOR[a.id] }}>{a.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}