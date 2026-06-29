/**
 * ReasoningPanel.tsx — embedded reasoning surface for the workbench right rail. [OWNER: B / explainer]
 * Composes a compact mini ThinkingGraph (variant="embed") with the CascadeTranscript, driven by a
 * ReasoningState the App folds from its existing AgentEvent stream (no extra Cerebras calls).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimeInfo } from '../core/contract';
import type { AgentId } from './types';
import { agentForNode, type ReasoningState } from './reasoningGraph';
import { ThinkingGraph } from './ThinkingGraph';
import { CascadeTranscript } from './CascadeTranscript';
import './explainer.css';

interface Props {
  state: ReasoningState;
  building: boolean;
  latest?: TimeInfo;
}

export function ReasoningPanel({ state, building, latest }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 210 });
  const [focused, setFocused] = useState<AgentId | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const onNodeClick = useCallback((id: string) => setFocused(agentForNode(id)), []);

  return (
    <div className="panel reasoning-panel">
      <div className="panel-head">
        <span className="panel-title">Gemma agent cascade</span>
        {building && <span className="panel-time">streaming</span>}
      </div>
      <div className="reasoning-stage" ref={wrapRef}>
        <ThinkingGraph data={state.data} width={size.w} height={size.h} variant="embed" onNodeClick={onNodeClick} />
      </div>
      <CascadeTranscript
        beats={state.beats}
        activeAgent={state.active}
        focusedAgent={focused}
        variant="embed"
        onSelect={setFocused}
      />
      {latest && (latest.ttftMs != null || latest.tokensPerSec != null) && (
        <div className="reasoning-meta">
          <span>TTFT {latest.ttftMs != null ? `${latest.ttftMs} ms` : '—'}</span>
          <span>{latest.tokensPerSec != null ? `${Math.round(latest.tokensPerSec)} tok/s` : ''}</span>
          <span>{state.data.nodes.length} nodes</span>
        </div>
      )}
    </div>
  );
}
