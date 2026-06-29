/**
 * WarRoom.tsx — the Gemma swarm as a pixel-sprite "situation room". [OWNER: B / warroom]
 *
 * A recreation of simfrancisco's canvas swarm, re-skinned as an office: six agent GROUPS of
 * Gemma-authored pixel workers (baked from characters.json via bakeAtlas) wander their desks around
 * a central situation board. The real AgentEvent cascade (reused explainer plumbing) drives the
 * scene — the active group lights up, the camera pushes in, and its streamed tokens fill a thought
 * bubble. It is an aesthetic MULTI-AGENT VIEW of the same process the main app runs. Mock-first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, OnEvent } from '../core/contract';
import {
  applyEvent,
  initReasoning,
  mockEventSource,
  realPipelineSource,
  useClipRecorder,
  type EventSource,
  type ReasoningState,
} from '../explainer';
import { ROLE_COLOR } from '../explainer/types';
import { AGENT_ORDER } from './agents';
import { buildScene, type SceneLayout } from './scene';
import { buildCrowd, stepWorker, totalFigures, type Crowd, type GroupStatus } from './crowd';
import { loadGroupTraits } from './traits';
import { bakeAtlas } from './bakeAtlas';
import { ambientFor } from './bubbles';
import { drawScene, type AmbientBubble, type CameraView, type SceneState } from './draw';

const SCENARIO_TITLE = 'Portfolio ruin risk — Monte Carlo (GBM)';
const ROLE = ROLE_COLOR as Record<string, string>;

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

/** Best-effort "latest metric" for the board, read from the graph the reducer grows. */
function deriveMetric(state: ReasoningState): { label: string; value: string } | null {
  const nodes = state.data.nodes;
  const riskCount = nodes.filter((n) => n.id.startsWith('risk:')).length;
  if (riskCount > 0) return { label: 'Risk flags raised', value: String(riskCount) };
  const paramCount = nodes.filter((n) => n.id.startsWith('param:')).length;
  if (paramCount > 0) return { label: 'Parameters inferred', value: String(paramCount) };
  const model = nodes.find((n) => n.id.startsWith('model:'));
  if (model) return { label: 'Model selected', value: model.label };
  return null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function clampCam(x: number, y: number, zoom: number, w: number, h: number): CameraView {
  const hw = w / (2 * zoom);
  const hh = h / (2 * zoom);
  return {
    zoom,
    x: hw * 2 <= w ? Math.max(hw, Math.min(w - hw, x)) : w / 2,
    y: hh * 2 <= h ? Math.max(hh, Math.min(h - hh, y)) : h / 2,
  };
}

export function WarRoom({ source }: { source?: EventSource }) {
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [useReal, setUseReal] = useState(false);
  const [figureCount, setFigureCount] = useState(0);

  const stopRef = useRef<null | (() => void)>(null);
  const stateRef = useRef<ReasoningState>(initReasoning(performance.now()));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneLayout | null>(null);
  const crowdRef = useRef<Crowd | null>(null);
  const atlasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef<CameraView>({ x: 0, y: 0, zoom: 1 });
  const ambientRef = useRef<{ at: number; picks: AmbientBubble[] }>({ at: -1e9, picks: [] });
  const rafRef = useRef<number>(0);
  const recorder = useClipRecorder(30);

  const onEvent: OnEvent = useCallback((e: AgentEvent) => {
    stateRef.current = applyEvent(stateRef.current, e, performance.now());
    if (e.timeInfo) setLatest({ ttftMs: e.timeInfo.ttftMs, tokensPerSec: e.timeInfo.tokensPerSec });
  }, []);

  const run = useCallback(() => {
    stopRef.current?.();
    stateRef.current = initReasoning(performance.now());
    setLatest({});
    const src = source ?? (useReal ? realPipelineSource('entry') : mockEventSource());
    stopRef.current = src.start(onEvent);
  }, [source, useReal, onEvent]);

  // Bake the Gemma-authored sprite atlas once on mount.
  useEffect(() => {
    atlasRef.current = bakeAtlas(loadGroupTraits());
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
      camRef.current = { x: cssW / 2, y: cssH / 2, zoom: 1 };
      setFigureCount(totalFigures(crowdRef.current));
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const start = performance.now();
    let prev = start;

    const pickAmbient = (t: number, crowd: Crowd, activeId: string | null): AmbientBubble[] => {
      const cur = ambientRef.current;
      if (t * 1000 - cur.at < 2600 && cur.picks.length) return cur.picks;
      const cycle = Math.floor((t * 1000) / 2600);
      const picks: AmbientBubble[] = [];
      crowd.groups.forEach((g, gi) => {
        if (picks.length >= 5 || g.id === activeId || g.workers.length === 0) return;
        const wi = (cycle * 3 + gi * 7) % g.workers.length;
        picks.push({ gi, wi, text: ambientFor(gi * 13 + wi + cycle) });
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
          const energetic = statuses[g.id]?.thinking === true;
          for (const w of g.workers) stepWorker(w, scene, energetic, dt);
        }

        const active = activeId ? crowd.groups.find((g) => g.id === activeId) : undefined;
        const target = active
          ? clampCam(active.home.x, active.home.y, 1.5, cssW, cssH)
          : { x: cssW / 2, y: cssH / 2, zoom: 1 };
        const k = 1 - Math.pow(0.0001, dt);
        const cam = camRef.current;
        camRef.current = {
          x: lerp(cam.x, target.x, k),
          y: lerp(cam.y, target.y, k),
          zoom: lerp(cam.zoom, target.zoom, k),
        };

        const ss: SceneState = {
          scene,
          crowd,
          atlas: atlasRef.current,
          statuses,
          captions: stateRef.current.captions,
          activeId,
          cam: camRef.current,
          cssW,
          cssH,
          t,
          scenarioTitle: SCENARIO_TITLE,
          latestMetric: deriveMetric(stateRef.current),
          ambient: pickAmbient(t, crowd, activeId),
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
        <span className="warroom-stat">TTFT {latest.ttftMs != null ? `${latest.ttftMs} ms` : '—'}</span>
        <span className="warroom-stat">{latest.tokensPerSec != null ? `${Math.round(latest.tokensPerSec)} tok/s` : ''}</span>
        <span className="warroom-stat warroom-stat-dim">{figureCount} workers</span>
        <span className="warroom-spacer" />
        {!source && (
          <button className="warroom-toggle" onClick={() => setUseReal((v) => !v)}>
            {useReal ? 'Real pipeline' : 'Mock cascade'}
          </button>
        )}
        {recorder.supported && (
          <button className={`warroom-toggle ${recorder.recording ? 'recording' : ''}`} onClick={toggleRecord}>
            {recorder.recording ? 'Stop ●' : 'Record'}
          </button>
        )}
        <button className="warroom-replay" onClick={run}>Replay</button>
      </div>

      <div className="warroom-stage">
        <canvas ref={canvasRef} className="warroom-canvas" />
      </div>
    </div>
  );
}