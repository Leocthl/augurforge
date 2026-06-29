/**
 * WarRoom.tsx — the Gemma swarm as a CROWDED, ANIMATED canvas-2D "situation room". [OWNER: B / warroom]
 *
 * A single <canvas> + requestAnimationFrame loop (simfrancisco-style) renders an office war room:
 * six agent GROUPS, each a wandering CLUSTER of stick figures around a central situation board.
 * Idle groups drift slowly + dim; the agent currently thinking brightens, glows, moves energetically
 * and shows a streamed thought bubble. It reuses the explainer's event sources + reducer (DRY) — the
 * same AgentEvent cascade the thinking-graph consumes. Mock-first; real-pipeline toggle.
 *
 * A DOM HUD floats above the canvas (badge, TTFT, tokens/sec, Mock/Real toggle, Replay, Record).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, AgentId, OnEvent } from '../core/contract';
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
import {
  AGENT_ORDER,
  buildCrowd,
  stepGroup,
  totalFigures,
  type CrowdLayout,
  type GroupStatus,
} from './crowd';
import { drawScene, type Scene } from './draw';

const SCENARIO_TITLE = 'Portfolio ruin risk — Monte Carlo (GBM)';

/** Derive each group's live status from the reasoning reducer state. */
function deriveStatuses(state: ReasoningState): Record<string, GroupStatus> {
  const out: Record<string, GroupStatus> = {};
  for (const id of AGENT_ORDER) {
    const node = state.data.nodes.find((n) => n.id === id);
    const caption = state.captions[id] ?? '';
    const started = !!node || id in state.captions;
    const thinking = node?.pulse === true;
    const done = !!node && node.pulse === false;
    out[id] = { started, thinking, done, caption };
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

export function WarRoom({ source }: { source?: EventSource }) {
  const [latest, setLatest] = useState<{ ttftMs?: number; tokensPerSec?: number }>({});
  const [useReal, setUseReal] = useState(false);
  const [figureCount, setFigureCount] = useState(0);

  const stopRef = useRef<null | (() => void)>(null);
  const stateRef = useRef<ReasoningState>(initReasoning(performance.now()));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<CrowdLayout | null>(null);
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

  // --- canvas: DPR-aware sizing, resize handling, rAF loop --------------------
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
      // Rebuild crowd deterministically for the new size (positions reseed identically).
      layoutRef.current = buildCrowd(cssW, cssH, ROLE_COLOR as Record<AgentId, string>);
      setFigureCount(totalFigures(layoutRef.current));
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const start = performance.now();
    let prev = start;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;
      const layout = layoutRef.current;
      if (layout) {
        const statuses = deriveStatuses(stateRef.current);
        for (const group of layout.groups) {
          stepGroup(group, statuses[group.id], dt);
        }
        const scene: Scene = {
          layout,
          statuses,
          activeId: stateRef.current.active,
          scenarioTitle: SCENARIO_TITLE,
          latestMetric: deriveMetric(stateRef.current),
          t,
          cssWidth: cssW,
        };
        drawScene(ctx, scene);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // --- event source lifecycle -------------------------------------------------
  useEffect(() => {
    run();
    return () => stopRef.current?.();
  }, [run]);

  const toggleRecord = useCallback(() => {
    if (recorder.recording) {
      recorder.stop();
    } else if (canvasRef.current) {
      recorder.start(canvasRef.current);
    }
  }, [recorder]);

  return (
    <div className="warroom-root">
      <div className="warroom-hud">
        <span className="warroom-badge">Gemma 4 · Cerebras · Situation Room</span>
        <span className="warroom-stat">
          TTFT {latest.ttftMs != null ? `${latest.ttftMs} ms` : '—'}
        </span>
        <span className="warroom-stat">
          {latest.tokensPerSec != null ? `${Math.round(latest.tokensPerSec)} tok/s` : ''}
        </span>
        <span className="warroom-stat warroom-stat-dim">{figureCount} figures</span>
        <span className="warroom-spacer" />
        {!source && (
          <button className="warroom-toggle" onClick={() => setUseReal((v) => !v)}>
            {useReal ? 'Real pipeline' : 'Mock cascade'}
          </button>
        )}
        {recorder.supported && (
          <button
            className={`warroom-toggle ${recorder.recording ? 'recording' : ''}`}
            onClick={toggleRecord}
          >
            {recorder.recording ? 'Stop ●' : 'Record'}
          </button>
        )}
        <button className="warroom-replay" onClick={run}>
          Replay
        </button>
      </div>

      <div className="warroom-stage">
        <canvas ref={canvasRef} className="warroom-canvas" />
      </div>
    </div>
  );
}
