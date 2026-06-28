# AugurForge — Next Workflow (design the work split)

Run this in Claude Code, inside the AugurForge repo, after the scaffold is on `main` and green
(`npm run dev` works, `npm run typecheck` passes, the Monte Carlo hero renders in 2D + 3D).

**Task:** Using your brainstorming/planning skill (e.g. `superpowers` brainstorming, or a
`brainstorm` skill), **autonomously** design how the two developers split the remaining work, then
**write two committed, self-contained plan docs:** `/plans/PERSON_A_PLAN.md` and
`/plans/PERSON_B_PLAN.md`. No back-and-forth — read, decide, write both files, commit, and print a
one-paragraph summary of the split.

## Method
1. Read `CLAUDE.md`, `src/core/contract.ts`, and `AugurForge_BUILD_SPEC.md` (esp. §6–§16); skim the
   folders to see what exists vs. what is stubbed (search for `TODO(branch:`).
2. Brainstorm the remaining features; group them into two non-overlapping lanes whose seam is
   `contract.ts` + folder ownership, so the two devs never edit the same files.
3. Write both docs (structure below), commit, summarize.

## Each `PERSON_*_PLAN.md` must be a standalone kickoff a fresh Claude Code session can run with no other context, containing:
- **Who you are + your goal** (the features you own); start by reading `CLAUDE.md` + `contract.ts`;
  drive the session with `/goal` + `superpowers` + any useful skills.
- **Your feature branches, in priority order** — for each: branch name (`feat/...`), what to build,
  files you own, acceptance criteria, dependencies, and the mock to test against.
- **The `contract.ts` slice you depend on** (copy the relevant type signatures).
- **Rules:** only edit your folders; import shared types, never redefine; mock-first; commit small; PR to `main`.
- **Integration + merge checkpoints:** contract frozen → first end-to-end → feature freeze → record/submit.
- **Your slice of the 24h timeline.**

## Default owner split (adjust to what is actually stubbed)
- **A — core / integration / finish:** real agents + §7 prompts + strict-JSON schemas, the live
  Cerebras streaming path (already wired — exercise it against the real tier), the tweak loop, the
  speed-race harness (real baseline provider), the **generative path** (Gemma writes a new
  `TemplateModule` live, with a pre-tested fallback), integration + QA, the 60-second video + the 3
  Discord submissions.
- **B — breadth / polish (works in bursts):** the secondary templates
  (`var`, `mortality`, `aggregate-loss`, `compound-interest`) in 2D + 3D + Animate following the
  Monte Carlo pattern, the depth toggle polish, the Manim deep-path (stretch), visual polish/theme,
  and bundling the public demo data (real loss-triangle image + real σ from FRED).

---

## Current scaffold state (so you can skip a blind re-scan)
**Frozen contract** — `src/core/contract.ts` exports (names stable; import, never redefine):
`ViewKind, Theme, SliderDef, ParamSet, Metric, Series, SimResult, Explainer, DashboardSpec,
RenderOpts, Renderer, RenderFn, TemplateModule, AgentId, AgentStatus, TimeInfo, AgentEvent, OnEvent,
RiskFlag, OrchestratorResult, ModelerResult, VisualizerResult, RiskResult, ProseResult, AgentResultMap`.
Pipeline types live in `src/core/pipeline.ts`: `PipelineInput, TweakContext, PipelineResult`.

**Built (do not rebuild):**
- `src/templates/monte-carlo.ts` — full GBM `run()` (seeded, deterministic), `render2D` (Plotly fan +
  aligned terminal histogram + ruin barrier + L→R reveal), `render3D` (Three.js probability-density
  mountain + ribbon trajectories + barrier + rise/auto-rotate). The pattern every template copies.
- `src/viz/plotly2d.ts`, `src/viz/three3d.ts` — shared, reusable render helpers with clear extension points.
- `src/core/cerebras.ts` — `chat()` with full mock mode (realistic per-provider cadence) + live SSE +
  rate guard. `src/core/pipeline.ts` — `runPipeline` (build cascade) + `runTweak` (≤3 parallel streaming).
- `src/app/*` — App (state + render-on-resolve), Renderer, SpeedHud (HUD + working mock race), Uploader.
- `server/proxy.ts` — key-proxy (SSE passthrough). `VITE_USE_LIVE=true` + a key in `.env` routes live, no code changes.
- `src/mock/` — `sample-spec.json`, synthetic `sample-image.png` (loss triangle for the vision demo).

**Stubbed (your work):**
- `src/core/agents/*` — all 6 call `chat()` (so live mode hits the proxy) but return mock structured
  results; real §7 prompts/schemas are `TODO(branch: feat/agents)`.
- `src/templates/{mortality,aggregate-loss,var,compound-interest}.ts` — trivial `run()` + "coming soon" render.
- `render-service/` — FastAPI stub; Manim is `TODO(branch: feat/manim)`.
- Generative path: not started (A — hero, keep a pre-tested fallback).

**Mock-first:** everything runs offline with `VITE_USE_LIVE=false`. Don''t block on the live pipeline.