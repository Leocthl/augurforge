# AugurForge — Person A Plan · Core / Agents / Integration / Finish

> **Standalone kickoff.** Fresh Claude Code session: read **this**, then `CLAUDE.md` and
> `src/core/contract.ts`, then drive with `/goal` + **superpowers** (brainstorming → writing-plans →
> test-driven-development) + **ECC** (`/plan`, code-review, security-review). **Mock-first. Commit small. PR to `main`.**
> Full product spec: `AugurForge_BUILD_SPEC.md` (read §6–§17).

## Who you are + your goal
You own the **intelligence + integration + finish line**: make the Gemma-4-on-Cerebras swarm real,
build the speed-race and the live "Gemma writes a model in ~1s" hero, integrate everything, and ship
the 60-second video + the 3 Discord submissions.

**You own (edit only these):** `/src/core`, `/src/app`, `/server`.
**Do NOT edit:** `/src/templates/*`, `/src/viz`, `/render-service` (Person B). **Never redefine** the
types in `src/core/contract.ts` — import them.

**First moves:** `/goal make the 6-agent Gemma cascade real and ship the demo`, then
`npm install && npm run dev` (mock boots with no key) and `npm run typecheck`.

## Winning thesis (optimize for these — BUILD_SPEC §1)
1. **Speed = instant generation** — Gemma writes a whole model + viz + report in ~1s. Race this, not the slider.
2. **Streaming cascade** — never `await Promise.all`; paint each panel the instant its agent resolves.
3. **Un-fakeable Gemma moments** — (a) read a messy chart/sketch image; (b) generate a model not in the library, live.
4. **3D wow + Animate** is B's surface; you make the agents / speed / generation real.
5. **Multi-agent + multimodal** must be genuinely real (6 agents; the Modeler reads an image).

## Hard constraints (CLAUDE.md)
- Model **`gemma-4-31b`** on Cerebras (OpenAI-compatible). **Do not use another model.**
- Text + **image input**, text-only output. No audio, no image generation.
- **~100 RPM** (~1.6 req/s). Debounce tweaks to release, **≤3 calls per interaction**, sim runs client-side.
- Surface `time_info` (TTFT, tok/s) on screen. Decision-support — **"not advice."**
- **Secret handling on this machine:** the local AV quarantines any file containing the key, so the key is
  **NOT in `.env`** (it is keyless). Run live with the key as an env var:
  `$env:CEREBRAS_API_KEY="<key>"; $env:VITE_USE_LIVE="true"; npm run dev:live`. Never write the key to a file.

## Already built — DO NOT rebuild (verify, then extend)
- `src/core/cerebras.ts` — `chat()` with mock mode + **live SSE** + rate guard. Mock gives Cerebras a fast
  profile and `baseline` a slow one (for the race). `time_info` parsing is wired (confirm field names live).
- `src/core/pipeline.ts` — `runPipeline()` (orchestrator → modeler → visualizer) and `runTweak()`
  (sensitivity · risk · explainer in parallel). Render-on-resolve already emits `AgentEvent`s.
- `src/core/agents/*` — all 6 agents **stubbed**: they already call `chat()` (so live mode hits the proxy)
  and return mock structured results. Your job = real prompts + schemas. Markers: `TODO(branch: feat/agents)`.
- `src/app/*` — `App` (state + generation-guard + render-on-resolve), `Renderer`, `SpeedHud` (HUD + mock race), `Uploader`.
- `server/proxy.ts` — key-proxy with SSE passthrough, model pinned server-side, CORS allowlist.
- Monte Carlo template + viz helpers are **done** (B's surface) and live-verified (`gemma-4-31b`, ~7 ms smoke test).

## Contract slice you depend on (import from `src/core/contract.ts` — never redefine)
```ts
type AgentId = 'orchestrator'|'modeler'|'visualizer'|'sensitivity'|'risk'|'explainer';
type AgentStatus = 'start'|'token'|'done'|'error';
interface TimeInfo { ttftMs?: number; tokensPerSec?: number; totalTokens?: number; totalMs?: number }
interface AgentEvent { agent: AgentId; status: AgentStatus; delta?: string; result?: unknown; timeInfo?: TimeInfo; error?: string }
type OnEvent = (e: AgentEvent) => void;
interface OrchestratorResult { templateId: string; intent: string; notes?: string }
interface ModelerResult { templateId: string; params: ParamSet; sliders: SliderDef[]; mapping?: Record<string,string> }
type VisualizerResult = DashboardSpec;            // { templateId,title,subtitle?,sliders,views,defaultView,explainer? }
interface RiskResult { flags: RiskFlag[] }        // RiskFlag = { level:'ok'|'warning'|'danger'; text; ref? }
interface ProseResult { text: string }
interface AgentResultMap { orchestrator:OrchestratorResult; modeler:ModelerResult; visualizer:VisualizerResult; sensitivity:ProseResult; risk:RiskResult; explainer:ProseResult }
```
From `src/core/cerebras.ts` (yours to extend; signature stable):
```ts
chat(opts: {
  messages: ChatMessage[];            // OpenAI format; supports {type:'image_url',image_url:{url}}
  model?: string;                     // defaults to gemma-4-31b
  stream?: boolean;
  responseFormat?: object;            // JSON schema (strict) for structured agents
  reasoningEffort?: 'none'|'low'|'medium'|'high';
  provider?: 'cerebras'|'baseline';
  mock?: { text: string; json?: unknown };
}, onToken?: (t: string) => void): Promise<{ text: string; json?: any; timeInfo: TimeInfo }>
```
From `src/core/pipeline.ts`: `PipelineInput { intent?; data?; imageDataUrl?; templateId? }` ·
`TweakContext { templateId; params; metrics; depth?; changed? }`.

Agent function signatures (already defined in the stubs — keep them):
```ts
runOrchestrator(input: PipelineInput, onEvent: OnEvent): Promise<OrchestratorResult>
runModeler(input: PipelineInput, onEvent: OnEvent): Promise<ModelerResult>      // multimodal (image)
runVisualizer(modeler: ModelerResult, onEvent: OnEvent): Promise<VisualizerResult>
runSensitivity(ctx: TweakContext, onEvent: OnEvent): Promise<ProseResult>       // streamed
runRisk(ctx: TweakContext, onEvent: OnEvent): Promise<RiskResult>
runExplainer(ctx: TweakContext, onEvent: OnEvent): Promise<ProseResult>         // streamed, depth-aware
```

---

## Feature branches (priority order)

### 1. `feat/agents` — real prompts + strict-JSON schemas · COMPLEXITY: HIGH · ~4–5h
**Build:** Replace each stub's placeholder prompt with the real system prompt from BUILD_SPEC §7, and pass a
strict `responseFormat` JSON schema for the structured agents (orchestrator, modeler, visualizer, risk). Keep
`reasoning_effort:'low'`/`none` for speed. Sensitivity + Explainer stay streamed prose.
- **Files (yours):** `src/core/agents/{orchestrator,modeler,visualizer,sensitivity,risk,explainer}.ts`,
  `src/core/agents/shared.ts`; add `src/core/agents/schemas.ts` for the JSON schemas. Optionally tighten `cerebras.ts`.
- **Modeler is the hero call** — accept the uploaded image (`input.imageDataUrl` → `image_url` part) and infer
  `{templateId, params, sliders, mapping}` from a chart/triangle. Test against `src/mock/sample-image.png`.
- **Acceptance:** live run → upload `sample-image.png` → cascade fills with **real** Gemma output; `tsc --noEmit`
  clean; structured agents return schema-valid JSON (no `coerce()` fallback in normal runs); mock mode still works;
  real `time_info` shows in the HUD.
- **Depends on:** contract (frozen) + `chat()`. **Mock:** `src/mock/sample-image.png` + `sample-spec.json`.
- **Risks:** schema strictness vs Gemma compliance (small schemas, validate, keep `coerce()` fallback); rate
  limit (≤3 calls/tweak already enforced); image size (proxy caps body at 12 MB).

### 2. `feat/speed-harness` — real Cerebras-vs-baseline race · COMPLEXITY: MED · ~2–3h
**Build:** `SpeedHud`'s race fires the *same* prompt at Cerebras and a real GPU baseline (e.g. Gemini), overlays
both `time_info` + the cascade. Route `provider:'baseline'` through the proxy to the baseline endpoint.
- **Files (yours):** `src/app/SpeedHud.tsx`, `src/core/cerebras.ts` (provider routing), `server/proxy.ts`
  (add `/api/baseline` targeting the baseline provider + its key from env).
- **Acceptance:** "Run speed race" shows Cerebras finishing visibly first with live ms / tok-s for both; works on
  camera; within rate limits; mock race still works with no keys.
- **Depends on:** `feat/agents`. **Risks:** baseline key/quota — keep baseline OFF the critical path; hide keys when recording.

### 3. `feat/generative` — Gemma writes a NEW model live (the hero) · COMPLEXITY: HIGH · ~4–6h
**Build:** A `generate` mode where Modeler/Visualizer emit a brand-new `TemplateModule` **spec + a small JS
`run()` body** for a model not in the library, evaluated at runtime — with a **pre-tested fallback** so the live
demo can't faceplant. Keep it in your folders: register generated templates in an **A-owned runtime registry**
that `App` consults *before* `getTemplate()`, so you never edit `/src/templates`.
- **Files (yours):** `src/core/generated.ts` (runtime registry + safe `run()` evaluator + fallback),
  `src/core/agents/*` (generative prompt path), `src/app/App.tsx` (wire "generate" + consult the registry first).
- **Acceptance:** ask for a model not in the registry → Gemma returns a spec + `run()` → renders live in ~1s with
  a working slider; on failure the pre-tested fallback renders (never a blank screen). Line: *"Gemma wrote this
  entire interactive model in ~1 second."*
- **Depends on:** `feat/agents`. **Risks:** evaluating model-written JS — sandbox it (`new Function` over a pure
  numeric body, no DOM/network; validate against `SimResult`); always keep the fallback.

### 4. `feat/integration` — QA, reliability, then ship · COMPLEXITY: MED · ~4h + recording
**Build:** First end-to-end on Monte Carlo via real agents; curate demo inputs + deterministic fallbacks;
reliability pass; then **record the ≤60s video** (§16 beats) and post the **3 Discord submissions**
(`#g4hackathon-multiverse-agents`; `#g4hackathon-people-choice` + X post tagging @Cerebras @googlegemma;
`#g4hackathon-enterprise-impact`).
- **Files (yours):** `src/app/*`, integration glue in `src/core/*`. Merge B's template branches as they land.
- **Acceptance:** the §16 demo runs start-to-finish with no faceplant on a clean machine; keys/notifications hidden
  in the recording; 3 posts live before the **Mon 10:00 AM PDT** resubmit deadline.

## Rules
- Only edit `/src/core`, `/src/app`, `/server`. Import shared types from `contract.ts`; **never redefine** them.
- Don't refactor B's files. A contract change needs **B's agreement** (it is frozen).
- Mock-first: keep `VITE_USE_LIVE=false` working at every step. Commit small; conventional commits; PR to `main`.
- Skills: superpowers **brainstorming → writing-plans → TDD**; ECC **/plan**, **code-review**, **security-review**
  before each PR (you touch the proxy + key handling).

## Integration + merge checkpoints (BUILD_SPEC §14)
1. **Contract frozen** (done — `scaffold` tag).
2. **First end-to-end** on Monte Carlo via real agents (~T+6h) — your `feat/agents` landing.
3. **Feature freeze** (~T+18h) — stop new features, integrate B's templates, reliability pass.
4. **Record + submit** (T+18–24h). Resubmissions allowed until **Mon 10:00 AM PDT** — ship early, polish via resubmit.

## Your slice of the 24h timeline
- **0–1h:** confirm live run with the env-var key; contract frozen (done); skim B's Monte Carlo for the pattern.
- **1–6h:** `feat/agents` → first live end-to-end.
- **6–14h:** `feat/generative` + `feat/speed-harness` + render-on-resolve polish.
- **14–18h:** integrate B's templates; reliability pass; **feature freeze**.
- **18–24h:** record the 60s video; write the X post; post the 3 Discord submissions.