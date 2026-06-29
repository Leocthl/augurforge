/**
 * DepthExplainer.tsx - standalone explainer feature mount.
 * Owns the event stream, graph reducer, source mode, clip recording, and stakeholder role queue.
 * The visual shell lives in ExplainerWorkbench so the standalone route can evolve without touching
 * the embedded ReasoningPanel used by the main app Inspector.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pipelineInputFromSession,
  readAugurForgeSession,
  subscribeAugurForgeSession,
  type AugurForgeSessionSnapshot,
} from '../core/sessionContext';
import { mockEventSource, type EventSource } from './eventSource';
import { ExplainerWorkbench } from './ExplainerWorkbench';
import { realPipelineSource, type Depth } from './liveSource';
import { applyEvent, initReasoning, type ReasoningState } from './reasoningGraph';
import { ROLE_DEFS, runMockRoleAnalysis, runRoleAnalysis } from './roleAnalysis';
import type {
  AgentEvent,
  AgentId,
  GraphSelection,
  OnEvent,
  RoleImpactResult,
  RoleImpactStatus,
  SentenceRef,
  StakeholderRoleId,
} from './types';
import { useClipRecorder } from './useClipRecorder';

type Mode = 'mock' | 'real';

interface Props {
  /** Overrides the source toggle. When set, the mock/real switch is hidden. */
  source?: EventSource;
}

function initialRoleStatuses(): Record<StakeholderRoleId, RoleImpactStatus> {
  return Object.fromEntries(ROLE_DEFS.map((role) => [role.id, 'idle'])) as Record<
    StakeholderRoleId,
    RoleImpactStatus
  >;
}

export function DepthExplainer({ source }: Props) {
  const [state, setState] = useState<ReasoningState>(() => initReasoning(performance.now()));
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>('mock');
  const [activeSourceMode, setActiveSourceMode] = useState<Mode>('mock');
  const [depth, setDepth] = useState<Depth>('entry');
  const [selected, setSelected] = useState<GraphSelection>({ nodeId: null, sentenceId: null });
  const [activeRole, setActiveRole] = useState<StakeholderRoleId>('executive');
  const [roleStatuses, setRoleStatuses] = useState<Record<StakeholderRoleId, RoleImpactStatus>>(() =>
    initialRoleStatuses(),
  );
  const [roleResults, setRoleResults] = useState<Partial<Record<StakeholderRoleId, RoleImpactResult>>>({});
  const [runId, setRunId] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [session, setSession] = useState<AugurForgeSessionSnapshot | null>(() => readAugurForgeSession());
  const wrapRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<AugurForgeSessionSnapshot | null>(session);
  const stateRef = useRef<ReasoningState>(state);

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

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setSession(readAugurForgeSession());
    return subscribeAugurForgeSession((snapshot) => setSession(snapshot));
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
    setSelected({ nodeId: null, sentenceId: null });
    setRoleResults({});
    setRoleStatuses(initialRoleStatuses());
    setRunId((id) => id + 1);
    setStarted(true);
    const sessionInput = pipelineInputFromSession(sessionRef.current);
    const shouldRunLive = !source && mode === 'real' && !!sessionInput;
    const runMode: Mode = shouldRunLive ? 'real' : 'mock';
    setActiveSourceMode(source ? mode : runMode);
    const src = source ?? (shouldRunLive ? realPipelineSource(depth, sessionInput) : mockEventSource({ depth }));
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

  const selectNode = useCallback((nodeId: string) => {
    setSelected({ nodeId, sentenceId: null });
  }, []);

  const selectAgent = useCallback((agent: AgentId) => {
    setSelected({ nodeId: agent, sentenceId: null });
  }, []);

  const selectSentence = useCallback((sentence: SentenceRef) => {
    setSelected({ nodeId: null, sentenceId: sentence.id });
  }, []);

  const roleSessionSummary = useMemo(() => {
    const parts = [
      session?.title,
      session?.latestSummary,
      ...(session?.metrics ?? []).map((metric) => `${metric.label}: ${metric.value}`),
      session?.input?.intent ? `Intent: ${session.input.intent}` : undefined,
    ].filter((part): part is string => Boolean(part));
    return parts.join('\n');
  }, [session]);

  const roleRunKey = useMemo(() => {
    const beat = state.beats.find((item) => item.agent === 'explainer' && item.status === 'done');
    return beat ? `${runId}:${beat.text}` : null;
  }, [runId, state.beats]);

  useEffect(() => {
    if (!roleRunKey) return;

    const controller = new AbortController();
    let cancelled = false;
    const stateSnapshot = stateRef.current;

    const queue = async () => {
      for (const role of ROLE_DEFS) {
        if (cancelled) return;
        setRoleStatuses((prev) => ({ ...prev, [role.id]: 'loading' }));
        try {
          const result =
            activeSourceMode === 'real'
              ? await runRoleAnalysis(role.id, stateSnapshot, roleSessionSummary, controller.signal)
              : await runMockRoleAnalysis(role.id, stateSnapshot, roleSessionSummary);
          if (cancelled) return;
          setRoleResults((prev) => ({ ...prev, [role.id]: result }));
          setRoleStatuses((prev) => ({ ...prev, [role.id]: result.error ? 'error' : 'done' }));
        } catch (err) {
          if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
          setRoleStatuses((prev) => ({ ...prev, [role.id]: 'error' }));
        }
      }
    };

    queue();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeSourceMode, roleRunKey, roleSessionSummary]);

  return (
    <div className="explainer-root">
      <ExplainerWorkbench
        state={state}
        latest={latest}
        started={started}
        mode={mode}
        activeSourceMode={activeSourceMode}
        depth={depth}
        session={session}
        size={size}
        graphRef={wrapRef}
        source={source}
        selected={selected}
        activeRole={activeRole}
        roleStatuses={roleStatuses}
        roleResults={roleResults}
        recorderSupported={recorder.supported}
        recording={recorder.recording}
        onCanvas={onCanvas}
        onRun={run}
        onSetMode={setMode}
        onSetDepth={setDepth}
        onSelectNode={selectNode}
        onSelectAgent={selectAgent}
        onSelectSentence={selectSentence}
        onSelectRole={setActiveRole}
        onToggleRecording={toggleRecording}
      />
    </div>
  );
}
