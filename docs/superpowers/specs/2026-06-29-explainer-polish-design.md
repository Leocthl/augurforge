# Explainer Polish + Integration — Design Spec

- **Date:** 2026-06-29
- **Owner surface:** `src/explainer/*` (OWNER: B) + a contained touch into `src/app/App.tsx` (OWNER: A) to host the embed
- **Status:** Approved design → ready for implementation plan
- **Follows:** `2026-06-29-depth-explainer-design.md` (original build spec). This spec covers polish + realizing the live-app integration that doc deferred.

## 1. Context / current state

The "explainer feature" is the **Gemma Thinking Graph** in `src/explainer/`: a live 3D force-directed
"galaxy" graph (`react-force-graph-3d` + Three.js) that visualizes the agent reasoning cascade while
streaming a single caption and the Cerebras TTFT / tokens-sec HUD. It has its own dev page
(`explainer.html` → `src/explainer/dev.tsx` → `DepthExplainer`).

Current pieces:
- `DepthExplainer.tsx` — mountable feature; runs an `EventSource`, reduces to a graph, overlays caption + HUD. Controls: Mock/Real, Entry/Expert, Record clip, Replay.
- `ThinkingGraph.tsx` — the galaxy renderer (UnrealBloom, link particles, auto-rotate, `SpriteText` labels).
- `reasoningGraph.ts` — **pure reducer**: `AgentEvent` stream → growing `{nodes, links}` + `captions` (unordered `Record`) + `active`.
- `eventSource.ts` — offline mock cascade + live wrapper.
- `liveSource.ts` — bridges the real pipeline (`runPipeline` + `runTweak`) into the graph.
- `useClipRecorder.ts` — MediaRecorder → `.webm`.
- `types.ts` / `explainer.css` — node/link shapes + `ROLE_COLOR` palette / HUD styling.

The main app (`src/app/App.tsx`) does **not** mount the Thinking Graph. It has a separate plain-text
"Explainer" / "Sensitivity" prose panel and a small **"Gemma agent cascade"** LED chip strip
(`App.tsx:733`).

### Problems this addresses
1. The graph is a standalone showcase, decoupled from the product.
2. Captions show only one agent at a time — each agent's reasoning is overwritten and the cascade story is lost.
3. Visual drift vs `DESIGN.md`: banned cyan/violet neon + `linear-gradient(135deg,#38bdf8,#6366f1)` badge; one-disciplined-blue rule not honored.
4. `prefers-reduced-motion` ignored; bloom sized once on mount; `preserveDrawingBuffer` unset (still-frame capture fails); controls not responsive; focus states thin.

## 2. Goals / non-goals

**Goals**
- Integrate the Thinking Graph into the main workbench by **replacing the cascade chip strip** with a compact, live mini-graph + transcript, driven by the app's existing cascade events (no extra Cerebras calls).
- Make the cascade story readable via a **persistent, ordered transcript** (active beat highlighted, prior beats persist; node click ↔ beat).
- **Two-tier visuals:** restrained, design-token-aligned embed; cinematic galaxy showcase retained on `explainer.html`.
- Robustness / `DESIGN.md` compliance: reduced-motion, responsive, bloom resize, focus states, `preserveDrawingBuffer`.

**Non-goals**
- Demo-recording feature work beyond the `preserveDrawingBuffer` robustness fix (deprioritized by user).
- Changing `src/core/contract.ts` (frozen).
- New pipeline/agent logic or new Cerebras call sites.
- Refactoring unrelated App or template code.

## 3. Decisions (from brainstorming)

| Fork | Decision |
|------|----------|
| Placement | Compact mini-graph **replacing** the right-rail cascade chip strip |
| Visual intensity | **Two-tier**: restrained embed, cinematic showcase |
| Storytelling | **Persistent cascade transcript** + node→beat details |
| Embed data flow | **Approach A** — piggyback on App's existing `onEvent` stream (zero extra calls) |
| Component sharing | One `ThinkingGraph` with a `variant: 'embed' \| 'showcase'` prop |

## 4. Architecture & data flow

```
                      runPipeline / runTweak  (unchanged, single cascade)
                                  │  AgentEvent stream (OnEvent)
                                  ▼
         App.onEvent ──┬──────────────► existing text panels (explainer / sensitivity / risk)
                       │
                       └──► applyEvent ──► ReasoningState ──► <ReasoningPanel variant="embed">
                                                                 ├── <ThinkingGraph variant="embed">
                                                                 └── <CascadeTranscript>

  explainer.html → DepthExplainer (mock/real sources) ──► applyEvent ──► ReasoningState
                                                                 └── <ThinkingGraph variant="showcase"> + <CascadeTranscript> + controls
```

- **Embed** consumes the *same* `AgentEvent`s the App already receives — we fold them through the existing pure reducer. No second pipeline, no extra API calls (respects ~100 RPM cap).
- **Showcase** keeps its `mockEventSource` / `realPipelineSource`. Behavior unchanged except `variant="showcase"` and the polish items.

## 5. Components & interfaces

### 5.1 `ThinkingGraph` (modified — shared)
Add a `variant` prop; default `'showcase'` to preserve current behavior.

```ts
type GraphVariant = 'embed' | 'showcase';
interface Props {
  data: GraphData;
  width: number;
  height: number;
  variant?: GraphVariant;               // default 'showcase'
  onCanvas?: (c: HTMLCanvasElement | null) => void;
  onNodeClick?: (id: string) => void;   // drives transcript focus
}
```
Variant differences (a table of constants, not magic numbers scattered through JSX):

| Param | embed | showcase |
|-------|-------|----------|
| bloom strength / radius | ~0.6 / 0.4 (or none under reduced-motion) | 2.2 / 0.9 (current) |
| autoRotate | off (gentle drift only; off under reduced-motion) | on, 0.7 |
| camera z | tuned for compact box | 230 |
| background | `--chart` token color | `#06090f` |
| palette | token-mapped (§7) | galaxy `ROLE_COLOR` |
| label height range | smaller floor/ceiling | current |

Plus shared polish: `rendererConfig={{ preserveDrawingBuffer: true }}`, bloom resize on `width/height` change, `prefers-reduced-motion` gating.

### 5.2 `CascadeTranscript` (new)
Pure presentational list from `ReasoningState.beats`.
```ts
interface CascadeTranscriptProps {
  beats: ReasoningBeat[];
  activeAgent: AgentId | null;
  focusedAgent?: AgentId | null;        // from node click
  variant: GraphVariant;
  onSelect?: (agent: AgentId) => void;
}
```
- Ordered top→bottom in cascade order; active beat highlighted with a streaming caret; completed beats remain.
- Compact in embed (one line per agent, truncates/wraps gracefully); roomier in showcase.

### 5.3 `ReasoningPanel` (new — embed host)
Composes the mini-graph + transcript for the right rail; owns local size measurement (ResizeObserver).
```ts
interface ReasoningPanelProps {
  state: ReasoningState;       // fed by App from its onEvent
  building: boolean;
  latest?: TimeInfo;           // for a compact inline TTFT/tok-s line
}
```
Replaces the entire `agent-panel` block in `App.tsx` (the cascade chips **and** the agent-error list it currently contains). Agent errors are surfaced as **error beats** in the transcript (reducer `error` branch, §6) — so no separate error list is needed inside this block. App's `agentErrors` state is otherwise untouched (it's not read elsewhere; if it becomes unused after the swap, remove it in the same edit).

### 5.4 `DepthExplainer` (modified — showcase host)
Unchanged behavior; now renders `<ThinkingGraph variant="showcase">` + `<CascadeTranscript variant="showcase">`, wires `onNodeClick` → focused beat. Retire the gradient badge.

## 6. Reasoning state (reducer extension)

Extend `ReasoningState` and `applyEvent` in `reasoningGraph.ts` (kept pure):

```ts
interface ReasoningBeat {
  agent: AgentId;
  text: string;                 // accumulates on 'token'
  status: 'streaming' | 'done' | 'error';
}
interface ReasoningState {
  data: GraphData;
  beats: ReasoningBeat[];       // NEW — ordered, append-on-first-'start'
  captions: Record<string, string>;  // kept for node hover/click lookup
  active: AgentId | null;
}
```
- `start`: append a beat if absent; set `streaming`.
- `token`: append delta to that beat's `text` (and `captions`).
- `done`: mark beat `done`; spawn child nodes (unchanged).
- `error`: mark beat `error` (new branch; currently errors aren't reduced into the graph).
- Node→beat lookup: clicking node `id` resolves to its agent (agent nodes) or parent agent (child nodes) for transcript focus.

Immutability preserved (new arrays/objects per update; node refs still reused so the force sim keeps positions).

## 7. Visual / token harmonization

- **Embed palette** (`ROLE_COLOR` embed variant), semantic mapping to existing tokens:
  - input / param / model → light neutral + `--blue` family
  - orchestrator / modeler / visualizer → `--blue` (varied lightness for distinction)
  - sensitivity → `--amber`
  - risk / risk-flag → `--red`
  - explainer / insight → `--green`
- **Showcase palette** unchanged (galaxy).
- Retire `linear-gradient(135deg,#38bdf8,#6366f1)` → solid `--blue` badge.
- Embed lives on a small `--chart`/`--graphite` stage framed like other right-rail panels (8px radius, no nested cards, no side stripes).

## 8. Robustness / design-compliance checklist

- `prefers-reduced-motion`: disable auto-rotate + run a settled (high warmup, instant cooldown) layout; no decorative motion. Both variants.
- `rendererConfig={{ preserveDrawingBuffer: true }}` on the graph.
- Resize the `UnrealBloomPass` when `width/height` change (currently mount-only).
- `focus-visible` rings + `aria-label`s on all controls; transcript is a list with readable contrast on the dark stage.
- Responsive: embed graph fixed compact height (~200–240px), transcript scrolls; showcase controls wrap at narrow widths; right rail still collapses below the chart at tablet width per `DESIGN.md`.

## 9. Testing

- **Unit (vitest):** new `src/explainer/reasoningGraph.test.ts` — ordered `beats` across start/token/done/error; node→beat resolution; node-ref reuse/position stability; child-node spawning unchanged.
- **Typecheck:** `npm run typecheck` clean.
- **Manual:** `explainer.html` (showcase: cascade renders, transcript accumulates, node click focuses beat, reduced-motion honored); main app right rail (embed: live graph mirrors a slider tweak / Generate without extra calls; transcript persists; responsive).

## 10. File-by-file change list

| File | Change |
|------|--------|
| `src/explainer/types.ts` | Add `GraphVariant`, `ReasoningBeat`; embed `ROLE_COLOR` variant (token-mapped). |
| `src/explainer/reasoningGraph.ts` | Add ordered `beats`, error branch, node→beat helper. |
| `src/explainer/reasoningGraph.test.ts` | NEW unit tests. |
| `src/explainer/ThinkingGraph.tsx` | `variant` prop + param table; `preserveDrawingBuffer`; bloom resize; reduced-motion; `onNodeClick`. |
| `src/explainer/CascadeTranscript.tsx` | NEW. |
| `src/explainer/ReasoningPanel.tsx` | NEW embed host. |
| `src/explainer/DepthExplainer.tsx` | Use shared components; `variant="showcase"`; retire gradient badge; wire node click. |
| `src/explainer/explainer.css` | Variant styles, transcript styles, focus rings, responsive, token alignment. |
| `src/explainer/index.ts` | Export new components/types. |
| `src/app/App.tsx` | Fold `AgentEvent`s into a `ReasoningState`; replace cascade chip block with `<ReasoningPanel>`. |
| (App styles, `src/index.css`) | Right-rail panel styling for the embed if needed (kept minimal, token-based). |

## 11. Acceptance criteria

1. Triggering a cascade in the main app (slider release, Generate, SIR/Monte-Carlo) animates the embedded mini-graph **and** accumulates a persistent transcript — with **no additional Cerebras requests** beyond the existing cascade.
2. `explainer.html` still runs Mock/Real + Entry/Expert + Record, now with a persistent transcript and node-click focus, and a cinematic look.
3. Embed visuals use design tokens (no cyan/violet neon, no banned gradient); showcase keeps the galaxy.
4. `prefers-reduced-motion` stops auto-rotate and decorative motion on both surfaces.
5. `npm run typecheck` and `npm test` pass; new reducer tests cover ordered beats + node→beat.
6. Controls have visible focus states; layouts hold at tablet/mobile widths.

## 12. Risks / mitigations

- **Right-rail performance:** a second WebGL canvas in the app. Mitigate with compact size, low bloom, capped cooldown, and reduced-motion settling. If contention shows, lazy-mount the embed graph only while `building` / shortly after.
- **Layout intrusion:** App is OWNER A. Keep the App change surgical — swap one block, import shared components, no restructuring.
- **Palette distinction in embed:** few semantic tokens for several roles; use lightness variation within `--blue` for the build agents to keep them distinct yet cohesive.
