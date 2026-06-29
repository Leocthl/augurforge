/**
 * WarRoom.tsx — the Gemma swarm as a pixel-sprite "situation room". [OWNER: B / warroom]
 *
 * A recreation of simfrancisco's canvas swarm, re-skinned as an office: six agent GROUPS of
 * Gemma-authored pixel workers (baked from characters.json via bakeAtlas) wander their desks around
 * a central situation board. The real AgentEvent cascade (reused explainer plumbing) drives the
 * scene — the active group lights up, the camera pushes in, and its streamed tokens fill a thought
 * bubble. It is an aesthetic MULTI-AGENT VIEW of the same process the main app runs. Mock-first.
 */
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AgentEvent, AgentId, OnEvent, TimeInfo } from '../core/contract';
import {
  applyEvent,
  initReasoning,
  realPipelineSource,
  useClipRecorder,
  type EventSource,
  type ReasoningState,
} from '../explainer';
import { chat, USE_LIVE, type Provider } from '../core/cerebras';
import { AGENT_LABEL, AGENT_ORDER, AGENT_RESPONSIBILITY, GROUP_COLOR } from './agents';
import { clampCamera, focusCamera, panCamera, screenToWorld, zoomAt, type CameraView } from './camera';
import { buildScene, hitTestDesk, type BoardContext, type SceneLayout } from './scene';
import { buildCrowd, stepWorker, totalFigures, type Crowd, type GroupStatus } from './crowd';
import { loadGroupTraits } from './traits';
import { bakeAtlas } from './bakeAtlas';
import { ambientForAgent, panicForAgent } from './bubbles';
import { drawScene, type AmbientBubble, type SceneState } from './draw';
import { deriveAgentDossiers, type AgentDossier } from './agentDossier';
import { startQuestionRun, type QuestionTurn } from './questionRun';
import { downloadReportHtml, generateReportPreview, type GeneratedReport } from './reportExport';
import {
  pipelineInputFromSession,
  readAugurForgeSession,
  subscribeAugurForgeSession,
  type AugurForgeSessionSnapshot,
} from '../core/sessionContext';

const SCENARIO_TITLE = 'Portfolio ruin risk — Monte Carlo (GBM)';
const LIVE_ENV = import.meta.env.VITE_USE_LIVE === 'true';
const BACKDROP_SRC = `${import.meta.env.BASE_URL}warroom/situation-room-bg.png`;
const ROLE = GROUP_COLOR;
const DEFAULT_BASELINE_LABEL = 'OpenRouter · Gemma 4';
const RACE_PROMPT =
  'War Room speed proof. For the current AugurForge market-risk situation, summarize the scenario, name the main risk driver, and give one decision-support caveat in 2 short sentences.';

interface LiveHealth {
  checked: boolean;
  hasKey: boolean;
  baselineConfigured: boolean;
  baselineLabel: string;
  model: string;
}

interface RaceLap {
  totalMs: number;
  ttftMs?: number;
  tokensPerSec?: number;
  text: string;
  simulated: boolean;
}

interface RaceState {
  running: boolean;
  cerebras?: RaceLap;
  baseline?: RaceLap;
  error?: string;
}

/** Derive each group's live status from the reasoning reducer state. */
function deriveStatuses(state: ReasoningState): Record<string, GroupStatus> {
  const out: Record<string, GroupStatus> = {};
  for (const id of AGENT_ORDER) {
    const node = state.data.nodes.find((n) => n.id === id);
    const caption = state.captions[id] ?? '';
    out[id] = {
      started: !!node || id in state.captions,
      thinking: node?.pulse === true,
      done: !!node && node.pulse === false,
      caption,
    };
  }
  return out;
}

/** Best-effort "latest metric" for the board, preferring the main workbench snapshot. */
function deriveMetric(state: ReasoningState, session: AugurForgeSessionSnapshot | null): { label: string; value: string } | null {
  const sessionMetric = session?.metrics?.[0];
  if (sessionMetric) return { label: sessionMetric.label, value: sessionMetric.value };
  const nodes = state.data.nodes;
  const riskCount = nodes.filter((n) => n.id.startsWith('risk:')).length;
  if (riskCount > 0) return { label: 'Risk flags raised', value: String(riskCount) };
  const paramCount = nodes.filter((n) => n.id.startsWith('param:')).length;
  if (paramCount > 0) return { label: 'Parameters inferred', value: String(paramCount) };
  const model = nodes.find((n) => n.id.startsWith('model:'));
  if (model) return { label: 'Model selected', value: model.label };
  return null;
}

function sessionDetails(session: AugurForgeSessionSnapshot | null): string[] {
  if (!session) return [];
  const attachmentNames = session.input?.attachments?.map((attachment) => attachment.name).slice(0, 3) ?? [];
  const mapping = Object.entries(session.modelerMapping ?? {})
    .filter(([, value]) => value.trim())
    .slice(0, 2)
    .map(([label, value]) => `${label}: ${value}`);
  const metric = session.metrics?.[0] ? `${session.metrics[0].label}: ${session.metrics[0].value}` : undefined;
  return [
    attachmentNames.length ? `Uploaded: ${attachmentNames.join(', ')}` : undefined,
    metric,
    ...mapping,
  ].filter((item): item is string => Boolean(item));
}

function deriveBoardContext(state: ReasoningState, modeLabel: string, session: AugurForgeSessionSnapshot | null): BoardContext {
  const nodes = state.data.nodes;
  const started = AGENT_ORDER.filter((id) => nodes.some((n) => n.id === id) || id in state.captions).length;
  const done = AGENT_ORDER.filter((id) => {
    const node = nodes.find((n) => n.id === id);
    return !!node && node.pulse === false && id in state.captions;
  }).length;
  const model = nodes.find((n) => n.id.startsWith('model:'))?.label ?? 'GBM template';
  const params = nodes.filter((n) => n.id.startsWith('param:')).map((n) => n.label).slice(0, 4);
  const riskCount = nodes.filter((n) => n.id.startsWith('risk:')).length;
  const active = state.active;
  const lastBeat = [...state.beats].reverse().find((b) => b.text.trim());
  const liveCaption = active ? state.captions[active] : '';
  const summary =
    liveCaption.trim() ||
    lastBeat?.text.trim() ||
    session?.latestSummary ||
    'Six Gemma agents turn the market request into model selection, inferred parameters, risk flags, and explanation.';

  const details = [
    `Mode: ${modeLabel}`,
    `Progress: ${started}/${AGENT_ORDER.length} agents started, ${done}/${AGENT_ORDER.length} complete`,
    ...sessionDetails(session),
    params.length ? `Inputs inferred: ${params.join(', ')}` : `Model focus: ${model}`,
    riskCount > 0 ? `Risk review: ${riskCount} flags on board` : 'Risk review: waiting for tail checks',
  ];

  return {
    title: session?.title ?? SCENARIO_TITLE,
    phase: active ? `${AGENT_LABEL[active]} streaming` : done > 0 ? 'Cascade review' : 'Cascade ready',
    summary,
    details,
    metric: deriveMetric(state, session),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmtMs = (ms?: number) => (ms != null ? `${Math.round(ms)} ms` : '—');
const fmtRate = (n?: number) => (n != null ? `${Math.round(n).toLocaleString()} tok/s` : '—');

export function WarRoom({ source }: { source?: EventSource }) {
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [figureCount, setFigureCount] = useState(0);
  const [session, setSession] = useState<AugurForgeSessionSnapshot | null>(() => readAugurForgeSession());
  const [health, setHealth] = useState<LiveHealth>({
    checked: !LIVE_ENV,
    hasKey: LIVE_ENV,
    baselineConfigured: false,
    baselineLabel: DEFAULT_BASELINE_LABEL,
    model: 'gemma-4-31b',
  });
  const [race, setRace] = useState<RaceState>({ running: false });
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const [hoverAgentId, setHoverAgentId] = useState<AgentId | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionRunning, setQuestionRunning] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [history, setHistory] = useState<QuestionTurn[]>([]);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [renderVersion, setRenderVersion] = useState(0);

  const stopRef = useRef<null | (() => void)>(null);
  const stateRef = useRef<ReasoningState>(initReasoning(performance.now()));
  const sessionRef = useRef<AugurForgeSessionSnapshot | null>(session);
  const latestByAgentRef = useRef<Partial<Record<AgentId, TimeInfo>>>({});
  const questionStopRef = useRef<null | (() => void)>(null);
  const questionBoardRef = useRef<null | { question: string; answer?: string; running: boolean }>(null);
  const draggingRef = useRef<null | { id: number; x: number; y: number; moved: boolean }>(null);
  const manualCameraUntilRef = useRef(0);
  const selectedAgentIdRef = useRef<AgentId | null>(selectedAgentId);
  const hoverAgentIdRef = useRef<AgentId | null>(hoverAgentId);
  const questionRunningRef = useRef(questionRunning);
  const mountedRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneLayout | null>(null);
  const crowdRef = useRef<Crowd | null>(null);
  const atlasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropRef = useRef<HTMLImageElement | null>(null);
  const camRef = useRef<CameraView>({ x: 0, y: 0, zoom: 1 });
  const ambientRef = useRef<{ at: number; picks: AmbientBubble[] }>({ at: -1e9, picks: [] });
  const rafRef = useRef<number>(0);
  const recorder = useClipRecorder(30);

  const onEvent: OnEvent = useCallback((e: AgentEvent) => {
    stateRef.current = applyEvent(stateRef.current, e, performance.now());
    if (e.timeInfo) {
      latestByAgentRef.current = { ...latestByAgentRef.current, [e.agent]: e.timeInfo };
      setLatest({ ttftMs: e.timeInfo.ttftMs, tokensPerSec: e.timeInfo.tokensPerSec });
    }
    setRenderVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedAgentId]);

  useEffect(() => {
    hoverAgentIdRef.current = hoverAgentId;
  }, [hoverAgentId]);

  useEffect(() => {
    questionRunningRef.current = questionRunning;
  }, [questionRunning]);

  useEffect(() => {
    setSession(readAugurForgeSession());
    return subscribeAugurForgeSession((snapshot) => setSession(snapshot));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!LIVE_ENV) return;
    let cancelled = false;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setHealth({
          checked: true,
          hasKey: Boolean(data?.hasKey),
          baselineConfigured: Boolean(data?.baselineConfigured),
          baselineLabel: typeof data?.baselineLabel === 'string' && data.baselineLabel ? data.baselineLabel : DEFAULT_BASELINE_LABEL,
          model: typeof data?.model === 'string' && data.model ? data.model : 'gemma-4-31b',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setHealth((current) => ({ ...current, checked: true, hasKey: false, baselineConfigured: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(() => {
    stopRef.current?.();
    questionStopRef.current?.();
    stateRef.current = initReasoning(performance.now());
    latestByAgentRef.current = {};
    questionBoardRef.current = null;
    setQuestionRunning(false);
    setQuestionError('');
    setHistory([]);
    setRenderVersion((value) => value + 1);
    setLatest({});
    if (!source && !LIVE_ENV) {
      onEvent({ agent: 'orchestrator', status: 'start' });
      onEvent({
        agent: 'orchestrator',
        status: 'error',
        error: 'Live mode is off. Restart with VITE_USE_LIVE=true / npm run dev:live to use Gemma 4 through Cerebras.',
      });
      return;
    }
    const src = source ?? realPipelineSource('entry', pipelineInputFromSession(sessionRef.current));
    stopRef.current = src.start(onEvent);
  }, [source, onEvent]);

  const statusesForUi = useMemo(() => deriveStatuses(stateRef.current), [renderVersion]);
  const dossiers = useMemo(
    () =>
      deriveAgentDossiers({
        state: stateRef.current,
        statuses: statusesForUi,
        latestByAgent: latestByAgentRef.current,
        session,
      }),
    [renderVersion, session, statusesForUi],
  );
  const selectedDossier = dossiers.find((dossier) => dossier.agentId === selectedAgentId) ?? null;

  // Bake the Gemma-authored sprite atlas once on mount.
  useEffect(() => {
    const atlas = bakeAtlas(loadGroupTraits());
    if (!atlas) console.warn('[warroom] sprite atlas baking failed; rendering LOD squares');
    atlasRef.current = atlas;
  }, []);

  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.src = BACKDROP_SRC;
    img.onload = () => {
      backdropRef.current = img;
    };
    img.onerror = () => {
      console.warn('[warroom] backdrop failed to load; using procedural fallback');
      backdropRef.current = null;
    };
  }, []);

  // Canvas: DPR-aware sizing + the simfrancisco-style rAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      cssW = Math.max(320, Math.floor(rect.width));
      cssH = Math.max(240, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scene = buildScene(cssW, cssH, ROLE);
      sceneRef.current = scene;
      crowdRef.current = buildCrowd(scene);
      camRef.current = clampCamera({ x: cssW / 2, y: cssH / 2, zoom: 1 }, { width: scene.width, height: scene.height, viewW: cssW, viewH: cssH });
      setFigureCount(totalFigures(crowdRef.current));
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const start = performance.now();
    let prev = start;

    const pickAmbient = (t: number, crowd: Crowd, activeId: string | null): AmbientBubble[] => {
      const cur = ambientRef.current;
      if (t * 1000 - cur.at < 4200 && cur.picks.length) return cur.picks;
      const cycle = Math.floor((t * 1000) / 4200);
      const picks: AmbientBubble[] = [];
      crowd.groups.forEach((g, gi) => {
        if (picks.length >= 3 || g.id === activeId || g.workers.length === 0) return;
        if ((cycle + gi) % 2 !== 0) return;
        const wi = (cycle * 5 + gi * 11) % g.workers.length;
        picks.push({
          gi,
          wi,
          text: questionRunningRef.current
            ? panicForAgent(g.id, gi * 31 + wi + cycle)
            : ambientForAgent(g.id, gi * 23 + wi * 3 + cycle * 5),
        });
      });
      ambientRef.current = { at: t * 1000, picks };
      return picks;
    };

    let frameErrLogged = false;
    const frame = (now: number) => {
      try {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;
      const scene = sceneRef.current;
      const crowd = crowdRef.current;
      if (scene && crowd) {
        const statuses = deriveStatuses(stateRef.current);
        const activeId = stateRef.current.active;

        for (const g of crowd.groups) {
          const mode = questionRunningRef.current ? 'panic' : statuses[g.id]?.thinking === true ? 'active' : 'idle';
          for (const w of g.workers) stepWorker(w, scene, { mode }, dt);
        }

        if (performance.now() > manualCameraUntilRef.current) {
          const active = activeId ? crowd.groups.find((g) => g.id === activeId) : undefined;
          const bounds = { width: scene.width, height: scene.height, viewW: cssW, viewH: cssH };
          const target = active
            ? focusCamera(active.home, 1.5, bounds)
            : focusCamera({ x: scene.width / 2, y: scene.height / 2 }, 1, bounds);
          const k = 1 - Math.pow(0.0001, dt);
          const cam = camRef.current;
          camRef.current = {
            x: lerp(cam.x, target.x, k),
            y: lerp(cam.y, target.y, k),
            zoom: lerp(cam.zoom, target.zoom, k),
          };
        }

        const modeLabel = source
          ? 'Injected event stream'
          : LIVE_ENV
            ? 'Live Cerebras Gemma 4'
            : 'Live mode off';
        const board = deriveBoardContext(stateRef.current, modeLabel, sessionRef.current);
        const questionBoard = questionBoardRef.current;
        const boardWithQuestion = questionBoard
          ? {
              ...board,
              phase: questionBoard.running ? 'Swarm investigating' : 'Swarm answered',
              summary: questionBoard.answer || questionBoard.question,
              details: [`Question: ${questionBoard.question}`, ...board.details].slice(0, 5),
            }
          : board;
        const ss: SceneState = {
          scene,
          crowd,
          atlas: atlasRef.current,
          backdrop: backdropRef.current,
          statuses,
          captions: stateRef.current.captions,
          activeId,
          cam: camRef.current,
          cssW,
          cssH,
          t,
          board: boardWithQuestion,
          ambient: pickAmbient(t, crowd, activeId),
          selectedAgentId: selectedAgentIdRef.current,
          hoverAgentId: hoverAgentIdRef.current,
          panicAgentIds: new Set(questionRunningRef.current ? AGENT_ORDER : []),
          responsibilities: AGENT_RESPONSIBILITY,
        };
        drawScene(ctx, ss);
      }
      } catch (err) {
        if (!frameErrLogged) {
          frameErrLogged = true;
          console.error('[warroom] render frame failed:', err);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    run();
    return () => stopRef.current?.();
  }, [run]);

  useEffect(() => {
    return () => questionStopRef.current?.();
  }, []);

  const pipelineLabel = source ? 'Injected event stream' : LIVE_ENV ? 'Live Cerebras Gemma 4' : 'Live mode off';
  const speedup =
    race.cerebras?.totalMs && race.baseline?.totalMs ? (race.baseline.totalMs / race.cerebras.totalMs).toFixed(1) : null;
  const liveStatusText = !LIVE_ENV
    ? 'Live off: restart with dev:live'
    : !health.checked
      ? 'Checking live keys'
      : health.hasKey
        ? `LIVE DATA · ${health.model}`
        : 'Live proxy key missing';
  const baselineStatusText = health.baselineConfigured ? `${health.baselineLabel} live` : `${health.baselineLabel} not configured`;

  const cameraBounds = useCallback(
    () => ({
      width: sceneRef.current?.width ?? canvasRef.current?.clientWidth ?? 1,
      height: sceneRef.current?.height ?? canvasRef.current?.clientHeight ?? 1,
      viewW: canvasRef.current?.clientWidth ?? 1,
      viewH: canvasRef.current?.clientHeight ?? 1,
    }),
    [],
  );

  const worldFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToWorld(camRef.current, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  }, []);

  const selectAt = useCallback((point: { x: number; y: number }) => {
    const scene = sceneRef.current;
    if (!scene) return;
    setSelectedAgentId(hitTestDesk(scene, point.x, point.y)?.id ?? null);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (draggingRef.current?.id === event.pointerId) {
        const dx = event.clientX - draggingRef.current.x;
        const dy = event.clientY - draggingRef.current.y;
        const moved = draggingRef.current.moved || Math.hypot(dx, dy) > 4;
        draggingRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved };
        camRef.current = panCamera(camRef.current, dx, dy, cameraBounds());
        manualCameraUntilRef.current = performance.now() + 3500;
        return;
      }
      const world = worldFromEvent(event);
      setHoverAgentId(hitTestDesk(scene, world.x, world.y)?.id ?? null);
    },
    [cameraBounds, worldFromEvent],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = draggingRef.current?.id === event.pointerId ? draggingRef.current : null;
      draggingRef.current = null;
      if (!drag || drag.moved) return;
      selectAt(worldFromEvent(event));
    },
    [selectAt, worldFromEvent],
  );

  const onWheel = useCallback(
    (event: WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.12 : 0.88;
      camRef.current = zoomAt(camRef.current, event.clientX - rect.left, event.clientY - rect.top, factor, cameraBounds());
      manualCameraUntilRef.current = performance.now() + 3500;
    },
    [cameraBounds],
  );

  const onDoubleClick = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const point = worldFromEvent(event);
      const hit = hitTestDesk(scene, point.x, point.y);
      if (!hit) return;
      setSelectedAgentId(hit.id);
      camRef.current = focusCamera(hit.home, 1.65, cameraBounds());
      manualCameraUntilRef.current = performance.now() + 3500;
    },
    [cameraBounds, worldFromEvent],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const scene = sceneRef.current;
      if (event.key === 'Escape') setSelectedAgentId(null);
      if (event.key === '+' || event.key === '=') camRef.current = zoomAt(camRef.current, window.innerWidth / 2, window.innerHeight / 2, 1.12, cameraBounds());
      if (event.key === '-') camRef.current = zoomAt(camRef.current, window.innerWidth / 2, window.innerHeight / 2, 0.88, cameraBounds());
      if (event.key === 'ArrowLeft') camRef.current = panCamera(camRef.current, 48, 0, cameraBounds());
      if (event.key === 'ArrowRight') camRef.current = panCamera(camRef.current, -48, 0, cameraBounds());
      if (event.key === 'ArrowUp') camRef.current = panCamera(camRef.current, 0, 48, cameraBounds());
      if (event.key === 'ArrowDown') camRef.current = panCamera(camRef.current, 0, -48, cameraBounds());
      if (event.key === '0') {
        camRef.current = focusCamera({ x: (scene?.width ?? 1) / 2, y: (scene?.height ?? 1) / 2 }, 1, cameraBounds());
        manualCameraUntilRef.current = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cameraBounds]);

  const submitQuestion = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const question = questionText.trim();
      if (!question || questionRunning) return;
      questionStopRef.current?.();
      questionBoardRef.current = { question, running: true };
      ambientRef.current = { at: -1e9, picks: [] };
      setQuestionError('');
      setQuestionRunning(true);
      setQuestionText('');
      setSelectedAgentId(null);
      questionStopRef.current = startQuestionRun({
        question,
        session: sessionRef.current,
        dossiers,
        onEvent,
        onComplete: (turn) => {
          questionBoardRef.current = { question, answer: turn.answer, running: false };
          ambientRef.current = { at: -1e9, picks: [] };
          setHistory((items) => [turn, ...items].slice(0, 5));
          setQuestionRunning(false);
          setRenderVersion((value) => value + 1);
        },
        onError: (message) => {
          questionBoardRef.current = { question, answer: message, running: false };
          ambientRef.current = { at: -1e9, picks: [] };
          setQuestionError(message);
          setQuestionRunning(false);
        },
      });
    },
    [dossiers, onEvent, questionRunning, questionText],
  );

  const openReport = useCallback(async () => {
    if (reportBusy) return;
    setReportOpen(true);
    setReportBusy(true);
    setReportError('');
    try {
      const generated = await generateReportPreview({
        title: deriveBoardContext(stateRef.current, pipelineLabel, sessionRef.current).title,
        mode: pipelineLabel,
        latest,
        dossiers,
        history,
        session: sessionRef.current,
      });
      setReport(generated);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setReportBusy(false);
    }
  }, [dossiers, history, latest, pipelineLabel, reportBusy]);

  const runRace = useCallback(async () => {
    if (race.running) return;
    if (!USE_LIVE) {
      setRace({ running: false, error: 'Live mode is off. Restart with VITE_USE_LIVE=true / npm run dev:live before racing providers.' });
      return;
    }
    setRace({ running: true });
    const fire = async (provider: Provider): Promise<RaceLap> => {
      const start = performance.now();
      let streamed = '';
      const res = await chat(
        {
          messages: [{ role: 'user', content: RACE_PROMPT }],
          stream: true,
          provider,
          maxTokens: 120,
          temperature: 0.2,
        },
        (token) => {
          streamed += token;
        },
      );
      const text = (res.text || streamed).replace(/\s+/g, ' ').trim();
      if (!text) throw new Error(`${provider} returned no Gemma 4 text.`);
      return {
        totalMs: Math.round(performance.now() - start),
        ttftMs: res.timeInfo.ttftMs,
        tokensPerSec: res.timeInfo.tokensPerSec,
        text,
        simulated: Boolean(res.simulated),
      };
    };
    try {
      const [cerebras, baseline] = await Promise.all([fire('cerebras'), fire('baseline')]);
      if (!mountedRef.current) return;
      setRace({ running: false, cerebras, baseline });
    } catch (err) {
      if (!mountedRef.current) return;
      setRace({ running: false, error: err instanceof Error ? err.message : 'Gemma 4 provider race failed' });
    }
  }, [race.running]);

  const toggleRecord = useCallback(() => {
    if (recorder.recording) recorder.stop();
    else if (canvasRef.current) recorder.start(canvasRef.current);
  }, [recorder]);

  return (
    <div className="warroom-root">
      <div className="warroom-hud">
        <a className="warroom-back" href={import.meta.env.BASE_URL} aria-label="Back to the main AugurForge app">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          AugurForge
        </a>
        <span className="warroom-badge"><span className="warroom-dot" />Gemma 4 · Cerebras · Situation Room</span>
        <span className={`warroom-live-pill ${LIVE_ENV && health.hasKey ? 'is-live' : 'is-off'}`}>{liveStatusText}</span>
        <span className="warroom-stat warroom-stat-strong">TTFT {latest.ttftMs != null ? `${latest.ttftMs} ms` : 'waiting'}</span>
        <span className="warroom-stat warroom-speed-hero">{latest.tokensPerSec != null ? `${Math.round(latest.tokensPerSec).toLocaleString()} tok/s` : 'Gemma output speed pending'}</span>
        <span className="warroom-stat warroom-stat-dim">{figureCount} workers</span>
        <span className="warroom-spacer" />
        {!source && (
          <button className="warroom-live-button" onClick={run} disabled={!LIVE_ENV}>
            Run live Gemma 4
          </button>
        )}
        <button className="warroom-race-button" onClick={runRace} disabled={race.running || !LIVE_ENV}>
          {race.running ? 'Racing...' : 'Race OpenRouter'}
        </button>
        {recorder.supported && (
          <button className={`warroom-toggle ${recorder.recording ? 'recording' : ''}`} onClick={toggleRecord}>
            {recorder.recording ? 'Stop ●' : 'Record'}
          </button>
        )}
        <button className="warroom-replay" onClick={run}>Replay</button>
      </div>

      <div className="warroom-console">
        <div className="warroom-stage">
          <canvas
            ref={canvasRef}
            className="warroom-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={onDoubleClick}
          />
        </div>

        <aside className="warroom-inspector" aria-label="War Room agent inspector">
          <div className="warroom-live-card">
            <div>
              <span className="warroom-live-k">Provider mode</span>
              <strong>{pipelineLabel}</strong>
              <small>{baselineStatusText}</small>
            </div>
            {speedup && <b>{speedup}× faster on Cerebras</b>}
          </div>
          {(race.cerebras || race.baseline || race.error) && (
            <div className="warroom-race-card">
              <div className="warroom-race-grid">
                <span />
                <strong>Cerebras Gemma 4</strong>
                <strong>{health.baselineLabel}</strong>
                <span>TTFT</span>
                <b>{fmtMs(race.cerebras?.ttftMs)}</b>
                <b>{fmtMs(race.baseline?.ttftMs)}</b>
                <span>tokens/s</span>
                <b>{fmtRate(race.cerebras?.tokensPerSec)}</b>
                <b>{fmtRate(race.baseline?.tokensPerSec)}</b>
                <span>wall</span>
                <b>{fmtMs(race.cerebras?.totalMs)}</b>
                <b>{fmtMs(race.baseline?.totalMs)}</b>
              </div>
              {race.cerebras && <p><strong>Cerebras output:</strong> {race.cerebras.text}</p>}
              {race.baseline && <p><strong>OpenRouter output:</strong> {race.baseline.text}</p>}
              {race.error && <p className="warroom-error">{race.error}</p>}
            </div>
          )}
          <div className="warroom-agent-list">
            {dossiers.map((dossier) => (
              <button
                key={dossier.agentId}
                className={`warroom-agent-tab ${selectedAgentId === dossier.agentId ? 'selected' : ''}`}
                onClick={() => setSelectedAgentId(dossier.agentId)}
                title={dossier.responsibility}
              >
                <span>{dossier.label}</span>
                <small>{dossier.status}</small>
              </button>
            ))}
          </div>
          <AgentInspector dossier={selectedDossier} dossiers={dossiers} />
        </aside>
      </div>

      <form className="warroom-command" onSubmit={submitQuestion}>
        <input
          value={questionText}
          onChange={(event) => setQuestionText(event.target.value)}
          placeholder="Ask the swarm about this scenario"
          disabled={questionRunning}
        />
        <button type="submit" disabled={questionRunning || !questionText.trim()}>
          {questionRunning ? 'Thinking live' : 'Ask live swarm'}
        </button>
        <button type="button" onClick={openReport} disabled={reportBusy}>
          {reportBusy ? 'Writing report' : 'Export report'}
        </button>
        {questionError && <span className="warroom-error">{questionError}</span>}
        {history[0] && <span className="warroom-last-answer">{history[0].question}</span>}
      </form>

      {reportOpen && (
        <div className="warroom-modal" role="dialog" aria-modal="true" aria-label="War Room report preview">
          <div className="warroom-modal-panel">
            <div className="warroom-modal-head">
              <strong>Report preview</strong>
              <button type="button" onClick={() => setReportOpen(false)}>Close</button>
            </div>
            {reportBusy && <p>Gemma 4 is writing the report through Cerebras.</p>}
            {reportError && <p className="warroom-error">{reportError}</p>}
            {report && (
              <>
                <iframe title="War Room report preview" srcDoc={report.html} />
                <button
                  type="button"
                  onClick={() => downloadReportHtml(report.html, deriveBoardContext(stateRef.current, pipelineLabel, sessionRef.current).title)}
                >
                  Download HTML
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentInspector({ dossier, dossiers }: { dossier: AgentDossier | null; dossiers: AgentDossier[] }) {
  if (!dossier) {
    const complete = dossiers.filter((item) => item.status === 'complete').length;
    return (
      <div className="warroom-detail">
        <h2>Swarm Overview</h2>
        <p>{complete} of {dossiers.length} agents have completed their latest pass.</p>
        <ul>
          {dossiers.map((item) => (
            <li key={item.agentId}><strong>{item.label}:</strong> {item.conclusion}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="warroom-detail">
      <h2>{dossier.label}</h2>
      <p className="warroom-responsibility">{dossier.responsibility}</p>
      <h3>Conclusion</h3>
      <p>{dossier.conclusion}</p>
      <h3>Evidence</h3>
      <ul>{dossier.evidence.length ? dossier.evidence.map((item) => <li key={item}>{item}</li>) : <li>No evidence surfaced yet.</li>}</ul>
      <h3>Critique and judgment</h3>
      <p>{dossier.critique}</p>
      <h3>Statistics</h3>
      <ul>{dossier.stats.length ? dossier.stats.map((item) => <li key={item}>{item}</li>) : <li>No timing reported yet.</li>}</ul>
      <h3>Transcript</h3>
      <ul>{dossier.transcript.length ? dossier.transcript.map((item) => <li key={item}>{item}</li>) : <li>Waiting for streamed tokens.</li>}</ul>
    </div>
  );
}
