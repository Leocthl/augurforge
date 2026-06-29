# Explainer Polish + Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Gemma Thinking Graph and embed it into the main workbench — a compact, design-token-aligned mini-graph + persistent cascade transcript driven by the app's existing agent stream — while keeping a cinematic standalone showcase.

**Architecture:** One shared `ThinkingGraph` gains a `variant: 'embed' | 'showcase'` prop. The pure reducer (`reasoningGraph.ts`) is extended with an ordered `beats[]` array. A new `CascadeTranscript` renders the beats; a new `ReasoningPanel` composes the mini-graph + transcript and replaces the App's cascade chip strip. The App folds its existing `AgentEvent`s into a `ReasoningState` — no new Cerebras calls.

**Tech Stack:** React 18 + TypeScript, Vite, `react-force-graph-3d` + Three.js (`UnrealBloomPass`, `three-spritetext`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-explainer-polish-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/explainer/types.ts` | Node/link/state shapes + palettes. Adds `GraphVariant`, `ReasoningBeat`, `EMBED_ROLE_COLOR`. | Modify |
| `src/explainer/reasoningGraph.ts` | Pure reducer. Adds ordered `beats`, `error` branch, `agentForNode` helper, exports `AGENT_LABEL`. | Modify |
| `src/explainer/reasoningGraph.test.ts` | Unit tests for the reducer. | Create |
| `src/explainer/ThinkingGraph.tsx` | Variant-aware renderer: palette/bloom/motion/camera by variant; `preserveDrawingBuffer`; bloom resize; reduced-motion; `onNodeClick`. | Modify |
| `src/explainer/CascadeTranscript.tsx` | Presentational ordered transcript of beats. | Create |
| `src/explainer/ReasoningPanel.tsx` | Embed host: mini-graph + transcript for the right rail. | Create |
| `src/explainer/DepthExplainer.tsx` | Showcase host: uses shared components, `variant="showcase"`, node-click focus. | Modify |
| `src/explainer/explainer.css` | Transcript + variant + embed-stage + focus + responsive styles; retire gradient badge. | Modify |
| `src/explainer/index.ts` | Export new components/types. | Modify |
| `src/app/App.tsx` | Fold `AgentEvent`s into `ReasoningState`; replace agent-panel block with `<ReasoningPanel>`; drop now-unused `agentErrors`. | Modify |

---

## Task 1: Extend types + reasoning reducer with ordered beats (TDD)

**Files:**
- Modify: `src/explainer/types.ts`
- Modify: `src/explainer/reasoningGraph.ts`
- Test: `src/explainer/reasoningGraph.test.ts` (create)

- [ ] **Step 1: Add new types to `types.ts`**

Append to `src/explainer/types.ts` (after the existing `ROLE_COLOR` block):

```ts
/** Visual intensity tier for the graph: restrained embed vs cinematic showcase. */
export type GraphVariant = 'embed' | 'showcase';

/** One agent's reasoning beat in the ordered cascade transcript. */
export interface ReasoningBeat {
  agent: AgentId;
  text: string;
  status: 'streaming' | 'done' | 'error';
}

/** Restrained, design-token-aligned palette for the embedded mini-graph (hex approximations of
 *  the OKLCH tokens in src/index.css: --blue family / --amber / --green / --red). Three.Color
 *  cannot parse oklch(), so concrete hex values are used. */
export const EMBED_ROLE_COLOR: Record<NodeRole, string> = {
  input: '#dbe6f5',
  orchestrator: '#6aa3f5',
  modeler: '#4f8ff0',
  visualizer: '#3f7fe0',
  sensitivity: '#e0a34d',
  risk: '#e06857',
  explainer: '#46c08a',
  param: '#8fbdf7',
  model: '#5f97ef',
  'risk-flag': '#e06857',
  insight: '#46c08a',
};
```

- [ ] **Step 2: Write the failing reducer tests**

Create `src/explainer/reasoningGraph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEvent, initReasoning, agentForNode } from './reasoningGraph';
import type { AgentEvent } from './types';

const ev = (e: AgentEvent) => e; // shorthand

function run(events: AgentEvent[]) {
  let s = initReasoning(0);
  for (const e of events) s = applyEvent(s, e, 0);
  return s;
}

describe('reasoningGraph reducer', () => {
  it('seeds an input node and no beats', () => {
    const s = initReasoning(0);
    expect(s.beats).toEqual([]);
    expect(s.data.nodes.map((n) => n.id)).toEqual(['input']);
  });

  it('appends an ordered streaming beat on start', () => {
    const s = run([ev({ agent: 'orchestrator', status: 'start' })]);
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0]).toMatchObject({ agent: 'orchestrator', text: '', status: 'streaming' });
    expect(s.active).toBe('orchestrator');
  });

  it('accumulates token deltas into the agent beat text', () => {
    const s = run([
      ev({ agent: 'orchestrator', status: 'start' }),
      ev({ agent: 'orchestrator', status: 'token', delta: 'Routing ' }),
      ev({ agent: 'orchestrator', status: 'token', delta: 'now.' }),
    ]);
    expect(s.beats[0].text).toBe('Routing now.');
    expect(s.captions.orchestrator).toBe('Routing now.');
  });

  it('marks the beat done and preserves cascade order across agents', () => {
    const s = run([
      ev({ agent: 'orchestrator', status: 'start' }),
      ev({ agent: 'orchestrator', status: 'done', result: { templateId: 'monte-carlo' } }),
      ev({ agent: 'modeler', status: 'start' }),
    ]);
    expect(s.beats.map((b) => b.agent)).toEqual(['orchestrator', 'modeler']);
    expect(s.beats[0].status).toBe('done');
    expect(s.active).toBe('modeler');
  });

  it('marks the beat as error and stores the message', () => {
    const s = run([
      ev({ agent: 'explainer', status: 'start' }),
      ev({ agent: 'explainer', status: 'error', error: 'pipeline failed' }),
    ]);
    expect(s.beats[0]).toMatchObject({ agent: 'explainer', status: 'error', text: 'pipeline failed' });
  });

  it('re-running an agent resets its beat in place (no duplicate)', () => {
    const s = run([
      ev({ agent: 'risk', status: 'start' }),
      ev({ agent: 'risk', status: 'token', delta: 'first' }),
      ev({ agent: 'risk', status: 'done', result: { flags: [] } }),
      ev({ agent: 'risk', status: 'start' }),
      ev({ agent: 'risk', status: 'token', delta: 'second' }),
    ]);
    expect(s.beats.filter((b) => b.agent === 'risk')).toHaveLength(1);
    expect(s.beats[0].text).toBe('second');
    expect(s.beats[0].status).toBe('streaming');
  });

  it('reuses node object identity across updates so positions are preserved', () => {
    const s1 = run([ev({ agent: 'orchestrator', status: 'start' })]);
    const input1 = s1.data.nodes.find((n) => n.id === 'input');
    const s2 = applyEvent(s1, ev({ agent: 'orchestrator', status: 'token', delta: 'x' }), 0);
    const input2 = s2.data.nodes.find((n) => n.id === 'input');
    expect(input2).toBe(input1); // same reference
  });

  it('resolves a node id to its owning agent', () => {
    expect(agentForNode('orchestrator')).toBe('orchestrator');
    expect(agentForNode('model:monte-carlo')).toBe('orchestrator');
    expect(agentForNode('param:sigma')).toBe('modeler');
    expect(agentForNode('risk:0')).toBe('risk');
    expect(agentForNode('insight:explainer')).toBe('explainer');
    expect(agentForNode('insight:sensitivity')).toBe('sensitivity');
    expect(agentForNode('input')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

From `augurforge/`: `npx vitest run src/explainer/reasoningGraph.test.ts`
Expected: FAIL — `agentForNode` is not exported and `beats` is undefined.

- [ ] **Step 4: Extend the reducer in `reasoningGraph.ts`**

In `src/explainer/reasoningGraph.ts`:

(a) Export the existing `AGENT_LABEL` map (change `const AGENT_LABEL` → `export const AGENT_LABEL`).

(b) Update the imports line to include `ReasoningBeat`:
```ts
import type { AgentEvent, AgentId, GraphData, GNode, ReasoningBeat } from './types';
```

(c) Replace the `ReasoningState` interface and `initReasoning`:

```ts
export interface ReasoningState {
  data: GraphData;
  beats: ReasoningBeat[];
  captions: Record<string, string>;
  active: AgentId | null;
}

export function initReasoning(now: number): ReasoningState {
  return {
    data: {
      nodes: [{ id: 'input', label: 'Your model', role: 'input', color: ROLE_COLOR.input, size: 9, bornAt: now, pulse: false }],
      links: [],
    },
    beats: [],
    captions: {},
    active: null,
  };
}
```

(d) Replace the body of `applyEvent` (keep `spawnChildren` unchanged below it):

```ts
export function applyEvent(s: ReasoningState, e: AgentEvent, now: number): ReasoningState {
  const d: GraphData = { nodes: s.data.nodes.slice(), links: s.data.links.slice() };
  const captions = { ...s.captions };
  const beats = s.beats.slice();
  let active = s.active;
  const agent = e.agent as AgentId;

  const upsertBeat = (text: string, status: ReasoningBeat['status']) => {
    const i = beats.findIndex((b) => b.agent === agent);
    if (i === -1) beats.push({ agent, text, status });
    else beats[i] = { agent, text, status };
  };

  if (e.status === 'start') {
    ensureNode(d, { id: agent, label: AGENT_LABEL[agent], role: agent, color: ROLE_COLOR[agent], size: 11, bornAt: now, pulse: true });
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = true;
    ensureLink(d, UPSTREAM[agent], agent);
    captions[agent] = '';
    upsertBeat('', 'streaming');
    active = agent;
  } else if (e.status === 'token') {
    const text = (captions[agent] ?? '') + (e.delta ?? '');
    captions[agent] = text;
    upsertBeat(text, 'streaming');
  } else if (e.status === 'done') {
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = false;
    upsertBeat(captions[agent] ?? '', 'done');
    spawnChildren(d, agent, e, now);
    if (active === agent) active = null;
  } else if (e.status === 'error') {
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = false;
    const msg = e.error ?? 'Agent failed';
    upsertBeat(captions[agent] ? captions[agent] : msg, 'error');
    if (active === agent) active = null;
  }
  return { data: d, beats, captions, active };
}
```

(e) Add the `agentForNode` helper at the end of the file:

```ts
/** Resolve a graph node id to the agent that owns it (for transcript focus). */
export function agentForNode(id: string): AgentId | null {
  const agents: AgentId[] = ['orchestrator', 'modeler', 'visualizer', 'sensitivity', 'risk', 'explainer'];
  if ((agents as string[]).includes(id)) return id as AgentId;
  if (id.startsWith('model:')) return 'orchestrator';
  if (id.startsWith('param:')) return 'modeler';
  if (id.startsWith('risk:')) return 'risk';
  if (id === 'insight:explainer') return 'explainer';
  if (id === 'insight:sensitivity') return 'sensitivity';
  return null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

From `augurforge/`: `npx vitest run src/explainer/reasoningGraph.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/explainer/types.ts src/explainer/reasoningGraph.ts src/explainer/reasoningGraph.test.ts
git commit -m "feat(explainer): ordered reasoning beats + agentForNode in reducer"
```

---

## Task 2: Make ThinkingGraph variant-aware + add polish

**Files:**
- Modify: `src/explainer/ThinkingGraph.tsx`

- [ ] **Step 1: Replace `ThinkingGraph.tsx` with the variant-aware version**

Replace the whole file `src/explainer/ThinkingGraph.tsx` with:

```tsx
/**
 * ThinkingGraph.tsx — the live reasoning graph. [OWNER: B / explainer]
 * react-force-graph-3d (Three.js + d3-force) renders {nodes,links} live. Two visual tiers via
 * `variant`: a restrained, design-token 'embed' for the workbench rail and a cinematic 'showcase'
 * galaxy for explainer.html. Honors prefers-reduced-motion; surfaces the <canvas> for clip capture.
 */
import { useEffect, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';
import type { GNode, GraphData, GraphVariant } from './types';
import { ROLE_COLOR, EMBED_ROLE_COLOR } from './types';

// react-force-graph-3d's generics are fiddly; treat the component + ref as loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FG: any = ForceGraph3D;

interface VariantParams {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  autoRotateSpeed: number;
  cameraZ: number;
  background: string;
  labelFloor: number;
  labelCeil: number;
}

const VARIANT: Record<GraphVariant, VariantParams> = {
  showcase: { bloomStrength: 2.2, bloomRadius: 0.9, bloomThreshold: 0.1, autoRotateSpeed: 0.7, cameraZ: 230, background: '#06090f', labelFloor: 3.5, labelCeil: 8 },
  embed: { bloomStrength: 0.7, bloomRadius: 0.5, bloomThreshold: 0.2, autoRotateSpeed: 0.45, cameraZ: 150, background: '#11151c', labelFloor: 3, labelCeil: 6.5 },
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Props {
  data: GraphData;
  width: number;
  height: number;
  variant?: GraphVariant;
  /** Receives the WebGL <canvas> once mounted (used by the clip recorder). */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  /** Fired with a node id when a node is clicked (drives transcript focus). */
  onNodeClick?: (id: string) => void;
}

/** Build the floating text label for a node, coloured from the variant palette. */
function nodeLabelObject(node: GNode, color: string, floor: number, ceil: number): SpriteText {
  const sprite = new SpriteText(node.label);
  sprite.color = color;
  sprite.textHeight = Math.max(floor, Math.min(ceil, node.size * 0.7));
  sprite.fontFace = 'Inter, system-ui, sans-serif';
  sprite.fontWeight = '600';
  sprite.material.depthWrite = false;
  sprite.position.set(0, node.size + 4, 0);
  return sprite;
}

export function ThinkingGraph({ data, width, height, variant = 'showcase', onCanvas, onNodeClick }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bloomRef = useRef<any>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const v = VARIANT[variant];
  const palette = variant === 'embed' ? EMBED_ROLE_COLOR : ROLE_COLOR;

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const composer = fg.postProcessingComposer?.();
      if (composer) {
        const pass = new UnrealBloomPass(new Vector2(width || 800, height || 520), v.bloomStrength, v.bloomRadius, v.bloomThreshold);
        composer.addPass(pass);
        bloomRef.current = pass;
      }
    } catch {
      /* bloom is optional polish */
    }
    const controls = fg.controls?.();
    if (controls) {
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = v.autoRotateSpeed;
      controls.enableDamping = true;
    }
    fg.cameraPosition?.({ z: v.cameraZ });
    if (onCanvas) {
      const renderer = fg.renderer?.();
      onCanvas(renderer?.domElement ?? null);
    }
    return () => onCanvas?.(null);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the bloom pass sized to the container (was previously mount-only).
  useEffect(() => {
    bloomRef.current?.setSize?.(width || 800, height || 520);
  }, [width, height]);

  return (
    <FG
      ref={fgRef}
      width={width}
      height={height}
      graphData={data}
      backgroundColor={v.background}
      showNavInfo={false}
      nodeRelSize={4}
      rendererConfig={{ preserveDrawingBuffer: true, antialias: true }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeVal={(n: any) => n.size}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeColor={(n: any) => palette[(n as GNode).role]}
      nodeOpacity={0.95}
      nodeResolution={16}
      nodeThreeObjectExtend
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeThreeObject={(n: any) => nodeLabelObject(n as GNode, palette[(n as GNode).role], v.labelFloor, v.labelCeil)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeLabel={(n: any) => n.label}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onNodeClick={(n: any) => onNodeClick?.((n as GNode).id)}
      linkColor={() => (variant === 'embed' ? '#33455c' : '#2b4a6f')}
      linkOpacity={0.55}
      linkWidth={0.6}
      linkDirectionalParticles={reduced ? 0 : 2}
      linkDirectionalParticleWidth={1.6}
      linkDirectionalParticleSpeed={0.012}
      enableNodeDrag={false}
      warmupTicks={reduced ? 60 : 20}
      cooldownTime={reduced ? 0 : 4000}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors. (`rendererConfig` and other props pass through `FG: any`, so the loose typing stays clean.)

- [ ] **Step 3: Manual verify the showcase still renders**

Ensure the dev server is running (`npm --prefix augurforge run dev`) and open `http://localhost:<port>/explainer.html`.
Expected: graph still assembles with bloom + auto-rotate (unchanged showcase look); no console errors. (Note: this environment's preview screenshot cannot capture the WebGL surface; verify via `document.querySelector('canvas')` presence + no console errors, or eyeball the real browser.)

- [ ] **Step 4: Commit**

```bash
git add src/explainer/ThinkingGraph.tsx
git commit -m "feat(explainer): variant-aware ThinkingGraph + reduced-motion, bloom resize, node click"
```

---

## Task 3: Create the CascadeTranscript component

**Files:**
- Create: `src/explainer/CascadeTranscript.tsx`
- Modify: `src/explainer/explainer.css`

- [ ] **Step 1: Create `CascadeTranscript.tsx`**

```tsx
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
```

- [ ] **Step 2: Add transcript styles to `explainer.css`**

Append to `src/explainer/explainer.css`:

```css
/* --- Cascade transcript (shared; tuned per variant) --- */
.cascade-transcript { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cascade-transcript.is-empty { color: #8aa0bd; font-size: 12.5px; padding: 6px 2px; }
.cascade-beat { display: grid; grid-template-columns: 10px auto 1fr; align-items: baseline; gap: 8px; padding: 5px 6px; border-radius: 6px; cursor: pointer; color: #c6d3e4; }
.cascade-beat:hover { background: rgba(120, 150, 190, 0.10); }
.cascade-beat.is-focused { background: rgba(79, 143, 240, 0.16); outline: 1px solid rgba(79, 143, 240, 0.5); }
.cascade-beat.is-error .cascade-text { color: #e06857; }
.cascade-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; }
.cascade-agent { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #9fb3cf; white-space: nowrap; }
.cascade-text { font-size: 12.5px; line-height: 1.45; color: inherit; overflow-wrap: anywhere; }
.cascade-beat.is-active .cascade-text { color: #e6edf6; }
.cascade-caret { display: inline-block; width: 7px; height: 13px; margin-left: 2px; background: #4f8ff0; vertical-align: text-bottom; animation: cascade-blink 1s steps(2) infinite; }
@keyframes cascade-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cascade-caret { animation: none; } }

/* Showcase transcript sits larger over the dark stage. */
.cascade-transcript.showcase .cascade-text { font-size: 14px; }
.cascade-transcript.showcase .cascade-beat { padding: 6px 8px; }
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/explainer/CascadeTranscript.tsx src/explainer/explainer.css
git commit -m "feat(explainer): CascadeTranscript component + styles"
```

---

## Task 4: Create the ReasoningPanel embed host + exports

**Files:**
- Create: `src/explainer/ReasoningPanel.tsx`
- Modify: `src/explainer/explainer.css`
- Modify: `src/explainer/index.ts`

- [ ] **Step 1: Create `ReasoningPanel.tsx`**

```tsx
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
```

- [ ] **Step 2: Add embed-stage + meta styles to `explainer.css`**

Append to `src/explainer/explainer.css`:

```css
/* --- Embedded reasoning panel (workbench right rail) --- */
.reasoning-panel { display: flex; flex-direction: column; gap: 10px; }
.reasoning-stage { position: relative; width: 100%; height: 210px; border-radius: 8px; overflow: hidden; background: #11151c; border: 1px solid rgba(120, 150, 190, 0.14); }
.reasoning-meta { display: flex; gap: 12px; font-size: 11px; color: #8aa0bd; font-variant-numeric: tabular-nums; }
@media (max-width: 720px) { .reasoning-stage { height: 170px; } }
```

- [ ] **Step 3: Update `index.ts` exports**

Replace `src/explainer/index.ts` with:

```ts
export { DepthExplainer } from './DepthExplainer';
export { ThinkingGraph } from './ThinkingGraph';
export { CascadeTranscript } from './CascadeTranscript';
export { ReasoningPanel } from './ReasoningPanel';
export { mockEventSource, liveEventSource, type EventSource, type MockDepth } from './eventSource';
export { realPipelineSource, type Depth } from './liveSource';
export { useClipRecorder, type ClipRecorder } from './useClipRecorder';
export { applyEvent, initReasoning, agentForNode, AGENT_LABEL, type ReasoningState } from './reasoningGraph';
export type { GraphData, GNode, GLink, NodeRole, GraphVariant, ReasoningBeat } from './types';
```

- [ ] **Step 4: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/explainer/ReasoningPanel.tsx src/explainer/explainer.css src/explainer/index.ts
git commit -m "feat(explainer): ReasoningPanel embed host + exports"
```

---

## Task 5: Refactor DepthExplainer to use the shared components

**Files:**
- Modify: `src/explainer/DepthExplainer.tsx`
- Modify: `src/explainer/explainer.css`

- [ ] **Step 1: Wire the transcript + node focus into `DepthExplainer.tsx`**

In `src/explainer/DepthExplainer.tsx`:

(a) Add imports near the existing explainer imports:
```ts
import { CascadeTranscript } from './CascadeTranscript';
import { agentForNode } from './reasoningGraph';
import type { AgentId } from './types';
```

(b) Add focus state inside the component (near the other `useState`s):
```ts
const [focused, setFocused] = useState<AgentId | null>(null);
```

(c) Replace the `<ThinkingGraph data={state.data} width={size.w} height={size.h} onCanvas={onCanvas} />` line with:
```tsx
<ThinkingGraph
  data={state.data}
  width={size.w}
  height={size.h}
  variant="showcase"
  onCanvas={onCanvas}
  onNodeClick={(id) => setFocused(agentForNode(id))}
/>
```

(d) Replace the caption block — the `<div className="explainer-caption">…</div>` (currently renders `state.active` + `activeCaption`) — with:
```tsx
<div className="explainer-caption">
  <CascadeTranscript
    beats={state.beats}
    activeAgent={state.active}
    focusedAgent={focused}
    variant="showcase"
    onSelect={setFocused}
  />
</div>
```

(e) Delete the two now-unused lines above the `return`:
```ts
// const captionList = Object.values(state.captions);
// const activeCaption = state.active ? state.captions[state.active] : captionList[captionList.length - 1];
```

- [ ] **Step 2: Retire the banned gradient badge + free the caption height in `explainer.css`**

In `src/explainer/explainer.css`:

(a) Replace the `.explainer-badge` rule with:
```css
.explainer-badge { font-size: 11px; font-weight: 700; color: #04121f; background: #4f8ff0; padding: 3px 11px; border-radius: 999px; }
```

(b) Replace the `.explainer-caption` rule with (drop the `min-height`, allow scroll):
```css
.explainer-caption { font-size: 15px; line-height: 1.5; max-width: 72ch; max-height: 168px; overflow-y: auto; }
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors (no remaining references to `captionList`/`activeCaption`).

- [ ] **Step 4: Manual verify the showcase**

Open `http://localhost:<port>/explainer.html`.
Expected: graph assembles; the transcript lists each agent beat in order, the active one carrying a caret while prior beats persist; clicking a node highlights/scrolls its beat; badge is solid blue; no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/explainer/DepthExplainer.tsx src/explainer/explainer.css
git commit -m "feat(explainer): DepthExplainer uses shared transcript + showcase variant; retire gradient badge"
```

---

## Task 6: Integrate ReasoningPanel into the main App

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Import the explainer pieces**

In `src/app/App.tsx`, add after the existing local imports (near the `SpeedHud` import):
```ts
import { ReasoningPanel, initReasoning, applyEvent, type ReasoningState } from '../explainer';
```

- [ ] **Step 2: Add reasoning state**

Inside `App()`, next to the other `useState` declarations (after `const [building, setBuilding] = useState(false);`):
```ts
const [reasoning, setReasoning] = useState<ReasoningState>(() => initReasoning(performance.now()));
```

- [ ] **Step 3: Fold AgentEvents into the reasoning state**

In the `onEvent` `useCallback`, add this as the FIRST line of the body (so every event updates the graph):
```ts
setReasoning((s) => applyEvent(s, e, performance.now()));
```

- [ ] **Step 4: Reset reasoning at the start of a full cascade**

In `runCascade`, alongside the other resets (after `setRisk({ flags: [] });`):
```ts
setReasoning(initReasoning(performance.now()));
```
(Do NOT reset it in `runTweakWithAbort` — a tweak should update the existing graph in place.)

- [ ] **Step 5: Replace the agent-panel block with `<ReasoningPanel>`**

In the JSX, replace the entire `<div className="panel agent-panel">…</div>` block (the cascade chips and the `agent-errors` list — currently around `App.tsx:733-758`) with:
```tsx
<ReasoningPanel state={reasoning} building={building} latest={latestTime} />
```

- [ ] **Step 6: Remove the now-unused `agentErrors` state**

Errors now appear as error beats in the transcript. Delete these four lines:
- `const [agentErrors, setAgentErrors] = useState<Partial<Record<AgentId, string>>>({});`
- In `onEvent`: `if (e.status === 'start') setAgentErrors((prev) => ({ ...prev, [e.agent]: undefined }));`
- In `onEvent`: `if (e.status === 'error') setAgentErrors((prev) => ({ ...prev, [e.agent]: e.error ?? 'Agent failed' }));`
- In `runCascade`: `setAgentErrors({});`

(Keep the `agents` / `setAgents` state — it still gates the explainer/sensitivity/risk text panels and the stream caret.)

- [ ] **Step 7: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors and no unused-symbol errors. `AgentId` is still used (the `AGENTS` array typing and the `agents` record), so keep its import.

- [ ] **Step 8: Manual verify the embed**

Open `http://localhost:<port>/` (the main app). On load the cascade runs.
Expected:
- The right-rail "Gemma agent cascade" panel now shows the compact mini-graph + transcript (not LED chips).
- Drag a slider and release → only sensitivity/risk/explainer beats re-stream; build nodes persist; **no extra network calls** beyond the existing tweak (check the Network tab).
- Palette is restrained (blue/amber/green/red), no neon gradient.

- [ ] **Step 9: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(app): embed ReasoningPanel in right rail, fed by the live agent cascade"
```

---

## Task 7: Final design-compliance pass + full verification

**Files:**
- Modify: `src/explainer/explainer.css` (focus states + responsive)
- Modify: `src/explainer/CascadeTranscript.tsx` (keyboard focus)

- [ ] **Step 1: Add focus-visible rings + responsive control wrapping**

Append to `src/explainer/explainer.css`:
```css
/* --- Accessibility + responsive polish --- */
.explainer-seg-btn:focus-visible,
.explainer-record:focus-visible,
.explainer-replay:focus-visible,
.cascade-beat:focus-visible { outline: 2px solid #4f8ff0; outline-offset: 2px; }
@media (max-width: 720px) {
  .explainer-controls { flex-wrap: wrap; gap: 8px; right: 10px; top: 10px; }
  .explainer-caption { max-height: 132px; }
}
```

- [ ] **Step 2: Make transcript rows keyboard-focusable**

In `src/explainer/CascadeTranscript.tsx`, add `tabIndex={0}` and an `onKeyDown` to the `<li>`:
```tsx
<li
  key={b.agent}
  ref={isFocused ? focusedRef : undefined}
  tabIndex={0}
  className={`cascade-beat${isActive ? ' is-active' : ''}${isFocused ? ' is-focused' : ''}${b.status === 'error' ? ' is-error' : ''}`}
  onClick={() => onSelect?.(b.agent)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(b.agent); } }}
>
```

- [ ] **Step 3: Run the full test suite**

Run: `npm --prefix augurforge test`
Expected: all tests pass (including `reasoningGraph.test.ts`).

- [ ] **Step 4: Typecheck**

Run: `npm --prefix augurforge run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verify reduced-motion on both surfaces**

In devtools, emulate `prefers-reduced-motion: reduce` (Rendering tab), reload `explainer.html` and the main app.
Expected: no auto-rotate, no link particles, no blinking caret; graph still assembles to a settled layout; transcript still updates.

- [ ] **Step 6: Commit**

```bash
git add src/explainer/explainer.css src/explainer/CascadeTranscript.tsx
git commit -m "feat(explainer): focus states, keyboard transcript, responsive controls"
```

---

## Self-Review Notes (resolved during planning)

- **Spec coverage:** placement (Task 6) · two-tier visuals (Task 2 variant table) · transcript (Tasks 1,3,5,6) · token palette + badge (Tasks 1,5) · reduced-motion (Tasks 2,3,7) · preserveDrawingBuffer + bloom resize (Task 2) · focus/responsive (Task 7) · tests (Task 1). All spec sections map to a task.
- **Type consistency:** `ReasoningBeat`, `GraphVariant`, `EMBED_ROLE_COLOR` defined in Task 1 `types.ts`; consumed identically in Tasks 2–6. `agentForNode` / `AGENT_LABEL` / `ReasoningState` exported in Tasks 1 & 4, imported in Tasks 3–6. `ThinkingGraph` prop names (`variant`, `onNodeClick`) match between definition (Task 2) and all call sites (Tasks 4, 5).
- **No placeholders:** every code step shows full code; every run step shows the command + expected result.
```
