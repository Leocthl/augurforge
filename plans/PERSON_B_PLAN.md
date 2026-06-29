# AugurForge — Person B Plan · **Leo** · Templates / Viz / Polish / Manim

> **Standalone kickoff.** Read **this**, then `CLAUDE.md`, `src/core/contract.ts`, and
> `src/templates/monte-carlo.ts` (your reference pattern). Drive with `/goal` + **superpowers**
> (writing-plans → TDD) + **ECC**. Mock-first; commit small; PR to `main`.
>
> **STATUS:** `main` now includes **Andreas's (Person A) merged work** — real agents, the generative
> Black-Scholes path, and a **UI redesign on Vite 8**. **Before you start:** `git checkout main && git pull && npm install`
> (deps changed), then `npm run dev` to see the new workbench UI + the Monte Carlo hero + the generated demo.

## Who you are
**Leo — Person B.** You own `/src/templates/*`, `/src/viz` (extensions), `/render-service`. Do **not** edit
`/src/core`, `/src/app`, `/server` (Andreas / Person A). **Never redefine** the types in `src/core/contract.ts`.

## Your open lane (Andreas did NOT touch any of this — confirmed in the merge review)
The **4 remaining templates** + viz extensions + polish + real demo data + Manim. `src/templates/monte-carlo.ts`
is your fully-built reference (GBM math + Plotly fan/histogram + Three.js mountain + Animate) — copy its shape.

## The pattern (copy `monte-carlo.ts`)
A `TemplateModule` = `{ id, spec, run(params), render2D?, render3D? }`. `run` is PURE, deterministic, client-side
(seed your RNG). `render2D/3D` compose `/src/viz` helpers and return `{ update, destroy }`. Register in `src/templates/index.ts`.
> Note: Andreas's *generated* models use a self-contained SVG renderer in `/src/core`. **Your library templates should use
> the `/src/viz` helpers** (`plotly2d` / `three3d`) per the Monte Carlo pattern — add shared shapes to `/src/viz`, don't inline.

## Contract slice you depend on (import from `src/core/contract.ts` — never redefine)
```ts
interface SliderDef{id:string;label:string;min:number;max:number;step:number;value:number;unit?:string}
type ParamSet=Record<string,number>;
interface Metric{id:string;label:string;value:string}            // value pre-formatted, e.g. '2.3%'
interface Series{name:string;x:number[];y:number[]}
interface SimResult{paths?:number[][];series?:Series[];metrics:Metric[];raw?:Record<string,unknown>}
interface DashboardSpec{templateId:string;title:string;subtitle?:string;sliders:SliderDef[];views:('2d'|'3d')[];defaultView:'2d'|'3d';explainer?:{entry:string;expert:string}}
interface RenderOpts{animate:boolean;theme:'light'|'dark'} interface Renderer{update(sim:SimResult,animate:boolean):void;destroy():void}
type RenderFn=(el:HTMLElement,sim:SimResult,opts:RenderOpts)=>Renderer;
interface TemplateModule{id:string;spec:DashboardSpec;run(params:ParamSet):SimResult;render2D?:RenderFn;render3D?:RenderFn}
```

## Viz helpers you reuse (from `/src/viz` — extend, don't duplicate)
```ts
// plotly2d.ts: PALETTE, baseLayout(theme), conePair(x,lower,upper,fill), medianLine(x,y), samplePaths(x,paths,n?),
//              terminalHistogram(values), barrierShape(x0,x1,level), mount(el,traces,layout), purge(el), revealX(el,xMin,xMax,ms?)
// three3d.ts:  BOX, FieldRanges{tMax,vMin,vMax,barrier,s0}, createScene(el,theme)->SceneHandle{...,setAutoRotate,onFrame,dispose},
//              densitySurface(paths,time,ranges), ribbonLines(paths,time,ranges), barrierPlane(ranges), clearGroup(group)
```

## Feature branches (priority order)
### 1. `feat/template-compound` — Compound Interest / TVM (warmup) · LOW · ~1.5h
`FV = PV·(1+r/n)^(n·t)` (+ optional contribution). Sliders: `rate`, `years`, `contribution`. 2D growth curve + principal-vs-interest
area; `views:['2d']`. **Acceptance:** renders 2D; dragging updates the curve + a "Final value" metric live; `tsc` clean; mock.
### 2. `feat/template-var` — Value at Risk / Expected Shortfall · MED · ~3h
Loss distribution; compute VaR + ES at confidence. Sliders: `confidence`, `volatility`, `horizon`. 2D histogram with shaded
VaR/ES cutoffs; 3D VaR surface. **Acceptance:** 2D+3D+Animate; dragging `confidence` moves cutoff + updates VaR/ES live.
### 3. `feat/template-mortality` — Mortality / Survival · MED · ~3h
Gompertz–Makeham survival; sliders `age`, `improvement`. 2D survival curve + `lx`; 3D survival surface. metric: life expectancy.
### 4. `feat/template-aggloss` — Aggregate Loss / Reserving · MED · ~3h
Compound Poisson–lognormal (seeded MC). Sliders `frequency`, `severity_mean`, `severity_cv`. 2D aggregate histogram + reserve
marker; 3D loss mountain (reuse `densitySurface`). metrics: mean, 99.5% reserve.
### 5. `feat/polish` — depth text · theme · real demo data · LOW/MED · ~2h
Write `explainer.entry`/`expert` text per template (the depth-toggle UI is A's, already works). Visual polish. Bundle a **real**
loss-triangle image + real σ (FRED) into `src/mock/` (data only — coordinate with Andreas; `/src/mock` is shared); update `DATA_SOURCES.md`.
**Quick fix while here:** `src/templates/_stub.ts` interpolates its `label` into `innerHTML` (latent XSS) — use `textContent` or escape it.
### 6. `feat/manim` — render-service deep path (STRETCH) · HIGH · time-permitting
`render-service/main.py`: `POST /manim {script}` → mp4. Pre-render **one** polished clip as a static asset. Off the critical path.

**Every branch acceptance:** renders 2D (+3D where applicable), Animate works, dragging a slider updates chart + metrics live,
`tsc --noEmit` clean, runs in mock (`VITE_USE_LIVE=false`). One template per branch; PR to `main`.

## Rules
- Only edit `/src/templates/*`, `/src/viz`, `/render-service`. Import shared types from `contract.ts`; **never redefine** them.
- Don't touch Andreas's `/src/core`, `/src/app`, `/server`. Reuse `/src/viz`; add new shared shapes there, not inlined per template.
- Mock-first; conventional commits; small PRs. Skills: superpowers **writing-plans → TDD**, ECC **/plan**, **code-review**.

## Merge checkpoints (BUILD_SPEC §14)
Contract frozen (done) → land templates as they pass (unfinished branches just don't merge; `main` always demos) →
**feature freeze** (~T+18h) → help Andreas verify the merged demo before record/submit.

## Your 24h slice
- **now:** pull `main`, `npm install`, `npm run dev`; read `monte-carlo.ts`; start `feat/template-compound`.
- **early:** `feat/template-compound` → `feat/template-var` (first two merged).
- **mid:** `feat/template-mortality` + `feat/template-aggloss` (+ Animate).
- **late:** `feat/polish` (depth text, theme, real demo data); **feature freeze**. Stretch: `feat/manim`.