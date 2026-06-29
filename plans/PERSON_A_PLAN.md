# AugurForge — Person A Plan · **Andreas** · Core / Agents / Generative / Finish

> **Standalone kickoff.** Read **this**, then `CLAUDE.md` + `src/core/contract.ts`. Drive with `/goal` +
> **superpowers** (writing-plans → TDD) + **ECC** (`/plan`, code-review, security-review). Mock-first; commit small; PR to `main`.
>
> **STATUS:** your first pass is **MERGED to `main`** (merge `035a234`). This plan is now **harden + finish**, not greenfield.

## Who you are
**Andreas — Person A.** You own `/src/core`, `/src/app`, `/server`. Do **not** edit `/src/templates`,
`/src/viz`, `/render-service` (that is Leo / Person B). **Never redefine** the types in `src/core/contract.ts`.

## DONE — already merged to main (do not rebuild)
- **All 6 agents** rewritten with real prompts + strict JSON schemas; **Modeler does vision** (reads the image).
- **`src/core/generative.ts`** — the generative hero: a **validated declarative spec → deterministic
  Black-Scholes math** (NO `eval` / `new Function` on LLM text), with a pre-tested fallback. Surfaced via
  `PipelineResult.generatedTemplate` (does not mutate the template registry).
- **UI redesign** in `App.tsx` + `index.css` (SaaS-workbench look); `SpeedHud`, `Uploader`, `cerebras.ts`,
  `pipeline.ts`, `server/proxy.ts` updated. **Vite upgraded 5.4 → 8.1** (run `npm install` after pulling).
- **Verified at merge:** `tsc --noEmit` clean, `npm run build` passes, contract byte-clean, Monte Carlo hero untouched, no LLM-JS eval.

## FIX FIRST — review punch-list (from the merge review; all in YOUR folders)
1. **[HIGH]** `src/core/agents/modeler.ts` (~L130) — tautological ternary `modelKind === 'black-scholes' ? 'black-scholes' : 'black-scholes'`. Make it a real guard, or fall back to the fallback spec when `modelKind` is invalid.
2. **[HIGH]** `src/core/generative.ts` (~L327) — `sx()` divides by `(xMax - xMin)`; if equal → NaN coords → blank chart. Guard `if (xMax <= xMin) return;` (or `const rangeX = xMax - xMin || 1`). `renderBlackScholes2D` is a public `RenderFn`.
3. **[MED]** `src/app/SpeedHud.tsx` — `runRace` is a floating promise with no unmount guard. `onClick={() => void runRace()}` + a `cancelledRef` checked before each `setRace`.
4. **[MED]** `server/proxy.ts` — no rate-limit on `/api/chat` (CORS is the only throttle). Add `express-rate-limit` (e.g. 120/min).
5. **[LOW]** `src/app/App.tsx` (~L177) — drop the spurious `onEvent` from `runCascade`'s deps (`[sinkFor]`).
6. **[LOW]** `src/core/agents/modeler.ts` (~L102) — `mockModel` sets `generatedSpec` even on the monte-carlo path; omit it there (it feeds the live Visualizer contradictory context).

## Remaining feature branches (priority order)
### 1. `feat/agents-live` — exercise + harden against the real tier · ~2–3h
Run live with the env-var key (`$env:CEREBRAS_API_KEY="<key>"; $env:VITE_USE_LIVE="true"; npm run dev:live`), confirm each
structured agent returns schema-valid JSON from real `gemma-4-31b`, fix the punch-list above, and confirm real
`time_info` in the HUD. **Acceptance:** live cascade fills from `src/mock/sample-image.png`; `tsc` clean; mock still works.
### 2. `feat/speed-harness` — real Cerebras-vs-baseline race · ~2–3h
Wire a real GPU baseline (e.g. Gemini) via `provider:'baseline'` → proxy `/api/baseline`. **Acceptance:** Cerebras visibly
faster with live ms / tok-s for both; mock race still works; keys hidden on camera.
### 3. `feat/generative-plus` (optional) — more generated model kinds · time-permitting
`generative.ts` ships Black-Scholes; add 1–2 more safe `modelKind`s (same validate→compile→fallback pattern). Never `eval`.
### 4. `feat/integration` — QA + ship · ~4h + recording
First live end-to-end on Monte Carlo + the generated model; reliability pass + deterministic fallbacks; record the **≤60s
video** (§16 beats); post the **3 Discord submissions** (`#g4hackathon-multiverse-agents`; `#g4hackathon-people-choice` + X
post tagging @Cerebras @googlegemma; `#g4hackathon-enterprise-impact`).

## Contract slice you depend on (import from `src/core/contract.ts` — never redefine)
```ts
type AgentId='orchestrator'|'modeler'|'visualizer'|'sensitivity'|'risk'|'explainer';
interface AgentEvent { agent:AgentId; status:'start'|'token'|'done'|'error'; delta?:string; result?:unknown; timeInfo?:TimeInfo; error?:string }
type OnEvent=(e:AgentEvent)=>void;
interface OrchestratorResult{templateId:string;intent:string;notes?:string}
interface ModelerResult{templateId:string;params:ParamSet;sliders:SliderDef[];mapping?:Record<string,string>}
type VisualizerResult=DashboardSpec; interface RiskResult{flags:RiskFlag[]} interface ProseResult{text:string}
// chat(opts{messages,model?,stream?,responseFormat?,reasoningEffort?,provider?,mock?}, onToken?) : Promise<{text,json?,timeInfo}>
// pipeline.ts: PipelineInput{intent?;data?;imageDataUrl?;templateId?}  TweakContext{templateId;params;metrics;depth?;changed?}  PipelineResult{...;generatedTemplate?}
```

## Rules
- Only edit `/src/core`, `/src/app`, `/server`. Import shared types from `contract.ts`; **never redefine** them.
- Don't touch Leo's `/src/templates`, `/src/viz`, `/render-service`. Contract changes need **mutual agreement** (frozen).
- Mock-first: keep `VITE_USE_LIVE=false` working. Conventional commits; PR to `main`. **security-review** before proxy PRs.

## Merge checkpoints (BUILD_SPEC §14)
Contract frozen (done) → first **live** end-to-end (your `feat/agents-live`) → **feature freeze** (~T+18h) → record + submit
(resubmits allowed until **Mon 10:00 AM PDT**).

## Your 24h slice
- **now:** pull `main`, `npm install` (Vite 8), run live, knock out the punch-list.
- **next:** `feat/agents-live` → `feat/speed-harness`.
- **then:** integrate Leo's templates as they land; reliability pass; **feature freeze**.
- **last 6h:** record the 60s video; post the 3 Discord submissions + X post.