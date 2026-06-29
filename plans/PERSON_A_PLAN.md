# AugurForge — Andreas Spec · Multi-Agent Swarm + Animated Market-Data Sandbox

> **For Andreas (Person A).** Standalone kickoff: read this, then `CLAUDE.md` + `src/core/contract.ts`.
> Drive your session with `/goal` + **superpowers** (writing-plans → TDD) + **ECC** (`/plan`, code-review, security-review).
> Mock-first; conventional commits; small PRs to `main`.

**Goal:** Own the *intelligence* and the *visual sandbox* — the 6-agent Gemma-4-on-Cerebras swarm and the
2D/3D animated visualization of market models — and make Cerebras speed unmistakable on screen.

**Architecture:** Agents call `chat()` (mock + live SSE through the key-proxy); `pipeline.ts` emits
render-on-resolve `AgentEvent`s; a model's `run()` produces a standardized `SimResult`; `/src/viz`
renders any standard shape in 2D (Plotly) and 3D (Three.js) with Animate; the generative path lets
Gemma compile a brand-new model live. **Leo's Manim deep-path consumes the same `SimResult` + narrative.**

**Tech stack:** Vite + React + TypeScript, Plotly.js (2D), Three.js (3D), Express key-proxy, `gemma-4-31b` on Cerebras.

---

## Ownership (keep merges trivial)
- **You (Andreas) own:** `/src/core` (agents, pipeline, generative, cerebras), `/src/app` (UI, Renderer, SpeedHud, Uploader), `/src/viz` (2D/3D + animation), `/server` (proxy).
- **Leo owns:** `/render-service` (the Manim deep-path explainer) + future features (RAG / graph). He **reads** your output; he does not edit your folders.
- **Both:** import shared types from `src/core/contract.ts`; **never redefine** them. Contract changes need a 2-second mutual OK.

## DONE — already merged to `main` (do not rebuild)
Real agents (prompts + JSON schemas, Modeler vision), `src/core/generative.ts` (safe declarative → deterministic
Black-Scholes, no LLM-JS eval, pre-tested fallback), the UI redesign, **Vite 5 → 8** (run `npm install` after pulling).
Verified at merge: `tsc --noEmit` clean, `npm run build` passes, contract byte-clean, Monte Carlo hero intact.

## FIX FIRST — review punch-list (all in your folders)
1. **[HIGH]** `src/core/agents/modeler.ts` (~L130) — tautological ternary `modelKind === 'black-scholes' ? 'black-scholes' : 'black-scholes'`; make it a real guard / fall back when invalid.
2. **[HIGH]** `src/core/generative.ts` (~L327) — `sx()` divides by `(xMax - xMin)`; guard `if (xMax <= xMin) return;` (public `RenderFn`, edge case → NaN coords).
3. **[MED]** `src/app/SpeedHud.tsx` — `onClick={() => void runRace()}` + a `cancelledRef` checked before each `setRace` (floating promise + no unmount guard).
4. **[MED]** `server/proxy.ts` — add `express-rate-limit` on `/api/chat` (CORS is the only throttle today).
5. **[LOW]** `src/app/App.tsx` (~L177) — drop spurious `onEvent` from `runCascade` deps → `[sinkFor]`.
6. **[LOW]** `src/core/agents/modeler.ts` (~L102) — omit `generatedSpec` on the monte-carlo path (feeds the live Visualizer contradictory context).

## THE SEAM WITH LEO — freeze this together before he starts Manim
Leo's Manim deep-path turns the *current scenario* into an explanatory video. It must consume a stable
payload you expose. Agree on this and keep it stable:
```ts
// A standardized, render-agnostic shape vocabulary every model's run() can emit.
// Keep it TINY — these 4 cover the whole §18 model landscape; use the custom-renderer escape hatch for the rare novel viz.
type VizShape =
  | { kind: 'fan';          x: number[]; bands: { lower: number[]; upper: number[] }[]; median?: number[] }
  | { kind: 'distribution'; values: number[]; markers?: { label: string; value: number }[] }
  | { kind: 'curve';        series: Series[] }
  | { kind: 'surface';      x: number[]; y: number[]; z: number[][] };

// Carry shapes in SimResult.raw.shapes by convention (no contract.ts edit needed), e.g.
//   return { metrics, raw: { shapes: [{ kind:'fan', ... }, { kind:'distribution', ... }] } }

// What the deep-path (Leo) reads — expose this from the app for the current scenario:
interface ExplainPayload {
  templateId: string;
  title: string;
  params: ParamSet;
  sim: SimResult;                                   // includes raw.shapes
  metrics: Metric[];
  narrative: { sensitivity?: string; explainer?: Explainer; risk?: RiskFlag[] };
}
```
**Your job for the seam:** standardize `run()` to emit `raw.shapes`, and expose `ExplainPayload` (a `getExplainPayload()`
in `/src/app` or POST it to the render-service). **Leo's job:** a Manim renderer per `VizShape.kind` that reads `ExplainPayload`.

---

## Feature branches (priority order)

### 1. `feat/agents-live` — make the multi-agent collaboration real & live · HIGH · ~3h
Exercise the swarm against real `gemma-4-31b` (`$env:CEREBRAS_API_KEY="<key>"; $env:VITE_USE_LIVE="true"; npm run dev:live`),
fix the punch-list, and confirm each structured agent returns schema-valid JSON. Make the **collaboration visible**:
per-agent cascade chips, live `time_info`, render-on-resolve panels.
- **Files:** `src/core/agents/*`, `src/core/pipeline.ts`, `src/app/App.tsx`, `src/app/SpeedHud.tsx`.
- **Acceptance:** live run from `src/mock/sample-image.png` fills the cascade with real Gemma output; `tsc` clean; mock still works; real TTFT/tok-s shown.

### 2. `feat/viz-shapes` — standardize shapes + generic 2D/3D renderers + Animate · HIGH · ~3h
Implement the `VizShape` vocabulary above and make `/src/viz` render *any* shape generically in 2D (Plotly) and 3D (Three.js),
with Animate. Refactor `src/templates/monte-carlo.ts` to emit `raw.shapes` (it becomes the reference). This unlocks both Leo's
Manim and the generative path "for free."
- **Files:** `src/viz/plotly2d.ts`, `src/viz/three3d.ts`, a new `src/viz/render-shapes.ts`, `src/templates/monte-carlo.ts`, `src/app/Renderer.tsx`.
- **Acceptance:** Monte Carlo renders 2D + 3D + Animate from `raw.shapes`; switching view never re-runs math; `tsc` clean.

### 3. `feat/market-data` — visualize real market data · MED · ~3h
Seed models with **real** market figures (S&P/index σ & drift from FRED or Yahoo, VIX, a Treasury yield curve) and show them
as animated 2D/3D market visualizations (GBM fan of an index; a 3D vol/term surface). Bundle a small slice into `src/mock/` and record provenance in `DATA_SOURCES.md`.
- **Files:** `src/mock/*`, `DATA_SOURCES.md`, a market template/seed in `src/templates/` *(coordinate with Leo only on `/src/mock`; it is shared data)*.
- **Acceptance:** the hero opens on a credible real-market scenario; the 3D market viz animates; mock works offline.

### 4. `feat/generative-plus` — harden generation + a non-finance kicker · MED · ~3h
Harden `generative.ts` (apply punch-list #2), and add **one non-finance** generated model kind (e.g. an epidemic SIR curve or a
projectile sim) to prove "Gemma builds *any* model, live." Same validate → compile → fallback pattern; never `eval`. Emit `raw.shapes` so it renders + animates automatically.
- **Files:** `src/core/generative.ts`, `src/core/agents/{modeler,visualizer}.ts`.
- **Acceptance:** a prompt for a model not in the library renders live in ~1s with a working slider; the non-finance one renders too; fallback never blank-screens.

### 5. `feat/speed-harness` — the on-camera Cerebras speed proof · MED · ~2h
Real GPU baseline (e.g. Gemini) via `provider:'baseline'` → proxy `/api/baseline`; overlay live ms / tok-s for both.
- **Files:** `src/app/SpeedHud.tsx`, `src/core/cerebras.ts`, `server/proxy.ts`.
- **Acceptance:** Cerebras visibly finishes first with live numbers; baseline clearly labeled (real or simulated); mock race works with no keys.

### 6. `feat/integration` — QA + record + submit · MED · ~4h + recording
First live end-to-end; reliability pass + deterministic fallbacks; record the **≤60s video** (BUILD_SPEC §16); post the **3 Discord
submissions** (`#g4hackathon-multiverse-agents`; `#g4hackathon-people-choice` + X post tagging @Cerebras @googlegemma; `#g4hackathon-enterprise-impact`). Drop in Leo's pre-rendered Manim clip as a video asset.

## Contract slice you depend on (import from `src/core/contract.ts` — never redefine)
```ts
type AgentId='orchestrator'|'modeler'|'visualizer'|'sensitivity'|'risk'|'explainer';
interface AgentEvent{agent:AgentId;status:'start'|'token'|'done'|'error';delta?:string;result?:unknown;timeInfo?:TimeInfo;error?:string}
interface SimResult{paths?:number[][];series?:Series[];metrics:Metric[];raw?:Record<string,unknown>}  // put shapes in raw.shapes
interface DashboardSpec{templateId:string;title:string;subtitle?:string;sliders:SliderDef[];views:('2d'|'3d')[];defaultView:'2d'|'3d';explainer?:{entry:string;expert:string}}
// chat(opts{messages,model?,stream?,responseFormat?,reasoningEffort?,provider?,mock?},onToken?):Promise<{text,json?,timeInfo}>
// pipeline.ts: PipelineInput, TweakContext, PipelineResult{...;generatedTemplate?}
```

## Rules · checkpoints · timeline
- Only edit `/src/core`, `/src/app`, `/src/viz`, `/server`. Don't touch `/render-service` (Leo). **security-review** before proxy PRs.
- Mock-first: keep `VITE_USE_LIVE=false` working at every step.
- **Checkpoints:** freeze the seam (`VizShape` + `ExplainPayload`) with Leo *first* → first **live** end-to-end (`feat/agents-live`) → **feature freeze** (~T+18h) → record + submit (resubmits allowed until **Mon 10:00 AM PDT**).
- **Order:** seam → `feat/agents-live` → `feat/viz-shapes` → `feat/market-data` → `feat/generative-plus` → `feat/speed-harness` → `feat/integration`.