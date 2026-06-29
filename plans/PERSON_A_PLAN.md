# AugurForge — Andreas Spec · Gemma-4-on-Cerebras Simulation Engine + Market Sandbox

> **For Andreas (Person A).** Standalone kickoff: read this, then `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`,
> and `src/core/contract.ts`. Drive with `/goal` + **superpowers** (writing-plans → TDD) + **ECC**.
> Mock-first; conventional commits; small PRs to `main`.

**Goal:** Own the **entire simulation engine and the multi-agent market-data sandbox** — where
**Gemma-4-on-Cerebras is the brain** and a tiny deterministic JS calculator is the *only* non-AI part.

**Architecture:** Agents (`/src/core/agents`) are each a `gemma-4-31b` call via the key-proxy; `pipeline.ts`
streams `AgentEvent`s render-on-resolve; a model's `run()` does honest deterministic math → `SimResult`;
`/src/viz` renders standard shapes in 2D (Plotly) + 3D (Three.js) with Animate; the generative path lets
Gemma write a brand-new model live. Leo's Manim deep-path consumes your `SimResult` + narrative.

**Tech stack:** Vite + React + TS, Plotly, Three.js, Express key-proxy, `gemma-4-31b` on Cerebras.

## The core feature you own (state it plainly)
AugurForge's heart is an **interactive market-data simulation sandbox**, and the intelligence is **all
Gemma-4-on-Cerebras**: the Orchestrator picks the model; the **Modeler reads messy input — including a
chart/screenshot image — and infers the model + parameters**; the Visualizer designs the dashboard; the
**generative path has Gemma write a brand-new model live**; Sensitivity/Risk/Explainer narrate and flag.
The **only** non-AI piece is a small deterministic `run()` doing the arithmetic so Gemma never fabricates
numbers. **Remove Gemma → there is no product.** You own this end-to-end: `/src/core`, `/src/app`,
`/src/viz`, `/server`. (Leo owns `/render-service` + future features and *consumes* your output.)

## Make it MORE Gemma-4-on-Cerebras (the bar to clear)
- **Every** model choice, input reading, generation, narration, and risk judgment is a `gemma-4-31b` call —
  and the UI should *show* it (per-agent cascade, labels, live `time_info`).
- **Breadth comes from Gemma, not hand-coding.** The **generative path** is how you cover models beyond the
  anchors: Gemma emits a *validated declarative spec* → compiled to *deterministic* math (never `eval` LLM JS),
  with a pre-tested fallback. Hand-build only a couple of anchors; let Gemma generate the rest live — that is
  the un-fakeable hero *and* the speed story.
- **Speed is the proof.** Surface TTFT / tokens-sec everywhere; the Cerebras-vs-baseline race; the instant cascade.

## Model modules (beyond Monte Carlo) — flexible; favor generation
Anchors to have on hand (hand-built *or* Gemma-generated — your call which):
- **Monte Carlo / GBM ruin** — the HERO (built; the last commit regressed it — see punch-list).
- **Black-Scholes + Greeks** — already shipped through the generative path (pricing curve + Greeks surface).
- **Value at Risk / Expected Shortfall** — loss distribution + VaR/ES cutoffs.
- **A volatility / term surface or yield curve (3D)** — strong "market data in 3D" visual.
- **One NON-finance generated model** (e.g. an epidemic SIR curve) as the "Gemma builds *any* model, live" kicker.

Pick which to hand-build vs generate — **lean on the generative path for breadth**. Every model emits standard
`VizShape`s (below) so it renders + animates + explains for free. **You have full latitude** to polish,
restructure, or add visualizations however you judge best (your `PRODUCT.md`/`DESIGN.md` govern the look).
The only fixed constraints: (1) don't redefine `contract.ts` types; (2) keep the `VizShape`/`ExplainPayload`
seam stable for Leo's Manim; (3) keep mock-first working. Everything else — models, viz, animation — is yours.

## FIX FIRST — punch-list from the latest merge review
**New regressions from the "tighten math accuracy" commit (confirmed on current `main`):**
1. **[HIGH]** `src/templates/monte-carlo.ts` `percentile()` — you swapped linear interpolation for **nearest-rank rounding**; cone edges now **snap** as the horizon slider moves and VaR-95 is slightly off. Restore the interpolating form (`rank=p/100*(n-1); lo=floor; hi=ceil; arr[lo]+(arr[hi]-arr[lo])*(rank-lo)`).
2. **[HIGH]** `src/templates/monte-carlo.ts` `run()` — you dropped the `finiteParam`/`clamp` guards; a non-finite param (e.g. NaN from a bad Gemma response) now silently fills all 500 paths with NaN → metrics show "NaN%". Horizon min also slipped 5→1. Restore `clamp(finiteParam(...), min, max)` for sigma/drift/horizon.
3. **[MED]** `src/core/agents/shared.ts` — schema `strict:true → false`. If Cerebras requires it (your transformer suggests so), add a one-line comment saying why; otherwise restore `strict:true`.
4. **[LOW]** `src/templates/monte-carlo.ts` — `raw` dropped `sigma`/`mu`/`nPaths`/etc. **Restore them** — Leo's Manim/render-service reads `raw` through the `ExplainPayload` seam.
5. **[LOW]** `CRITIQUE.md` — reword "Track 1 only / don't spend time on Track 3 + People's Choice copy": the **3 Discord submissions still stand** (build spec §16 + your branch `feat/integration`); only net-new marketing copy is deprioritized.
6. **[LOW]** `CRITIQUE.md` — proxy limit is **12 MB**, not ~9 MB.

**Also re-verify** (your push-2 may already have fixed these from the prior review): modeler `modelKind` tautology, `generative.ts` divide-by-zero guard in `sx()`, `SpeedHud` unmount guard, proxy rate-limit.

## The seam Leo depends on (freeze together first)
```ts
type VizShape =
  | { kind: 'fan';          x: number[]; bands: { lower: number[]; upper: number[] }[]; median?: number[] }
  | { kind: 'distribution'; values: number[]; markers?: { label: string; value: number }[] }
  | { kind: 'curve';        series: { name: string; x: number[]; y: number[] }[] }
  | { kind: 'surface';      x: number[]; y: number[]; z: number[][] };
// run() emits these in SimResult.raw.shapes. Expose the current scenario as ExplainPayload for Leo's Manim:
interface ExplainPayload { templateId: string; title: string; params: Record<string,number>;
  sim: { metrics: {id:string;label:string;value:string}[]; raw?: { shapes?: VizShape[] } };
  narrative: { sensitivity?: string; explainer?: {entry:string;expert:string}; risk?: {level:string;text:string;ref?:string}[] } }
```

## Feature branches (priority order)
1. **`feat/agents-live`** — make the swarm real against `gemma-4-31b` (env-var key), fix the punch-list, show the cascade + `time_info`. *Acceptance:* live run from `src/mock/sample-image.png`; `tsc` clean; mock still works.
2. **`feat/generative`** *(the breadth engine — prioritized)* — harden the validate→compile→fallback path; add the non-finance kicker; emit `raw.shapes` so generated models render/animate/explain for free. *Acceptance:* a not-in-library prompt renders live in ~1s with a working slider; fallback never blank-screens.
3. **`feat/viz-shapes`** — implement the `VizShape` vocabulary + generic 2D/3D renderers + Animate; refactor Monte Carlo to emit `raw.shapes` (reference). *Acceptance:* MC renders 2D+3D+Animate from shapes; switching view never re-runs math.
4. **`feat/market-data`** — seed with real market figures (FRED/Yahoo σ & drift, VIX, a Treasury curve) + animated 2D/3D market viz. *Acceptance:* hero opens on a credible real scenario; 3D market viz animates; mock works.
5. **`feat/speed-harness`** — real Cerebras-vs-baseline race + live ms/tok-s. *Acceptance:* Cerebras visibly first; mock race works keyless.
6. **`feat/integration`** — QA + the ≤60s video + the **3 Discord submissions** (Multiverse Agents; People's Choice + X post tagging @Cerebras @googlegemma; Enterprise Impact). Drop in Leo's Manim clip.

## Rules · checkpoints · timeline
- Only edit `/src/core`, `/src/app`, `/src/viz`, `/server`. Never redefine `contract.ts`; keep the seam stable; **security-review** before proxy PRs.
- Mock-first at every step. **Checkpoints:** freeze the seam with Leo → first **live** end-to-end (`feat/agents-live`) → **feature freeze** (~T+18h) → record + submit (resubmits until **Mon 10:00 AM PDT**).
- **Order:** seam + punch-list → `feat/agents-live` → `feat/generative` → `feat/viz-shapes` → `feat/market-data` → `feat/speed-harness` → `feat/integration`.