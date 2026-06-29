# War Room Console Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved War Room console expansion: selectable agents, hover responsibilities, swarm question runs, panic movement, report preview/download, and map-like canvas navigation.

**Architecture:** Keep the work inside the War Room lane. Add small War Room-only modules for dossier derivation, camera math, question runs, and report export, then wire them into `WarRoom.tsx`, `draw.ts`, `scene.ts`, `crowd.ts`, `bubbles.ts`, and `warroom.css`. Live chat/report calls reuse the existing `src/core/cerebras.ts` `chat()` API so no server or shared owner-A file edits are required.

**Tech Stack:** React 18, TypeScript strict mode, Vite, Vitest, Canvas 2D, existing AugurForge `AgentEvent` stream, existing Cerebras-compatible `chat()` client.

---

## File Structure

- Create `src/warroom/agentDossier.ts`: derive agent responsibilities, conclusions, evidence, critique, stats, transcript, and timing from `ReasoningState`, group statuses, session snapshot, and per-agent telemetry.
- Create `src/warroom/agentDossier.test.ts`: focused Vitest coverage for dossier derivation.
- Create `src/warroom/camera.ts`: map-style camera math, screen/world conversion, zoom-at-cursor, pan, focus, and clamps.
- Create `src/warroom/camera.test.ts`: Vitest coverage for zoom/pan/focus math.
- Create `src/warroom/questionRun.ts`: one-request Gemma swarm question adapter, tagged streaming parser, mock offline run, and `AgentEvent` emission.
- Create `src/warroom/questionRun.test.ts`: parser and mock event coverage.
- Create `src/warroom/reportExport.ts`: report brief builder, Gemma narrative call, HTML assembly, and browser download helper.
- Create `src/warroom/reportExport.test.ts`: HTML escaping and required report label coverage.
- Modify `src/warroom/agents.ts`: add static responsibilities and panic lines while preserving the intentional muted `GROUP_COLOR`.
- Modify `src/warroom/scene.ts`: add desk hit testing, worker hit testing support types, and selected/hover canvas metadata.
- Modify `src/warroom/draw.ts`: draw desk selection highlights, hover responsibility labels, panic bubbles, and use camera type from `camera.ts`.
- Modify `src/warroom/crowd.ts`: add panic movement mode and settle-home behavior after question runs.
- Modify `src/warroom/bubbles.ts`: add role-aware idle/panic line helpers.
- Modify `src/warroom/WarRoom.tsx`: wire selection, inspector, agent list, chat, report modal, camera input, keyboard controls, and question-run state.
- Modify `src/warroom/warroom.css`: style the console shell, right inspector, bottom command strip, modal, and responsive layout. Do not edit `src/index.css`.

## Guardrails

- Stage only files changed by the current task. Leave unrelated untracked files such as `.playwright-mcp/`, `dist-explainer/`, and `nul.css` alone.
- Do not edit `src/app/**`, `src/core/**`, `server/**`, shared Vite config, or `src/index.css`.
- Do not change `GROUP_COLOR` values in `src/warroom/agents.ts`.
- Keep mock mode fully offline. Live mode must use the existing proxy-backed `chat()` path through `src/core/cerebras.ts`.
- Do not print `.env` contents.
- Verify canvas visuals in a real visible browser tab or with an explicit manual tick; hidden tabs pause `requestAnimationFrame`.

## Parallel Execution Notes

- Use `superpowers:subagent-driven-development` for implementation.
- Safe first wave: Task 1 and Task 2 can run in parallel because one owns dossier metadata and the other owns camera math.
- Safe second wave: Task 4 can run after Task 1; Task 3 can run after Tasks 1 and 2. These may run in parallel because they touch different new modules plus separate War Room renderer/motion files.
- Task 5 runs after Task 4 because it imports `QuestionTurn`.
- Task 6 runs only after Tasks 1-5 land because it integrates every prior module into `WarRoom.tsx` and `warroom.css`.
- Task 7 is the adversarial verification pass: a fresh reviewer should reload the visible browser, inspect console output, test interactions, and check for accidental edits outside the War Room lane.

---

### Task 1: Agent Metadata And Dossiers

**Files:**
- Modify: `src/warroom/agents.ts`
- Create: `src/warroom/agentDossier.ts`
- Create: `src/warroom/agentDossier.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/warroom/agentDossier.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AgentId, TimeInfo } from '../core/contract';
import type { ReasoningState } from '../explainer';
import type { GroupStatus } from './crowd';
import { deriveAgentDossiers } from './agentDossier';
import { AGENT_RESPONSIBILITY, AGENT_ORDER } from './agents';

function stateFor(captions: Partial<Record<AgentId, string>>): ReasoningState {
  return {
    data: {
      nodes: [
        { id: 'input', label: 'Your model', role: 'input', color: '#111', size: 9, bornAt: 1, pulse: false },
        { id: 'risk', label: 'Risk', role: 'risk', color: '#333', size: 11, bornAt: 2, pulse: false },
        { id: 'risk:0', label: 'warning: left tail widened', role: 'risk-flag', color: '#944', size: 6, bornAt: 3, pulse: false },
        { id: 'metric:explainer:p-ruin', label: 'P(ruin): 2.3%', role: 'metric', color: '#449', size: 5, bornAt: 4, pulse: false },
      ],
      links: [],
    },
    beats: [
      { agent: 'risk', text: 'Ruin probability sits inside the buffer.', status: 'done' },
      { agent: 'explainer', text: 'Most paths grow, but tail loss remains visible.', status: 'done' },
    ],
    captions: captions as Record<string, string>,
    active: null,
  };
}

function statuses(): Record<string, GroupStatus> {
  return Object.fromEntries(
    AGENT_ORDER.map((agent) => [
      agent,
      {
        started: agent === 'risk' || agent === 'explainer',
        thinking: false,
        done: agent === 'risk' || agent === 'explainer',
        caption: agent === 'risk' ? 'Ruin probability sits inside the buffer.' : '',
      },
    ]),
  );
}

describe('deriveAgentDossiers', () => {
  it('fills static responsibilities for every agent', () => {
    const dossiers = deriveAgentDossiers({
      state: stateFor({}),
      statuses: statuses(),
      latestByAgent: {},
      session: null,
    });

    expect(dossiers).toHaveLength(6);
    expect(dossiers[0].responsibility).toBe(AGENT_RESPONSIBILITY.orchestrator);
  });

  it('puts the conclusion first and preserves evidence, stats, transcript, and timing', () => {
    const latest: Partial<Record<AgentId, TimeInfo>> = {
      risk: { ttftMs: 12, tokensPerSec: 2100, totalTokens: 20, totalMs: 44 },
    };

    const risk = deriveAgentDossiers({
      state: stateFor({ risk: 'Ruin probability sits inside the buffer.' }),
      statuses: statuses(),
      latestByAgent: latest,
      session: null,
    }).find((dossier) => dossier.agentId === 'risk');

    expect(risk?.conclusion).toContain('Ruin probability');
    expect(risk?.evidence).toContain('warning: left tail widened');
    expect(risk?.stats).toContain('TTFT 12 ms');
    expect(risk?.stats).toContain('2100 tok/s');
    expect(risk?.transcript[0]).toContain('Ruin probability');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```bash
npm run test -- src/warroom/agentDossier.test.ts
```

Expected: FAIL because `src/warroom/agentDossier.ts` and `AGENT_RESPONSIBILITY` do not exist.

- [ ] **Step 3: Add static agent responsibilities and panic lines**

Append these exports to `src/warroom/agents.ts` without changing `GROUP_COLOR`:

```ts
export const AGENT_RESPONSIBILITY: Record<AgentId, string> = {
  orchestrator: 'Routes the user question, scenario, and uploaded evidence into a compact model plan.',
  modeler: 'Maps raw inputs into model parameters, assumptions, and deterministic browser math.',
  visualizer: 'Chooses the clearest 2D or 3D view and explains what the user should inspect first.',
  sensitivity: 'Tests which assumptions move the outcome, especially volatility, drift, horizon, and stress knobs.',
  risk: 'Reviews tail behavior, buffer breaches, warning flags, and decision-support caveats.',
  explainer: 'Turns the swarm result into plain English while keeping the limits visible.',
};

export const AGENT_PANIC_LINES: Record<AgentId, string[]> = {
  orchestrator: [
    'Routing year-two chaos. Please keep receipts.',
    'Opening a clean incident channel for one question.',
  ],
  modeler: [
    'Reopening assumptions with a fresh pen.',
    'Checking whether the math is being dramatic or useful.',
  ],
  visualizer: [
    'If this becomes a waterfall chart, I am blaming variance.',
    'Clearing screen space for the suspicious curve.',
  ],
  sensitivity: [
    'Stress knobs unlocked. Nobody touch drift yet.',
    'Perturbing the input and pretending this is calm.',
  ],
  risk: [
    'Year-two loss? Fine, reopening the tail cabinet.',
    'Putting a highlighter on the ugly percentile.',
  ],
  explainer: [
    'Converting panic into plain English.',
    'Removing jargon before it gets into the minutes.',
  ],
};
```

- [ ] **Step 4: Implement dossier derivation**

Create `src/warroom/agentDossier.ts`:

```ts
import type { AgentId, TimeInfo } from '../core/contract';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import type { ReasoningState } from '../explainer';
import type { GroupStatus } from './crowd';
import { AGENT_LABEL, AGENT_ORDER, AGENT_RESPONSIBILITY } from './agents';

export interface AgentDossier {
  agentId: AgentId;
  label: string;
  responsibility: string;
  status: 'waiting' | 'thinking' | 'complete' | 'error';
  conclusion: string;
  evidence: string[];
  critique: string;
  stats: string[];
  transcript: string[];
  timeInfo?: TimeInfo;
}

export interface DossierInput {
  state: ReasoningState;
  statuses: Record<string, GroupStatus>;
  latestByAgent: Partial<Record<AgentId, TimeInfo>>;
  session: AugurForgeSessionSnapshot | null;
}

function clean(text: unknown, fallback = ''): string {
  if (typeof text !== 'string') return fallback;
  return text.replace(/\s+/g, ' ').trim() || fallback;
}

function nodeOwner(id: string): AgentId | null {
  if ((AGENT_ORDER as string[]).includes(id)) return id as AgentId;
  if (id.startsWith('param:')) return 'modeler';
  if (id.startsWith('model:')) return 'orchestrator';
  if (id.startsWith('risk:')) return 'risk';
  const parts = id.split(':');
  const candidate = parts[1];
  return candidate && (AGENT_ORDER as string[]).includes(candidate) ? (candidate as AgentId) : null;
}

function evidenceFor(state: ReasoningState, agentId: AgentId): string[] {
  return state.data.nodes
    .filter((node) => node.id !== agentId && nodeOwner(node.id) === agentId)
    .map((node) => clean(node.label))
    .filter(Boolean)
    .slice(0, 6);
}

function transcriptFor(state: ReasoningState, agentId: AgentId, caption: string): string[] {
  const beat = state.beats.find((item) => item.agent === agentId);
  return [caption, beat?.text]
    .map((item) => clean(item))
    .filter((item, index, arr) => item && arr.indexOf(item) === index)
    .slice(0, 4);
}

function statusFor(status?: GroupStatus): AgentDossier['status'] {
  if (!status?.started) return 'waiting';
  if (status.thinking) return 'thinking';
  if (status.done) return 'complete';
  return 'waiting';
}

function critiqueFor(agentId: AgentId, session: AugurForgeSessionSnapshot | null, evidence: string[]): string {
  if (agentId === 'risk') return evidence.length ? 'Risk review is grounded in the current flags; inspect the tail before treating the result as stable.' : 'Risk review has not found a surfaced flag yet.';
  if (agentId === 'sensitivity') return 'Judgment focuses on which assumption moves the deterministic browser math the most.';
  if (agentId === 'modeler') return session?.input?.attachments?.length ? 'Judgment should preserve the source mapping from uploaded evidence to parameters.' : 'Judgment depends on the current default scenario inputs.';
  if (agentId === 'visualizer') return 'Judgment favors the chart view that exposes distribution shape and tail behavior fastest.';
  if (agentId === 'orchestrator') return 'Judgment is limited to routing and framing; downstream agents own numerical interpretation.';
  return 'Judgment translates the swarm result into decision-support language, not advice.';
}

function statsFor(timeInfo: TimeInfo | undefined, status: GroupStatus | undefined, session: AugurForgeSessionSnapshot | null): string[] {
  const stats: string[] = [];
  if (status?.started) stats.push(status.done ? 'Status complete' : status.thinking ? 'Status thinking' : 'Status started');
  if (timeInfo?.ttftMs !== undefined) stats.push(`TTFT ${timeInfo.ttftMs} ms`);
  if (timeInfo?.tokensPerSec !== undefined) stats.push(`${Math.round(timeInfo.tokensPerSec)} tok/s`);
  if (timeInfo?.totalTokens !== undefined) stats.push(`${timeInfo.totalTokens} tokens`);
  if (session?.metrics?.[0]) stats.push(`${session.metrics[0].label} ${session.metrics[0].value}`);
  return stats.slice(0, 5);
}

export function deriveAgentDossiers(input: DossierInput): AgentDossier[] {
  return AGENT_ORDER.map((agentId) => {
    const status = input.statuses[agentId];
    const caption = clean(status?.caption ?? input.state.captions[agentId]);
    const evidence = evidenceFor(input.state, agentId);
    const conclusion = caption || evidence[0] || `${AGENT_LABEL[agentId]} is waiting for the swarm context.`;
    const timeInfo = input.latestByAgent[agentId];
    return {
      agentId,
      label: AGENT_LABEL[agentId],
      responsibility: AGENT_RESPONSIBILITY[agentId],
      status: statusFor(status),
      conclusion,
      evidence,
      critique: critiqueFor(agentId, input.session, evidence),
      stats: statsFor(timeInfo, status, input.session),
      transcript: transcriptFor(input.state, agentId, caption),
      timeInfo,
    };
  });
}
```

- [ ] **Step 5: Run the dossier tests**

Run:

```bash
npm run test -- src/warroom/agentDossier.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/warroom/agents.ts src/warroom/agentDossier.ts src/warroom/agentDossier.test.ts
git commit -m "feat: derive war room agent dossiers"
```

---

### Task 2: Camera Math And Hit Testing

**Files:**
- Create: `src/warroom/camera.ts`
- Create: `src/warroom/camera.test.ts`
- Modify: `src/warroom/scene.ts`
- Modify: `src/warroom/draw.ts`
- Modify: `src/warroom/WarRoom.tsx`

- [ ] **Step 1: Write the failing camera tests**

Create `src/warroom/camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clampCamera, focusCamera, panCamera, screenToWorld, worldToScreen, zoomAt } from './camera';

const bounds = { width: 1200, height: 800, viewW: 600, viewH: 400 };

describe('camera helpers', () => {
  it('keeps world point stable when zooming around the cursor', () => {
    const cam = { x: 600, y: 400, zoom: 1 };
    const before = screenToWorld(cam, 450, 220, bounds.viewW, bounds.viewH);
    const next = zoomAt(cam, 450, 220, 1.6, bounds);
    const after = screenToWorld(next, 450, 220, bounds.viewW, bounds.viewH);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('pans in screen space and clamps to room bounds', () => {
    const cam = panCamera({ x: 600, y: 400, zoom: 2 }, -100, 50, bounds);
    expect(cam.x).toBe(650);
    expect(cam.y).toBe(375);
    expect(clampCamera({ x: -999, y: 999, zoom: 1 }, bounds).x).toBeGreaterThan(0);
  });

  it('focuses a desk and converts world back to screen', () => {
    const cam = focusCamera({ x: 900, y: 300 }, 1.45, bounds);
    const point = worldToScreen(cam, 900, 300, bounds.viewW, bounds.viewH);
    expect(point.x).toBeCloseTo(300, 3);
    expect(point.y).toBeCloseTo(200, 3);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```bash
npm run test -- src/warroom/camera.test.ts
```

Expected: FAIL because `src/warroom/camera.ts` does not exist.

- [ ] **Step 3: Implement camera helpers**

Create `src/warroom/camera.ts`:

```ts
export interface CameraView {
  x: number;
  y: number;
  zoom: number;
}

export interface CameraBounds {
  width: number;
  height: number;
  viewW: number;
  viewH: number;
}

export interface Point {
  x: number;
  y: number;
}

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 2.3;

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function clampCamera(cam: CameraView, bounds: CameraBounds): CameraView {
  const zoom = clampZoom(cam.zoom);
  const halfW = bounds.viewW / (2 * zoom);
  const halfH = bounds.viewH / (2 * zoom);
  const minX = Math.min(bounds.width / 2, halfW);
  const maxX = Math.max(bounds.width / 2, bounds.width - halfW);
  const minY = Math.min(bounds.height / 2, halfH);
  const maxY = Math.max(bounds.height / 2, bounds.height - halfH);
  return {
    x: Math.max(minX, Math.min(maxX, cam.x)),
    y: Math.max(minY, Math.min(maxY, cam.y)),
    zoom,
  };
}

export function screenToWorld(cam: CameraView, sx: number, sy: number, viewW: number, viewH: number): Point {
  return {
    x: (sx - viewW / 2) / cam.zoom + cam.x,
    y: (sy - viewH / 2) / cam.zoom + cam.y,
  };
}

export function worldToScreen(cam: CameraView, wx: number, wy: number, viewW: number, viewH: number): Point {
  return {
    x: (wx - cam.x) * cam.zoom + viewW / 2,
    y: (wy - cam.y) * cam.zoom + viewH / 2,
  };
}

export function zoomAt(cam: CameraView, sx: number, sy: number, zoomFactor: number, bounds: CameraBounds): CameraView {
  const before = screenToWorld(cam, sx, sy, bounds.viewW, bounds.viewH);
  const zoom = clampZoom(cam.zoom * zoomFactor);
  const next = {
    x: before.x - (sx - bounds.viewW / 2) / zoom,
    y: before.y - (sy - bounds.viewH / 2) / zoom,
    zoom,
  };
  return clampCamera(next, bounds);
}

export function panCamera(cam: CameraView, dxScreen: number, dyScreen: number, bounds: CameraBounds): CameraView {
  return clampCamera(
    {
      x: cam.x - dxScreen / cam.zoom,
      y: cam.y - dyScreen / cam.zoom,
      zoom: cam.zoom,
    },
    bounds,
  );
}

export function focusCamera(point: Point, zoom: number, bounds: CameraBounds): CameraView {
  return clampCamera({ x: point.x, y: point.y, zoom }, bounds);
}
```

- [ ] **Step 4: Add desk hit testing to the scene**

Add these exports to `src/warroom/scene.ts` after `isBlocked()`:

```ts
export function pointInRect(r: Rect, x: number, y: number): boolean {
  return inside(r, x, y);
}

export function hitTestDesk(scene: SceneLayout, x: number, y: number): DeskZone | null {
  const desk = scene.zones.find((zone) => inside(inflated(zone.desk, 18), x, y));
  if (desk) return desk;
  return scene.zones.find((zone) => Math.hypot(zone.home.x - x, zone.home.y - y) <= zone.radius * 0.8) ?? null;
}
```

- [ ] **Step 5: Move the camera type to `camera.ts`**

In `src/warroom/draw.ts`, replace the local `CameraView` interface with this import:

```ts
import type { AgentId } from '../core/contract';
import type { CameraView } from './camera';
import { drawOffice, type BoardContext, type SceneLayout, type W2S, type Vec } from './scene';
```

In `src/warroom/WarRoom.tsx`, replace the `CameraView` import from `draw.ts` with this import:

```ts
import { clampCamera, focusCamera, panCamera, screenToWorld, zoomAt, type CameraView } from './camera';
```

Remove the local `clampCam()` function from `src/warroom/WarRoom.tsx` after Task 6 wires the new helpers.

- [ ] **Step 6: Run the camera tests and typecheck**

Run:

```bash
npm run test -- src/warroom/camera.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/warroom/camera.ts src/warroom/camera.test.ts src/warroom/scene.ts src/warroom/draw.ts src/warroom/WarRoom.tsx
git commit -m "feat: add war room camera controls"
```

---

### Task 3: Canvas Selection, Hover Labels, Panic Motion, And Role-Aware Bubbles

**Files:**
- Modify: `src/warroom/crowd.ts`
- Modify: `src/warroom/bubbles.ts`
- Modify: `src/warroom/draw.ts`
- Modify: `src/warroom/scene.ts`

- [ ] **Step 1: Write the failing motion test**

Add this test to `src/warroom/camera.test.ts` below the existing suite:

```ts
import { buildScene } from './scene';
import { buildCrowd, stepWorker } from './crowd';
import { GROUP_COLOR } from './agents';

describe('panic movement', () => {
  it('moves panic workers farther than idle workers over the same frame', () => {
    const scene = buildScene(1200, 800, GROUP_COLOR);
    const idle = buildCrowd(scene).groups[0].workers[0];
    const panic = { ...idle };
    const idleStart = { x: idle.x, y: idle.y };
    const panicStart = { x: panic.x, y: panic.y };

    stepWorker(idle, scene, { mode: 'idle' }, 0.25);
    stepWorker(panic, scene, { mode: 'panic' }, 0.25);

    const idleDist = Math.hypot(idle.x - idleStart.x, idle.y - idleStart.y);
    const panicDist = Math.hypot(panic.x - panicStart.x, panic.y - panicStart.y);
    expect(panicDist).toBeGreaterThan(idleDist);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm run test -- src/warroom/camera.test.ts
```

Expected: FAIL because `stepWorker()` still accepts a boolean.

- [ ] **Step 3: Update crowd motion modes**

In `src/warroom/crowd.ts`, add this interface near `GroupStatus`:

```ts
export interface WorkerMotion {
  mode: 'idle' | 'active' | 'panic';
}
```

Replace the `stepWorker()` signature and speed/leash block with:

```ts
export function stepWorker(w: Worker, scene: SceneLayout, motion: WorkerMotion, dt: number): void {
  const panic = motion.mode === 'panic';
  const energetic = motion.mode === 'active' || panic;
  w.turnClock -= dt * (panic ? 1.8 : 1);
  if (w.turnClock <= 0) {
    const dx = w.hx - w.x;
    const dy = w.hy - w.y;
    const dist = Math.hypot(dx, dy);
    const toHome = Math.atan2(dy, dx);
    const jitter = panic ? 2.5 : 1.6;
    const wander = w.ang + (Math.random() - 0.5) * jitter;
    const pull = Math.min(1, dist / w.radius) * (panic ? 0.45 : 0.7);
    w.ang = angLerp(wander, toHome, pull);
    w.turnClock = panic ? 0.18 + Math.random() * 0.45 : 0.8 + Math.random() * 2.0;
  }

  const speed = w.baseSpeed * (panic ? 2.65 : energetic ? 1.7 : 1);
  const vx = Math.cos(w.ang) * speed;
  const vy = Math.sin(w.ang) * speed;
  let nx = w.x + vx * dt;
  let ny = w.y + vy * dt;

  const leash = panic ? 1.75 : 1.3;
  if (Math.hypot(nx - w.hx, ny - w.hy) > w.radius * leash) {
    w.ang = Math.atan2(w.hy - w.y, w.hx - w.x) + (Math.random() - 0.5) * (panic ? 1.1 : 0.6);
    w.turnClock = panic ? 0.12 : 0.3;
    nx = w.x;
    ny = w.y;
  }

  if (isBlocked(scene, nx, ny)) {
    w.ang += Math.PI * 0.65 + (Math.random() - 0.5) * (panic ? 1.3 : 0.8);
    w.turnClock = panic ? 0.1 : 0.25;
  } else {
    w.x = nx;
    w.y = ny;
  }

  w.x = Math.max(6, Math.min(scene.width - 6, w.x));
  w.y = Math.max(24, Math.min(scene.height - 6, w.y));

  w.frameClock += dt * 1000 * (panic ? 1.7 : 1);
  w.frame = walkFrame(w.frameClock);
  w.dir = dirFromVelocity(vx, vy, w.dir);
}
```

- [ ] **Step 4: Add role-aware bubble helpers**

In `src/warroom/bubbles.ts`, import the metadata and add these exports after `ambientFor()`:

```ts
import type { AgentId } from '../core/contract';
import { AGENT_ORDER, AGENT_PANIC_LINES, AGENT_RESPONSIBILITY } from './agents';

export function ambientForAgent(agentId: AgentId, seed: number): string {
  const responsibility = AGENT_RESPONSIBILITY[agentId];
  const short = responsibility.split(',')[0].toLowerCase();
  const lines = [
    `checking ${short}`,
    `reviewing ${agentId} notes`,
    ambientFor(seed),
  ];
  return lines[Math.abs(Math.floor(seed)) % lines.length];
}

export function panicForAgent(agentId: AgentId, seed: number): string {
  const lines = AGENT_PANIC_LINES[agentId];
  return lines[Math.abs(Math.floor(seed)) % lines.length];
}

export function agentForBubbleIndex(index: number): AgentId {
  return AGENT_ORDER[Math.abs(index) % AGENT_ORDER.length];
}
```

Move the new imports to the top of the file so TypeScript accepts them.

- [ ] **Step 5: Add canvas selection and hover drawing**

In `src/warroom/draw.ts`, add fields to `SceneState`:

```ts
  selectedAgentId: AgentId | null;
  hoverAgentId: AgentId | null;
  panicAgentIds: Set<AgentId>;
  responsibilities: Record<AgentId, string>;
```

In `drawScene()`, call highlight and label drawing after `drawOffice()` and before arrows:

```ts
  drawDeskHighlights(ctx, s, w2s);
  drawHoverLabel(ctx, s, w2s);
```

Add these helper functions:

```ts
function drawDeskHighlights(ctx: CanvasRenderingContext2D, s: SceneState, w2s: W2S): void {
  for (const zone of s.scene.zones) {
    const selected = s.selectedAgentId === zone.id;
    const hovered = s.hoverAgentId === zone.id;
    const panic = s.panicAgentIds.has(zone.id);
    if (!selected && !hovered && !panic) continue;
    const p = w2s(zone.desk.x, zone.desk.y);
    ctx.save();
    ctx.strokeStyle = zone.color;
    ctx.globalAlpha = selected ? 0.95 : panic ? 0.62 : 0.5;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.setLineDash(panic ? [5, 4] : []);
    ctx.strokeRect(
      Math.round(p.x - 8 * s.cam.zoom),
      Math.round(p.y - 8 * s.cam.zoom),
      Math.round((zone.desk.w + 16) * s.cam.zoom),
      Math.round((zone.desk.h + 16) * s.cam.zoom),
    );
    ctx.restore();
  }
}

function drawHoverLabel(ctx: CanvasRenderingContext2D, s: SceneState, w2s: W2S): void {
  if (!s.hoverAgentId) return;
  const zone = s.scene.zones.find((item) => item.id === s.hoverAgentId);
  if (!zone) return;
  const p = w2s(zone.home.x, zone.desk.y - 18);
  const text = s.responsibilities[zone.id];
  ctx.save();
  ctx.font = "600 12px 'Geist Variable', ui-sans-serif, system-ui, sans-serif";
  const maxW = 280;
  const w = Math.min(maxW, Math.max(180, ctx.measureText(text).width + 24));
  const x = Math.max(8, Math.min(s.cssW - w - 8, p.x - w / 2));
  const y = Math.max(8, p.y - 42);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.strokeStyle = 'rgba(20,24,33,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 34, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = zone.color;
  ctx.fillRect(x, y, 4, 34);
  ctx.fillStyle = '#1d2330';
  ctx.fillText(text.length > 74 ? `${text.slice(0, 71)}...` : text, x + 12, y + 10);
  ctx.restore();
}
```

- [ ] **Step 6: Draw panic bubbles during loading**

In `src/warroom/draw.ts`, update the `drawBubbles()` ambient loop so panic groups use the dry office-comedy lines:

```ts
  for (const ab of s.ambient) {
    const g = s.crowd.groups[ab.gi];
    if (!g) continue;
    const w = g.workers[ab.wi];
    if (!w) continue;
    const head = w2s(w.x, w.y);
    const text = s.panicAgentIds.has(g.id) ? ab.text : ab.text;
    drawBubble(ctx, head.x, head.y - drawPx, text, { cssW: s.cssW, stripe: g.color });
  }
```

The actual panic text is selected in `WarRoom.tsx` during Task 6 by calling `panicForAgent()` when `panicAgentIds` contains the group.

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm run test -- src/warroom/camera.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add src/warroom/crowd.ts src/warroom/bubbles.ts src/warroom/draw.ts src/warroom/scene.ts src/warroom/camera.test.ts
git commit -m "feat: add war room canvas interaction states"
```

---

### Task 4: Whole-Swarm Question Runs

**Files:**
- Create: `src/warroom/questionRun.ts`
- Create: `src/warroom/questionRun.test.ts`

- [ ] **Step 1: Write parser and mock tests**

Create `src/warroom/questionRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractTaggedAgentSections, mockQuestionAnswer } from './questionRun';

describe('questionRun helpers', () => {
  it('extracts tagged sections for all agents', () => {
    const text = [
      '[orchestrator] Route the two-year question through the current scenario.',
      '[modeler] The horizon and volatility assumptions drive the loss shape.',
      '[visualizer] Inspect the fan chart and terminal distribution together.',
      '[sensitivity] Volatility dominates the left tail.',
      '[risk] Greatest loss appears in the stressed tail year.',
      '[explainer] In plain English, the downside is path-dependent.',
    ].join('\n');

    const sections = extractTaggedAgentSections(text);
    expect(sections.risk).toContain('stressed tail');
    expect(sections.explainer).toContain('plain English');
  });

  it('builds an offline mock answer that names the user question', () => {
    const answer = mockQuestionAnswer('Which year had the greatest loss?');
    expect(answer).toContain('[orchestrator]');
    expect(answer).toContain('Which year had the greatest loss?');
    expect(answer).toContain('decision-support, not advice');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm run test -- src/warroom/questionRun.test.ts
```

Expected: FAIL because `src/warroom/questionRun.ts` does not exist.

- [ ] **Step 3: Implement tagged swarm question adapter**

Create `src/warroom/questionRun.ts`:

```ts
import type { AgentEvent, AgentId, OnEvent, TimeInfo } from '../core/contract';
import { chat, USE_LIVE } from '../core/cerebras';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import type { AgentDossier } from './agentDossier';
import { AGENT_LABEL, AGENT_ORDER, AGENT_RESPONSIBILITY } from './agents';

export interface QuestionTurn {
  id: string;
  question: string;
  answer: string;
  sections: Partial<Record<AgentId, string>>;
  timeInfo?: TimeInfo;
  mode: 'live' | 'mock';
  createdAt: number;
}

export interface StartQuestionRunArgs {
  question: string;
  session: AugurForgeSessionSnapshot | null;
  dossiers: AgentDossier[];
  onEvent: OnEvent;
  onComplete: (turn: QuestionTurn) => void;
  onError: (message: string) => void;
}

const TAG_RE = /^\[(orchestrator|modeler|visualizer|sensitivity|risk|explainer)\]\s*/i;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function extractTaggedAgentSections(text: string): Partial<Record<AgentId, string>> {
  const sections: Partial<Record<AgentId, string>> = {};
  let current: AgentId | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tag = TAG_RE.exec(line);
    if (tag) {
      current = tag[1].toLowerCase() as AgentId;
      const body = clean(line.replace(TAG_RE, ''));
      if (body) sections[current] = sections[current] ? `${sections[current]} ${body}` : body;
      continue;
    }
    if (current) sections[current] = clean(`${sections[current] ?? ''} ${line}`);
  }
  return sections;
}

export function mockQuestionAnswer(question: string): string {
  return [
    `[orchestrator] I am routing "${question}" through the current War Room context and keeping the answer scoped to decision-support, not advice.`,
    '[modeler] The deterministic browser math is the anchor; horizon, volatility, drift, and ruin threshold explain most changes.',
    '[visualizer] Compare the fan shape with the terminal distribution before trusting a single headline metric.',
    '[sensitivity] Volatility is the first stress knob because it widens the loss cone faster than drift moves the center.',
    '[risk] The important warning is left-tail concentration: a low-probability path can still dominate the downside story.',
    '[explainer] Plain-English readout: the swarm expects the answer to depend on path timing, not only the final average.',
  ].join('\n');
}

function buildPrompt(question: string, session: AugurForgeSessionSnapshot | null, dossiers: AgentDossier[]): string {
  return JSON.stringify({
    instruction: 'Answer as six AugurForge agents. Use exactly one line per agent, each beginning with [agentId]. Ground claims in supplied context. Keep this decision-support, not advice.',
    question,
    scenarioTitle: session?.title ?? 'Portfolio ruin risk - Monte Carlo',
    metrics: session?.metrics ?? [],
    modelerMapping: session?.modelerMapping ?? {},
    dossiers: dossiers.map((dossier) => ({
      agentId: dossier.agentId,
      responsibility: dossier.responsibility,
      conclusion: dossier.conclusion,
      evidence: dossier.evidence,
      critique: dossier.critique,
      stats: dossier.stats,
    })),
  });
}

function emitSectionEvents(sections: Partial<Record<AgentId, string>>, timeInfo: TimeInfo | undefined, onEvent: OnEvent): void {
  AGENT_ORDER.forEach((agent) => {
    const text = sections[agent] ?? `${AGENT_LABEL[agent]} had no separate finding for this question.`;
    onEvent({ agent, status: 'start' });
    onEvent({ agent, status: 'token', delta: text });
    onEvent({ agent, status: 'done', result: { text }, timeInfo });
  });
}

export function startQuestionRun(args: StartQuestionRunArgs): () => void {
  const controller = new AbortController();
  const createdAt = Date.now();

  void (async () => {
    try {
      const mockText = mockQuestionAnswer(args.question);
      const res = await chat(
        {
          messages: [
            {
              role: 'system',
              content: 'You are the AugurForge War Room swarm. Return tagged lines for orchestrator, modeler, visualizer, sensitivity, risk, and explainer. No markdown table.',
            },
            { role: 'user', content: buildPrompt(args.question, args.session, args.dossiers) },
          ],
          stream: true,
          reasoningEffort: 'low',
          temperature: 0.25,
          maxTokens: 850,
          signal: controller.signal,
          mock: { text: mockText },
        },
      );
      if (controller.signal.aborted) return;
      const answer = res.text || mockText;
      const sections = extractTaggedAgentSections(answer);
      emitSectionEvents(sections, res.timeInfo, args.onEvent);
      args.onComplete({
        id: `q-${createdAt}`,
        question: args.question,
        answer,
        sections,
        timeInfo: res.timeInfo,
        mode: USE_LIVE ? 'live' : 'mock',
        createdAt,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      args.onError(err instanceof Error ? err.message : 'Question run failed');
    }
  })();

  return () => controller.abort();
}

export function responsibilityForQuestion(agentId: AgentId): string {
  return AGENT_RESPONSIBILITY[agentId];
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm run test -- src/warroom/questionRun.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/warroom/questionRun.ts src/warroom/questionRun.test.ts
git commit -m "feat: add war room swarm question runs"
```

---

### Task 5: Gemma HTML Report Preview And Download

**Files:**
- Create: `src/warroom/reportExport.ts`
- Create: `src/warroom/reportExport.test.ts`

- [ ] **Step 1: Write report tests**

Create `src/warroom/reportExport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AgentDossier } from './agentDossier';
import { assembleReportHtml, buildReportBrief } from './reportExport';

const dossier: AgentDossier = {
  agentId: 'risk',
  label: 'Risk',
  responsibility: 'Reviews tail behavior.',
  status: 'complete',
  conclusion: '<Tail risk is visible>',
  evidence: ['P(ruin): 2.3%'],
  critique: 'Decision-support caveat required.',
  stats: ['TTFT 12 ms', '2100 tok/s'],
  transcript: ['Tail risk is visible.'],
};

describe('report export helpers', () => {
  it('builds a compact brief with required product labels', () => {
    const brief = buildReportBrief({
      title: 'Portfolio ruin risk',
      mode: 'Live Cerebras Gemma 4',
      latest: { ttftMs: 12, tokensPerSec: 2100 },
      dossiers: [dossier],
      history: [],
      session: null,
    });
    expect(brief).toContain('Gemma 4');
    expect(brief).toContain('Cerebras');
    expect(brief).toContain('deterministic browser math');
    expect(brief).toContain('decision-support, not advice');
  });

  it('escapes structured facts in assembled HTML', () => {
    const html = assembleReportHtml({
      title: 'Portfolio ruin risk',
      mode: 'mock',
      narrative: 'Executive summary',
      brief: 'brief',
      dossiers: [dossier],
      history: [],
      latest: { ttftMs: 12, tokensPerSec: 2100 },
      generatedAt: 1,
    });

    expect(html).toContain('Gemma 4');
    expect(html).toContain('Cerebras');
    expect(html).toContain('&lt;Tail risk is visible&gt;');
    expect(html).not.toContain('<Tail risk is visible>');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm run test -- src/warroom/reportExport.test.ts
```

Expected: FAIL because `src/warroom/reportExport.ts` does not exist.

- [ ] **Step 3: Implement report export helpers**

Create `src/warroom/reportExport.ts`:

```ts
import type { TimeInfo } from '../core/contract';
import { chat, USE_LIVE } from '../core/cerebras';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import type { AgentDossier } from './agentDossier';
import type { QuestionTurn } from './questionRun';

export interface ReportBriefInput {
  title: string;
  mode: string;
  latest: TimeInfo;
  dossiers: AgentDossier[];
  history: QuestionTurn[];
  session: AugurForgeSessionSnapshot | null;
}

export interface ReportHtmlInput {
  title: string;
  mode: string;
  narrative: string;
  brief: string;
  dossiers: AgentDossier[];
  history: QuestionTurn[];
  latest: TimeInfo;
  generatedAt: number;
}

export interface GeneratedReport {
  html: string;
  narrative: string;
  mode: 'live' | 'mock';
  timeInfo?: TimeInfo;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function list(items: string[]): string {
  return items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p>None surfaced.</p>';
}

export function buildReportBrief(input: ReportBriefInput): string {
  return JSON.stringify({
    product: 'AugurForge War Room',
    model: 'Gemma 4 on Cerebras',
    mode: input.mode,
    title: input.title,
    caveat: 'decision-support, not advice',
    math: 'deterministic browser math',
    timing: input.latest,
    metrics: input.session?.metrics ?? [],
    agentFindings: input.dossiers.map((dossier) => ({
      agent: dossier.label,
      responsibility: dossier.responsibility,
      conclusion: dossier.conclusion,
      evidence: dossier.evidence,
      critique: dossier.critique,
      stats: dossier.stats,
    })),
    questions: input.history.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
      mode: turn.mode,
      timeInfo: turn.timeInfo,
    })),
  });
}

export function mockReportNarrative(input: ReportBriefInput): string {
  const risk = input.dossiers.find((dossier) => dossier.agentId === 'risk')?.conclusion ?? 'No surfaced risk conclusion yet.';
  const explainer = input.dossiers.find((dossier) => dossier.agentId === 'explainer')?.conclusion ?? 'No final explanation yet.';
  return [
    'Executive summary: Gemma 4 on Cerebras reviewed the current War Room context and the deterministic browser math.',
    `Agent findings: Risk noted ${risk} Explainer noted ${explainer}`,
    'Key risks and sensitivities: volatility, horizon, and left-tail concentration are the first assumptions to stress.',
    'Plain-English interpretation: treat the output as fast scenario exploration, not a governed reserving result.',
    'Decision-support caveat: this is decision-support, not advice.',
  ].join('\n\n');
}

export function assembleReportHtml(input: ReportHtmlInput): string {
  const timing = [
    input.latest.ttftMs !== undefined ? `TTFT ${input.latest.ttftMs} ms` : 'TTFT not reported',
    input.latest.tokensPerSec !== undefined ? `${Math.round(input.latest.tokensPerSec)} tokens/s` : 'tokens/s not reported',
  ].join(' | ');
  const agentSections = input.dossiers
    .map(
      (dossier) => `
        <section class="agent">
          <h2>${esc(dossier.label)}</h2>
          <p><strong>Responsibility:</strong> ${esc(dossier.responsibility)}</p>
          <p><strong>Conclusion:</strong> ${esc(dossier.conclusion)}</p>
          <h3>Evidence</h3>
          ${list(dossier.evidence)}
          <h3>Critique and judgment</h3>
          <p>${esc(dossier.critique)}</p>
          <h3>Statistics</h3>
          ${list(dossier.stats)}
        </section>`,
    )
    .join('');
  const questions = input.history
    .map((turn) => `<li><strong>${esc(turn.question)}</strong><br>${esc(turn.answer)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)} - War Room Report</title>
  <style>
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #1d2330; background: #f4f5f7; }
    main { max-width: 980px; margin: 0 auto; padding: 36px 24px 56px; }
    h1 { font-size: 30px; margin: 0 0 10px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    h3 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0; color: #5b6472; }
    .meta, .agent { border: 1px solid rgba(20,24,33,0.12); border-radius: 8px; background: #fff; padding: 16px; margin: 14px 0; }
    .narrative { white-space: pre-wrap; line-height: 1.55; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <main>
    <h1>${esc(input.title)}</h1>
    <section class="meta">
      <p><strong>Generated:</strong> ${esc(new Date(input.generatedAt).toLocaleString())}</p>
      <p><strong>Mode:</strong> ${esc(input.mode)}</p>
      <p><strong>Model:</strong> Gemma 4 on Cerebras</p>
      <p><strong>Timing:</strong> ${esc(timing)}</p>
      <p><strong>Math:</strong> deterministic browser math</p>
      <p><strong>Caveat:</strong> decision-support, not advice</p>
    </section>
    <section class="meta narrative">${esc(input.narrative)}</section>
    ${agentSections}
    <section class="meta">
      <h2>Questions</h2>
      <ul>${questions || '<li>No War Room questions were asked in this session.</li>'}</ul>
    </section>
  </main>
</body>
</html>`;
}

export async function generateReportPreview(input: ReportBriefInput): Promise<GeneratedReport> {
  const brief = buildReportBrief(input);
  const mockText = mockReportNarrative(input);
  const res = await chat({
    messages: [
      {
        role: 'system',
        content: 'You write concise AugurForge War Room HTML report narrative sections. Include executive summary, agent findings, key risks and sensitivities, plain-English interpretation, and the decision-support caveat.',
      },
      { role: 'user', content: brief },
    ],
    stream: false,
    reasoningEffort: 'low',
    temperature: 0.2,
    maxTokens: 900,
    mock: { text: mockText },
  });
  const narrative = res.text || mockText;
  return {
    html: assembleReportHtml({
      title: input.title,
      mode: input.mode,
      narrative,
      brief,
      dossiers: input.dossiers,
      history: input.history,
      latest: input.latest,
      generatedAt: Date.now(),
    }),
    narrative,
    mode: USE_LIVE ? 'live' : 'mock',
    timeInfo: res.timeInfo,
  };
}

export function downloadReportHtml(html: string, title: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'war-room'}-report.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run report tests and typecheck**

Run:

```bash
npm run test -- src/warroom/reportExport.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add src/warroom/reportExport.ts src/warroom/reportExport.test.ts
git commit -m "feat: add war room report export"
```

---

### Task 6: React Console Integration

**Files:**
- Modify: `src/warroom/WarRoom.tsx`
- Modify: `src/warroom/warroom.css`

- [ ] **Step 1: Add imports**

In `src/warroom/WarRoom.tsx`, update the React import and War Room imports:

```ts
import { FormEvent, PointerEvent as ReactPointerEvent, WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, AgentId, OnEvent, TimeInfo } from '../core/contract';
import { AGENT_LABEL, AGENT_ORDER, AGENT_RESPONSIBILITY, GROUP_COLOR } from './agents';
import { deriveAgentDossiers, type AgentDossier } from './agentDossier';
import { clampCamera, focusCamera, panCamera, screenToWorld, zoomAt, type CameraView } from './camera';
import { buildScene, hitTestDesk, type BoardContext, type SceneLayout } from './scene';
import { ambientForAgent, panicForAgent } from './bubbles';
import { startQuestionRun, type QuestionTurn } from './questionRun';
import { downloadReportHtml, generateReportPreview, type GeneratedReport } from './reportExport';
```

Keep all existing imports that are still used. Remove the `CameraView` type import from `draw.ts` after Task 2.

- [ ] **Step 2: Add UI state and refs**

Inside `WarRoom()`, after the existing `session` state, add:

```ts
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
```

After `const stateRef`, add:

```ts
  const latestByAgentRef = useRef<Partial<Record<AgentId, TimeInfo>>>({});
  const questionStopRef = useRef<null | (() => void)>(null);
  const draggingRef = useRef<null | { id: number; x: number; y: number; moved: boolean }>(null);
  const manualCameraUntilRef = useRef(0);
```

- [ ] **Step 3: Track per-agent timing and DOM refreshes**

Replace the existing `onEvent` callback body with:

```ts
  const onEvent: OnEvent = useCallback((e: AgentEvent) => {
    stateRef.current = applyEvent(stateRef.current, e, performance.now());
    if (e.timeInfo) {
      latestByAgentRef.current = { ...latestByAgentRef.current, [e.agent]: e.timeInfo };
      setLatest({ ttftMs: e.timeInfo.ttftMs, tokensPerSec: e.timeInfo.tokensPerSec });
    }
    setRenderVersion((value) => value + 1);
  }, []);
```

- [ ] **Step 4: Derive dossiers for the inspector**

Add this `useMemo` before `run`:

```ts
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
```

- [ ] **Step 5: Add question run handlers**

Add these callbacks before `toggleRecord`:

```ts
  const submitQuestion = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const question = questionText.trim();
      if (!question || questionRunning) return;
      questionStopRef.current?.();
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
          setHistory((items) => [turn, ...items].slice(0, 5));
          setQuestionRunning(false);
          setRenderVersion((value) => value + 1);
        },
        onError: (message) => {
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
```

Add a cleanup effect:

```ts
  useEffect(() => {
    return () => questionStopRef.current?.();
  }, []);
```

- [ ] **Step 6: Wire pointer, wheel, double-click, and keyboard controls**

Add these helpers before `return`:

```ts
  const cameraBounds = useCallback(
    () => ({
      width: sceneRef.current?.width ?? 1,
      height: sceneRef.current?.height ?? 1,
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
    const hit = hitTestDesk(scene, point.x, point.y);
    setSelectedAgentId(hit?.id ?? null);
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
      const world = worldFromEvent(event);
      selectAt(world);
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
```

Add a keyboard effect:

```ts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedAgentId(null);
      if (event.key === '+' || event.key === '=') camRef.current = zoomAt(camRef.current, window.innerWidth / 2, window.innerHeight / 2, 1.12, cameraBounds());
      if (event.key === '-') camRef.current = zoomAt(camRef.current, window.innerWidth / 2, window.innerHeight / 2, 0.88, cameraBounds());
      if (event.key === 'ArrowLeft') camRef.current = panCamera(camRef.current, 48, 0, cameraBounds());
      if (event.key === 'ArrowRight') camRef.current = panCamera(camRef.current, -48, 0, cameraBounds());
      if (event.key === 'ArrowUp') camRef.current = panCamera(camRef.current, 0, 48, cameraBounds());
      if (event.key === 'ArrowDown') camRef.current = panCamera(camRef.current, 0, -48, cameraBounds());
      if (event.key === '0') camRef.current = focusCamera({ x: (sceneRef.current?.width ?? 1) / 2, y: (sceneRef.current?.height ?? 1) / 2 }, 1, cameraBounds());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cameraBounds]);
```

- [ ] **Step 7: Update frame loop camera and scene state**

In the worker stepping loop, replace the boolean `energetic` call with:

```ts
          const mode = questionRunning
            ? 'panic'
            : statuses[g.id]?.thinking === true
              ? 'active'
              : 'idle';
          for (const w of g.workers) stepWorker(w, scene, { mode }, dt);
```

Replace the auto-focus block with:

```ts
        if (performance.now() > manualCameraUntilRef.current) {
          const active = activeId ? crowd.groups.find((g) => g.id === activeId) : undefined;
          const target = active
            ? focusCamera(active.home, 1.5, { width: scene.width, height: scene.height, viewW: cssW, viewH: cssH })
            : focusCamera({ x: cssW / 2, y: cssH / 2 }, 1, { width: scene.width, height: scene.height, viewW: cssW, viewH: cssH });
          const k = 1 - Math.pow(0.0001, dt);
          const cam = camRef.current;
          camRef.current = {
            x: lerp(cam.x, target.x, k),
            y: lerp(cam.y, target.y, k),
            zoom: lerp(cam.zoom, target.zoom, k),
          };
        }
```

Update `pickAmbient()` so question loading uses panic lines:

```ts
        picks.push({
          gi,
          wi,
          text: questionRunning ? panicForAgent(g.id, gi * 31 + wi + cycle) : ambientForAgent(g.id, gi * 23 + wi * 3 + cycle * 5),
        });
```

Add these fields to the `SceneState` object:

```ts
          selectedAgentId,
          hoverAgentId,
          panicAgentIds: new Set(questionRunning ? AGENT_ORDER : []),
          responsibilities: AGENT_RESPONSIBILITY,
```

Add `questionRunning`, `selectedAgentId`, and `hoverAgentId` to the canvas effect dependency list.

- [ ] **Step 8: Replace JSX with the console shell**

Replace the `<div className="warroom-stage">` block with:

```tsx
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
          {questionRunning ? 'Thinking' : 'Ask swarm'}
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
                <button type="button" onClick={() => downloadReportHtml(report.html, deriveBoardContext(stateRef.current, pipelineLabel, sessionRef.current).title)}>
                  Download HTML
                </button>
              </>
            )}
          </div>
        </div>
      )}
```

Add this component below `WarRoom()`:

```tsx
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
```

- [ ] **Step 9: Add War Room-local styles**

Append to `src/warroom/warroom.css`:

```css
.warroom-console {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
}

.warroom-inspector {
  border-left: 1px solid var(--line, rgba(20, 24, 33, 0.1));
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px) saturate(1.1);
  min-height: 0;
  overflow: auto;
}

.warroom-agent-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--line, rgba(20, 24, 33, 0.1));
}

.warroom-agent-tab {
  border: 1px solid var(--line, rgba(20, 24, 33, 0.14));
  border-radius: var(--r, 8px);
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink, #1d2330);
  text-align: left;
  padding: 8px;
  cursor: pointer;
}

.warroom-agent-tab.selected {
  border-color: var(--blue, #3b6fb0);
  box-shadow: 0 0 0 2px rgba(59, 111, 176, 0.14);
}

.warroom-agent-tab span,
.warroom-agent-tab small {
  display: block;
}

.warroom-agent-tab small {
  margin-top: 3px;
  color: var(--muted, #5b6472);
  font-size: 11px;
  text-transform: capitalize;
}

.warroom-detail {
  padding: 14px;
  font-size: 13px;
  line-height: 1.45;
}

.warroom-detail h2 {
  font-size: 18px;
  margin: 0 0 8px;
}

.warroom-detail h3 {
  margin: 16px 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted, #5b6472);
  letter-spacing: 0;
}

.warroom-detail ul {
  margin: 0;
  padding-left: 18px;
}

.warroom-responsibility {
  color: var(--muted, #5b6472);
}

.warroom-command {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto auto minmax(0, 260px);
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border-top: 1px solid var(--line, rgba(20, 24, 33, 0.1));
  background: rgba(255, 255, 255, 0.86);
}

.warroom-command input {
  min-width: 0;
  border: 1px solid var(--line, rgba(20, 24, 33, 0.16));
  border-radius: var(--r, 8px);
  padding: 8px 10px;
  font: inherit;
}

.warroom-command button,
.warroom-modal button {
  border: 1px solid var(--line, rgba(20, 24, 33, 0.14));
  border-radius: var(--r, 8px);
  background: #fff;
  color: var(--ink, #1d2330);
  padding: 8px 11px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.warroom-command button:disabled {
  opacity: 0.55;
  cursor: default;
}

.warroom-error {
  color: #a33630;
  font-size: 12px;
}

.warroom-last-answer {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted, #5b6472);
  font-size: 12px;
}

.warroom-modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(17, 24, 39, 0.34);
}

.warroom-modal-panel {
  width: min(980px, calc(100vw - 40px));
  height: min(760px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  border-radius: var(--r, 8px);
  border: 1px solid rgba(20, 24, 33, 0.18);
  background: #fff;
  padding: 12px;
}

.warroom-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.warroom-modal iframe {
  width: 100%;
  height: 100%;
  border: 1px solid var(--line, rgba(20, 24, 33, 0.12));
  border-radius: var(--r, 8px);
}

@media (max-width: 980px) {
  .warroom-console {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 280px;
  }

  .warroom-inspector {
    border-left: 0;
    border-top: 1px solid var(--line, rgba(20, 24, 33, 0.1));
  }

  .warroom-command {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 10: Run full War Room checks**

Run:

```bash
npm run test -- src/warroom/agentDossier.test.ts src/warroom/camera.test.ts src/warroom/questionRun.test.ts src/warroom/reportExport.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 11: Commit Task 6**

Run:

```bash
git add src/warroom/WarRoom.tsx src/warroom/warroom.css
git commit -m "feat: integrate war room console"
```

---

### Task 7: Browser Verification, Graphify Update, And Handoff

**Files:**
- Modify: `graphify-out/**` through `graphify update .`
- No source files unless verification exposes a defect in Task 1-6 files.

- [ ] **Step 1: Verify the dev server route**

Use the already-running dev server at:

```text
http://127.0.0.1:5173/warroom
```

Expected: the page loads in the visible in-app browser tab with one canvas, the right inspector, and the bottom command strip.

- [ ] **Step 2: Verify console cleanliness**

In the browser dev tools or Playwright console collection, reload `/warroom`.

Expected: no fresh `[warroom] render frame failed` errors and no React runtime errors.

- [ ] **Step 3: Verify canvas interactions**

Perform these visible-browser checks:

```text
Hover each desk: responsibility label appears above the desk.
Click each desk: right inspector switches to that agent.
Click each list item: inspector switches to that agent.
Mouse wheel: zoom centers around the cursor.
Drag canvas: room pans without selecting a desk.
Double-click a desk: camera focuses that group.
Escape: selection clears.
0 key: camera resets to full room.
```

Expected: all checks pass and the canvas remains visible. A hidden preview tab is not a valid visual failure because `requestAnimationFrame` pauses there.

- [ ] **Step 4: Verify question flow**

Submit:

```text
What will happen in 2 years?
```

Expected:

```text
Bottom command disables duplicate submit while running.
Workers enter faster panic motion.
Dry office-comedy panic bubbles appear.
When the run completes, workers settle back near their desks.
The central board and inspector show question-related conclusions.
The recent question appears in the command strip.
```

- [ ] **Step 5: Verify report flow**

Click `Export report`.

Expected:

```text
Modal opens.
Live mode says Gemma 4 is writing through Cerebras while loading.
Preview iframe renders HTML.
Report visibly includes Gemma 4, Cerebras, TTFT or tokens/s when available, deterministic browser math, and decision-support, not advice.
Download HTML creates an .html file.
```

- [ ] **Step 6: Update Graphify**

Run:

```bash
graphify update .
```

Expected: graphify completes without printing secrets. Dirty `graphify-out/` files are expected.

- [ ] **Step 7: Final typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit verification updates**

Stage only Graphify outputs changed by the update and any source fixes made during this task:

```bash
git status --short
git add graphify-out
git commit -m "chore: update graphify after war room console"
```

If `graphify update .` reports no graph changes, skip the commit and mention that graphify was already current.

---

## Self-Review

**Spec coverage:** Tasks 1 and 6 cover agent click/list inspection, conclusion-first inspector, responsibilities, evidence, critique, stats, and transcript. Tasks 2, 3, and 6 cover hover labels, selected highlights, panic motion, settle-home behavior, pan, zoom, focus, reset, and keyboard controls. Task 4 covers whole-swarm chat through Gemma/mock and room state updates. Task 5 covers Gemma-written HTML report preview and download. Task 7 covers browser verification and graphify update.

**Placeholder scan:** No prohibited filler phrases remain. Each source-changing step includes code or exact insertion text, and each check has a command plus expected result.

**Type consistency:** `AgentId`, `AgentEvent`, `OnEvent`, `TimeInfo`, and `AugurForgeSessionSnapshot` are imported from existing modules. New local `CameraView` lives in `src/warroom/camera.ts` and replaces the old local draw type. `QuestionTurn` is exported from `questionRun.ts` and reused by `reportExport.ts` and `WarRoom.tsx`.
