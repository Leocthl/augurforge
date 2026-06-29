import type { AgentId, GraphVariant, ReasoningBeat, SentenceRef } from './types';
import { CascadeTranscript } from './CascadeTranscript';
import { AGENT_LABEL } from './reasoningGraph';

interface Props {
  beats: ReasoningBeat[];
  sentences: SentenceRef[];
  activeSentenceId: string | null;
  variant: GraphVariant;
  activeAgent: AgentId | null;
  focusedAgent: AgentId | null;
  onAgentSelect: (agent: AgentId) => void;
  onSentenceSelect: (sentence: SentenceRef) => void;
}

export function TranscriptStrip({
  beats,
  sentences,
  activeSentenceId,
  variant,
  activeAgent,
  focusedAgent,
  onAgentSelect,
  onSentenceSelect,
}: Props) {
  if (sentences.length === 0) {
    return (
      <CascadeTranscript
        beats={beats}
        activeAgent={activeAgent}
        focusedAgent={focusedAgent}
        variant={variant}
        onSelect={onAgentSelect}
      />
    );
  }

  return (
    <div className={`transcript-strip ${variant}`} aria-label="Clickable reasoning sentences">
      {sentences.map((sentence) => {
        const isActive = activeSentenceId === sentence.id;
        const agentLabel = AGENT_LABEL[sentence.agent];

        return (
          <button
            key={sentence.id}
            type="button"
            className={`transcript-sentence${isActive ? ' is-active' : ''}`}
            aria-label={`Show graph evidence for ${agentLabel}: ${sentence.text}`}
            aria-pressed={isActive}
            onClick={() => onSentenceSelect(sentence)}
          >
            <span>{agentLabel}</span>
            <strong>{sentence.text}</strong>
          </button>
        );
      })}
    </div>
  );
}
