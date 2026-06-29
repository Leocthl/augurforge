/**
 * DepthExplainer.tsx — the mountable feature. [OWNER: B / explainer]
 * Runs an EventSource, reduces the stream into a growing graph, and overlays the streamed caption +
 * Cerebras TTFT/tokens-sec HUD. The graph assembles part-by-part -> speed felt.
 *
 * Controls:
 *  - Source: "Mock cascade" (offline canned replay, default) vs "Real pipeline" (the actual
 *    runPipeline + runTweak agent cascade — streams real events offline, live with a key).
 *  - Depth: entry / expert — re-runs at that depth (passed into runTweak live; varies mock captions).
 *  - Record clip: captures the graph <canvas> to a downloadable .webm for the demo video.
 *
 * An explicit `source` prop overrides the source toggle (kept for embedding/tests).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, OnEvent } from './types';
import { applyEvent, initReasoning, type ReasoningState } from './reasoningGraph';
import { mockEventSource, type EventSource } from './eventSource';
import { realPipelineSource, type Depth } from './liveSource';
import { useClipRecorder } from './useClipRecorder';
import { ThinkingGraph } from './ThinkingGraph';

type Mode = 'mock' | 'real';

interface Props {
  /** Overrides the source toggle. When set, the mock/real switch is hidden. */
  source?: EventSource;
}

export function DepthExplainer({ source }: Props) {
  const [state, setState] = useState<ReasoningState>(() => initReasoning(performance.now()));
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>('mock');
  const [depth, setDepth] = useState<Depth>('entry');
  const [size, setSize] = useState({ w: 800, h: 520 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const recorder = useClipRecorder();

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

  const onCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const run = useCallback(() => {
    stopRef.current?.();
    setState(initReasoning(performance.now()));
    setLatest({});
    setStarted(true);
    const src = source ?? (mode === 'real' ? realPipelineSource(depth) : mockEventSource({ depth }));
    stopRef.current = src.start(onEvent);
  }, [source, mode, depth, onEvent]);

  useEffect(() => {
    run();
    return () => stopRef.current?.();
  }, [run]);

  const toggleRecording = useCallback(() => {
    if (recorder.recording) recorder.stop();
    else if (canvasRef.current) recorder.start(canvasRef.current);
  }, [recorder]);

  const captionList = Object.values(state.captions);
  const activeCaption = state.active ? state.captions[state.active] : captionList[captionList.length - 1];

  return (
    <div className="explainer-root">
      <div className="explainer-graph" ref={wrapRef}>
        <ThinkingGraph data={state.data} width={size.w} height={size.h} onCanvas={onCanvas} />
      </div>

      <div className="explainer-controls">
        {!source && (
          <div className="explainer-seg" role="group" aria-label="Source">
            <button
              className={`explainer-seg-btn${mode === 'mock' ? ' is-active' : ''}`}
              onClick={() => setMode('mock')}
            >
              Mock cascade
            </button>
            <button
              className={`explainer-seg-btn${mode === 'real' ? ' is-active' : ''}`}
              onClick={() => setMode('real')}
            >
              Real pipeline
            </button>
          </div>
        )}
        <div className="explainer-seg" role="group" aria-label="Depth">
          <button
            className={`explainer-seg-btn${depth === 'entry' ? ' is-active' : ''}`}
            onClick={() => setDepth('entry')}
          >
            Entry
          </button>
          <button
            className={`explainer-seg-btn${depth === 'expert' ? ' is-active' : ''}`}
            onClick={() => setDepth('expert')}
          >
            Expert
          </button>
        </div>
        <button
          className={`explainer-record${recorder.recording ? ' is-recording' : ''}`}
          onClick={toggleRecording}
          disabled={!recorder.supported}
          title={recorder.supported ? 'Record the graph to a .webm clip' : 'Recording not supported in this browser'}
        >
          {recorder.recording ? '● Stop' : 'Record clip'}
        </button>
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
