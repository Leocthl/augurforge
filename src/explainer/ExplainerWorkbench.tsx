import { useMemo, type Ref } from 'react';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import { inspectNode, nodeIdsForSentence, sentenceRefsFromState } from './graphModel';
import type { EventSource } from './eventSource';
import type { Depth } from './liveSource';
import type { ReasoningState } from './reasoningGraph';
import type {
  AgentId,
  GraphSelection,
  RoleImpactResult,
  RoleImpactStatus,
  SentenceRef,
  StakeholderRoleId,
} from './types';
import { GroupInspector } from './GroupInspector';
import { RoleImpactPanel } from './RoleImpactPanel';
import { SourceReceiptPanel } from './SourceReceiptPanel';
import { ThinkingGraph } from './ThinkingGraph';
import { TranscriptStrip } from './TranscriptStrip';

type Mode = 'mock' | 'real';

interface Props {
  state: ReasoningState;
  latest: { ttftMs?: number; tokensPerSec?: number };
  started: boolean;
  mode: Mode;
  depth: Depth;
  session: AugurForgeSessionSnapshot | null;
  size: { w: number; h: number };
  graphRef: Ref<HTMLDivElement>;
  source?: EventSource;
  selected: GraphSelection;
  activeRole: StakeholderRoleId;
  roleStatuses: Record<StakeholderRoleId, RoleImpactStatus>;
  roleResults: Partial<Record<StakeholderRoleId, RoleImpactResult>>;
  recorderSupported: boolean;
  recording: boolean;
  onCanvas: (canvas: HTMLCanvasElement | null) => void;
  onRun: () => void;
  onSetMode: (mode: Mode) => void;
  onSetDepth: (depth: Depth) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectAgent: (agent: AgentId) => void;
  onSelectSentence: (sentence: SentenceRef) => void;
  onSelectRole: (role: StakeholderRoleId) => void;
  onToggleRecording: () => void;
}

export function ExplainerWorkbench(props: Props) {
  const sentences = useMemo(
    () => sentenceRefsFromState(props.state.data, props.state.beats),
    [props.state.data, props.state.beats],
  );
  const activeSentence = sentences.find((sentence) => sentence.id === props.selected.sentenceId) ?? null;
  const inspection = useMemo(
    () => inspectNode(props.state.data, props.state.beats, props.selected.nodeId),
    [props.state.data, props.state.beats, props.selected.nodeId],
  );
  const highlighted = activeSentence
    ? nodeIdsForSentence(props.state.data, activeSentence)
    : inspection?.related.map((node) => node.id) ?? [];

  return (
    <div className="explainer-workbench">
      <header className="explainer-topbar">
        <div>
          <span>AugurForge Explainer</span>
          <strong>Gemma 4 reasoning graph</strong>
        </div>
        <div className="explainer-topbar-actions">
          {!props.source && (
            <div className="explainer-seg light" role="group" aria-label="Source">
              <button
                type="button"
                className={`explainer-seg-btn${props.mode === 'mock' ? ' is-active' : ''}`}
                onClick={() => props.onSetMode('mock')}
              >
                Mock
              </button>
              <button
                type="button"
                className={`explainer-seg-btn${props.mode === 'real' ? ' is-active' : ''}`}
                onClick={() => props.onSetMode('real')}
              >
                Live
              </button>
            </div>
          )}
          <div className="explainer-seg light" role="group" aria-label="Depth">
            <button
              type="button"
              className={`explainer-seg-btn${props.depth === 'entry' ? ' is-active' : ''}`}
              onClick={() => props.onSetDepth('entry')}
            >
              Entry
            </button>
            <button
              type="button"
              className={`explainer-seg-btn${props.depth === 'expert' ? ' is-active' : ''}`}
              onClick={() => props.onSetDepth('expert')}
            >
              Expert
            </button>
          </div>
          <button type="button" className="source-replace" onClick={props.onRun}>
            {props.started ? 'Replay' : 'Run'}
          </button>
        </div>
      </header>

      <main className="explainer-layout">
        <section className="explainer-left" aria-label="Explainer source">
          <SourceReceiptPanel session={props.session} mode={props.mode} onReplaceInput={props.onRun} />
        </section>

        <section className="explainer-center" aria-label="Reasoning graph workspace">
          <div className="graph-stage" ref={props.graphRef}>
            <ThinkingGraph
              data={props.state.data}
              width={props.size.w}
              height={props.size.h}
              variant="showcase"
              selectedNodeId={props.selected.nodeId}
              highlightedNodeIds={highlighted}
              onCanvas={props.onCanvas}
              onNodeClick={props.onSelectNode}
            />
          </div>
          <div className="explainer-statusbar">
            <span className="explainer-badge">Gemma 4 / Cerebras</span>
            <span>TTFT {props.latest.ttftMs != null ? `${props.latest.ttftMs} ms` : 'pending'}</span>
            <span>
              {props.latest.tokensPerSec != null
                ? `${Math.round(props.latest.tokensPerSec)} tokens/s`
                : 'tokens/s pending'}
            </span>
            <span>{props.state.data.nodes.length} nodes</span>
            <span>deterministic browser math</span>
            <button
              type="button"
              className={`explainer-record${props.recording ? ' is-recording' : ''}`}
              disabled={!props.recorderSupported}
              onClick={props.onToggleRecording}
              title={props.recorderSupported ? 'Record the graph to a .webm clip' : 'Recording not supported in this browser'}
            >
              {props.recording ? 'Stop' : 'Record'}
            </button>
          </div>
          <div className="explainer-transcript-panel">
            <TranscriptStrip
              beats={props.state.beats}
              sentences={sentences}
              activeSentenceId={props.selected.sentenceId}
              variant="showcase"
              activeAgent={props.state.active}
              focusedAgent={null}
              onAgentSelect={props.onSelectAgent}
              onSentenceSelect={props.onSelectSentence}
            />
          </div>
        </section>

        <section className="explainer-right" aria-label="Explainer details">
          <GroupInspector inspection={inspection} sentence={activeSentence} data={props.state.data} />
          <RoleImpactPanel
            activeRole={props.activeRole}
            statuses={props.roleStatuses}
            results={props.roleResults}
            onSelectRole={props.onSelectRole}
          />
        </section>
      </main>
    </div>
  );
}
