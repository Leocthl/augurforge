/**
 * CascadeTranscript.tsx — the ordered, accumulating reasoning transcript. [OWNER: B / explainer]
 * Renders one row per agent beat in cascade order. The active beat shows a streaming caret; prior
 * beats persist. Clicking a row (or a graph node, via `focusedAgent`) highlights that beat.
 */
import { useEffect, useRef } from 'react';
import type { AgentId, GraphVariant, ReasoningBeat } from './types';
import { ROLE_COLOR, EMBED_ROLE_COLOR } from './types';
import { AGENT_LABEL } from './reasoningGraph';

interface Props {
  beats: ReasoningBeat[];
  activeAgent: AgentId | null;
  focusedAgent?: AgentId | null;
  variant: GraphVariant;
  onSelect?: (agent: AgentId) => void;
}

export function CascadeTranscript({ beats, activeAgent, focusedAgent, variant, onSelect }: Props) {
  const palette = variant === 'embed' ? EMBED_ROLE_COLOR : ROLE_COLOR;
  const focusedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    focusedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedAgent]);

  if (beats.length === 0) {
    return <div className={`cascade-transcript ${variant} is-empty`}>Gemma is thinking…</div>;
  }

  return (
    <ul className={`cascade-transcript ${variant}`} aria-label="Gemma reasoning transcript">
      {beats.map((b) => {
        const isActive = b.agent === activeAgent && b.status === 'streaming';
        const isFocused = b.agent === focusedAgent;
        return (
          <li
            key={b.agent}
            ref={isFocused ? focusedRef : undefined}
            className={`cascade-beat${isActive ? ' is-active' : ''}${isFocused ? ' is-focused' : ''}${b.status === 'error' ? ' is-error' : ''}`}
            onClick={() => onSelect?.(b.agent)}
          >
            <span className="cascade-dot" style={{ background: palette[b.agent] }} aria-hidden="true" />
            <span className="cascade-agent">{AGENT_LABEL[b.agent]}</span>
            <span className="cascade-text">
              {b.text || (isActive ? '' : '…')}
              {isActive && <span className="cascade-caret" />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
