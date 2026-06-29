# AugurForge — Person B Plan · Templates / Viz / Polish / Manim

> **Standalone kickoff.** Read **this**, then `CLAUDE.md`, `src/core/contract.ts`, and
> `src/templates/monte-carlo.ts` (your reference pattern). Drive with `/goal` + **superpowers**
> (writing-plans → test-driven-development) + **ECC** (`/plan`, code-review). **Mock-first. Commit small. PR to `main`.**
> Full spec: `AugurForge_BUILD_SPEC.md` (§9 = the template pattern, §18 = the model library).

## Who you are + your goal
You own **breadth + polish**: the 4 remaining templates in **2D + 3D + Animate** (copying the Monte
Carlo pattern), visual polish, real demo data, and the Manim deep-path (stretch). You work in bursts;
each branch is self-contained, so unfinished ones simply don't merge — **`main` always demos**.

**You own (edit only these):** `/src/templates/*`, `/src/viz` (extensions), `/render-service`.
**Do NOT edit:** `/src/core`, `/src/app`, `/server` (Person A). **Never redefine** the types in
`src/core/contract.ts` — import them.

**First moves:** `/goal build the 4 templates in 2D + 3D + Animate`, then `npm install && npm run dev`
(mock, no key), open the Monte Carlo template in the app, and read `src/templates/monte-carlo.ts` top
to bottom — that file is your template for everything below.

## The pattern (copy `src/templates/monte-carlo.ts`)
Every model is a `TemplateModule`: `{ id, spec, run(params), render2D?, render3D? }`.
- **`run(params)`**: `ParamSet → SimResult`. PURE, deterministic, **client-side** (seed your RNG like
  monte-carlo does so charts are stable). **No LLM** — Gemma only interprets these numbers.
- **`render2D` / `render3D`**: `(el, sim, opts) => Renderer`. Compose the `/src/viz` helpers; return
  `{ update, destroy }`. `update(sim, animate)` repaints without recreating the canvas.
- **`spec`**: a `DashboardSpec` with `sliders`, `views` (e.g. `['2d','3d']`), `defaultView`, and
  `explainer { entry, expert }`. Register the module in `src/templates/index.ts` (it already imports all 5).

## Contract slice you depend on (import from `src/core/contract.ts` — never redefine)
```ts
interface SliderDef { id: string; label: string; min: number; max: number; step: number; value: number; unit?: string }
type ParamSet = Record<string, number>;
interface Metric { id: string; label: string; value: string }        // value is pre-formatted, e.g. '2.3%'
interface Series { name: string; x: number[]; y: number[] }
interface SimResult { paths?: number[][]; series?: Series[]; metrics: Metric[]; raw?: Record<string, unknown> }
interface Explainer { entry: string; expert: string }
interface DashboardSpec { templateId: string; title: string; subtitle?: string; sliders: SliderDef[]; views: ViewKind[]; defaultView: ViewKind; explainer?: Explainer }
interface RenderOpts { animate: boolean; theme: 'light' | 'dark' }
interface Renderer { update(sim: SimResult, animate: boolean): void; destroy(): void }
type RenderFn = (el: HTMLElement, sim: SimResult, opts: RenderOpts) => Renderer;
interface TemplateModule { id: string; spec: DashboardSpec; run(params: ParamSet): SimResult; render2D?: RenderFn; render3D?: RenderFn }
```

## Viz helpers you reuse (from `/src/viz` — extend, don't duplicate)
```ts
// src/viz/plotly2d.ts
PALETTE, baseLayout(theme), conePair(x, lower, upper, fill), medianLine(x, y),
samplePaths(x, paths, n?), terminalHistogram(values), barrierShape(x0, x1, level),
mount(el, traces, layout), purge(el), revealX(el, xMin, xMax, durationMs?)
// src/viz/three3d.ts
BOX, FieldRanges { tMax, vMin, vMax, barrier, s0 },
createScene(el, theme) -> SceneHandle { scene, camera, renderer, controls, setAutoRotate, onFrame, dispose },
densitySurface(paths, time, ranges), ribbonLines(paths, time, ranges), barrierPlane(ranges), clearGroup(group)
```
If a model needs a new shape (a survival curve line, a shaded VaR cutoff, a 3D loss mountain), **add a
helper to `/src/viz`** and reuse it across templates — keep render code DRY.

---

## Feature branches (priority order)

### 1. `feat/template-compound` — Compound Interest / TVM (warmup) · COMPLEXITY: LOW · ~1.5h
**Build:** Future value of money. `run`: `FV = PV·(1+r/n)^(n·t)` (+ optional periodic contribution). Sliders:
`rate`, `years`, `contribution`. 2D: a growth curve plus a principal-vs-interest stacked area. `views: ['2d']`
(add a simple 3D FV surface over rate×time only if time permits). Easiest model — do it first to learn the pattern.
- **Files (yours):** `src/templates/compound-interest.ts` (replace the stub); maybe a `lineSeries` helper in `src/viz/plotly2d.ts`.
- **Acceptance:** renders 2D; dragging `rate`/`years` updates the curve + a "Final value" metric live; `tsc --noEmit` clean; works in mock.

### 2. `feat/template-var` — Value at Risk / Expected Shortfall · COMPLEXITY: MED · ~3h
**Build:** A loss distribution (normal or seeded-historical). `run`: compute **VaR** and **ES** at the chosen
confidence. Sliders: `confidence` (90–99.5), `volatility`, `horizon`. 2D: loss histogram with the VaR & ES
cutoffs shaded. 3D: a VaR **surface** over (confidence × volatility). Pairs naturally with the Monte Carlo hero.
- **Files (yours):** `src/templates/var.ts`; reuse `terminalHistogram` + add a shaded-cutoff + surface helper in `/src/viz`.
- **Acceptance:** renders 2D + 3D + Animate; dragging `confidence` moves the cutoff and updates `95% VaR` / `ES` metrics live; tsc clean; mock.

### 3. `feat/template-mortality` — Mortality / Survival · COMPLEXITY: MED · ~3h
**Build:** Gompertz–Makeham survival. `run`: survival `S(x)`, `lx`, life expectancy. Sliders: `age`,
`improvement` (mortality-improvement %), optional Gompertz params. 2D: survival curve + `lx`. 3D: survival
**surface** over (age × cohort/improvement). Visually distinct from the finance models — good demo variety.
- **Files (yours):** `src/templates/mortality.ts`; add a `curve`/`surface` helper in `/src/viz` if needed.
- **Acceptance:** renders 2D + 3D + Animate; dragging `improvement` reshapes the curve and updates "Life expectancy" live; tsc clean; mock.

### 4. `feat/template-aggloss` — Aggregate Loss / Reserving · COMPLEXITY: MED · ~3h
**Build:** Compound frequency–severity (Poisson frequency × lognormal severity), seeded Monte Carlo of the
aggregate loss. `run`: aggregate-loss distribution + reserve at a percentile. Sliders: `frequency` (λ),
`severity_mean`, `severity_cv`. 2D: aggregate-loss histogram + a reserve marker. 3D: a loss "mountain"
(reuse `densitySurface`). metrics: mean loss, 99.5% reserve.
- **Files (yours):** `src/templates/aggregate-loss.ts`; reuse `densitySurface` + `terminalHistogram`.
- **Acceptance:** renders 2D + 3D + Animate; dragging `frequency` shifts the distribution and updates the reserve metric live; tsc clean; mock.

### 5. `feat/polish` — depth text · theme · real demo data · COMPLEXITY: LOW/MED · ~2h
**Build:** Write good `explainer.entry` / `explainer.expert` text per template (the depth-toggle **UI is A's and
already works** — you supply the text). Visual polish on the chart themes. Bundle **real** demo data into
`src/mock/`: a real loss-triangle image (CAS) and real σ from FRED for the GBM defaults; record provenance in
`DATA_SOURCES.md`.
- **Files (yours):** each `src/templates/*.ts` (explainer text), `src/viz/*` (theme tweaks), `src/mock/*` + `DATA_SOURCES.md` (data only — **coordinate with A**, `/src/mock` is shared).
- **Acceptance:** entry/expert toggle shows distinct, correct text per template; demo data looks credible; tsc clean.

### 6. `feat/manim` — render-service deep path (STRETCH) · COMPLEXITY: HIGH · time-permitting
**Build:** Flesh out `render-service/main.py`: `POST /manim {script}` → renders Manim + LaTeX + FFmpeg → returns
an mp4 URL. **Pre-render ONE polished clip** as a static video asset for the demo. Off the critical path —
never let it threaten a clean build or the recording.
- **Files (yours):** `render-service/*`. **Acceptance:** `/health` ok; one clip renders to mp4; the app can show it async.

## Rules
- Only edit `/src/templates/*`, `/src/viz`, `/render-service`. Import shared types from `contract.ts`; **never redefine** them.
- Don't refactor A's files (`/src/core`, `/src/app`, `/server`). A contract change needs **A's agreement** (frozen).
- **Mock-first:** every template must work with `VITE_USE_LIVE=false` (no key). One template per branch; small commits; PR to `main`.
- Reuse `/src/viz` helpers; add new shared helpers there rather than inlining per-template. Skills: superpowers **writing-plans → TDD**, ECC **/plan**, **code-review**.

## Integration + merge checkpoints (BUILD_SPEC §14)
1. **Contract frozen** (done — `scaffold` tag) — build against it.
2. **First end-to-end** is A's milestone; you don't block on it (mock-first).
3. **Feature freeze** (~T+18h) — land whatever templates are solid; unfinished branches just don't merge.
4. **Record + submit** is A's, but make sure your merged templates demo cleanly first.

## Your slice of the 24h timeline
- **0–1h:** read `monte-carlo.ts` + this plan; `npm run dev`; pick `feat/template-compound` as the warmup.
- **1–6h:** `feat/template-compound` → `feat/template-var` (first two templates merged).
- **6–14h:** `feat/template-mortality` + `feat/template-aggloss` (+ Animate variants).
- **14–18h:** `feat/polish` (depth text, theme, real demo data); help A integrate; **feature freeze**.
- **stretch:** `feat/manim` — pre-render one clip if core is rock-solid.