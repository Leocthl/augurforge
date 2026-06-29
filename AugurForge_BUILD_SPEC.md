# AugurForge — Build Spec & Implementation Plan
**For:** Cerebras × Google DeepMind Gemma 4 — 24-Hour Hackathon
**How to use this file:** Paste this whole document into **Claude Code** at kickoff. Your (Claude Code's) job on this first run is to **produce the `main`-branch scaffold** defined in §11 — nothing more. Build exactly what's in *Scaffold Scope*, stub everything marked *stretch / feature branch*, verify the acceptance criteria in §12, then stop so the two devs can branch off.

> **Use your skills — proactively and autonomously.** We can't enumerate which Agent Skills are installed in your Claude Code, so **decide for yourself**: at every step, check your available skills and invoke any you judge useful for the task at hand (frontend / React / TypeScript, code review, testing, debugging, refactoring, design/UI, technical writing, git workflow, etc.). Default to *using* a relevant skill over doing it unaided. The user has flagged these as broadly useful — **use them when relevant, but do NOT limit yourself to them**:
> - **andrej-karpathy-skills** — https://github.com/multica-ai/andrej-karpathy-skills
> - **superpowers**
> - **ECC (Everything Claude Code)**
>
> Treat this as a standing directive for the whole build (scaffold *and* every feature branch), not just this run. If a clearly useful skill/plugin appears to be missing, mention it once so the user can install it, then proceed without it.

### Recommended kickoff sequence (for Claude Code)
1. **Set a goal + roadmap.** If you have a goal/roadmap skill (e.g. `/goal`), set the goal to *"scaffold AugurForge `main` per §11, then output a feature-split plan,"* and work through a roadmap of the §11 checklist, ticking off the §12 acceptance criteria as you go. Use whatever planning/roadmap skills you have.
2. **Set up Cerebras (see §17).** The user has the **Cerebras dashboard open in Chrome** — use the **Claude-in-Chrome** browser tools to read the API key + base URL and confirm the model, then write `.env`. **The model must be Gemma 4 (`gemma-4-31b`).** Never commit the key.
3. **Scaffold `main`** exactly per §11; verify §12.
4. **Generate `NEXT_WORKFLOW.md`** (see §14.5) — a runnable prompt the user pastes into Claude Code next to brainstorm the split and produce the two per-person plan docs. Stop after writing it.

> **About the code in this spec — it's a floor, not a ceiling.** The §5 contract and the §8 client are **sketches** — design them into precise, idiomatic code; only the **type names** (so both sessions import the same surface) and the §4 file structure are fixed. They exist only so the two independent sessions agree on one API, not to constrain your coding. **Everything else is intent:** write the best implementation you can with your own skills, libraries, and judgment; treat the prose, the Monte Carlo sketch, and any pseudo-code as *goals, not templates*. You are the implementer — design, iterate, and test in-repo, and improve freely beyond what's sketched here. Only the **contract** is fixed; the **implementation** is yours.

---

## 1. What AugurForge is (read first)

AugurForge is an **instant, interactive model sandbox for actuaries & quants.** A user drops in a model or dataset (or even a screenshot/sketch), and a **Gemma-4-on-Cerebras agent swarm** turns it into a **live, tweakable simulation** — rendered in the model's industry-standard form (2D or 3D), with risk flags and a plain-English explanation that **streams in instantly**. The showpiece: ask for a model that isn't in the library and **Gemma writes a brand-new one live, in ~1 second.**

It is framed as a **fast exploration & explanation sandbox** — not a production reserving engine. (This framing is deliberate; do not claim it replaces governed actuarial models.)

### The winning thesis — build toward these strengths
1. **Speed = instant generation.** The hero is Gemma writing a *whole model + viz + report in ~1s* where a GPU makes you wait ~15s. This is Cerebras's own code-gen story (Windsurf/Cognition). **Race this, not the slider.**
2. **Streaming cascade.** Never block on all agents. Render each panel the instant its call resolves, and stream tokens within each. On Cerebras the UI fills in a rapid cascade; on a GPU baseline it trickles — a visible, on-camera speed contrast that lives inside the rate limit.
3. **Un-fakeable Gemma moments.** Lead the demo with the two things a dropdown+chatbot cannot do: (a) read *messy/unseen* input (a chart in a PDF, a sketch, a legacy-system screenshot) and infer the model; (b) **generate a model that isn't in the library, live.**
4. **3D / physics wow + Animate.** Industry-standard look by default; 3D only where the field is genuinely 3D; an **Animate** toggle that brings motion (moving arrows, drawing paths, rotating surfaces).
5. **Multi-agent + multimodal** are real (6 agents; Gemma reads an image), satisfying Track 1 on the merits.

### Tracks targeted (one build → three submissions)
- **Track 1 — Multiverse Agents ($2K):** multi-agent + multimodal + speed.
- **Track 2 — People's Choice ($2K):** the demo video (3D money-shot + generate-live + cascade), posted to X tagging **@Cerebras** + **@googlegemma**.
- **Track 3 — Enterprise Impact ($1K):** the sandbox framing (exploration, governance flags, communication).

---

## 2. Hard constraints (these shape every implementation decision)
- **Model:** `gemma-4-31b` on **Cerebras Inference**, OpenAI-compatible **Chat Completions**. *(Confirm the exact model id, base URL, and limits from the Cerebras dashboard/docs at kickoff.)*
- **Modality:** text **+ image input**, **text-only output**. No audio in. No image generation.
- **Central component:** Gemma-on-Cerebras must do all the *intelligence* (model choice, vision, viz design, judgment, narration, generation). Only deterministic arithmetic (the Monte Carlo RNG) runs in plain JS.
- **Rate limit:** ~**100 RPM** on the hackathon tier (≈1.6 req/s). Debounce slider tweaks to **release**, cap to **≤3 calls** per interaction, run the numerical sim **client-side** (free).
- **Use `time_info`** from each response (TTFT, tokens/sec) on screen.
- **Policy:** no cybersecurity/offensive use, no medical diagnosis. Finance/actuarial **decision-support only — "not advice."**
- **Demo video ≤ 60 seconds.** Show Cerebras speed clearly (side-by-side recommended). Hide keys/notifications when recording.

---

## 3. Tech stack
- **Frontend:** Vite + **React** + **TypeScript**.
- **2D charts:** Plotly.js (`react-plotly.js` or direct).
- **3D:** **Three.js** (r128+), via a thin React wrapper.
- **Key proxy:** a tiny **Node/Express** (or Vite serverless function) server that holds `CEREBRAS_API_KEY` and forwards Chat Completions (so the key never ships to the browser). Supports streaming (SSE passthrough).
- **Manim deep-path (stretch):** a small **Python FastAPI** service (`/render-service`) running Manim + LaTeX + FFmpeg, called async. Off the critical path.
- **State:** React state/Zustand (keep it light).
- **Package manager:** npm.

---

## 4. Repository structure

```
augurforge/
  CLAUDE.md                 # context pack — every Claude session reads this first
  README.md                 # how to run, env, scripts
  .env.example              # CEREBRAS_API_KEY=, USE_LIVE=false
  package.json
  /server                   # key-proxy (Node/Express)   [OWNER: A]
    proxy.ts                # forwards /api/chat to Cerebras, streams SSE
  /src
    /core                   # the contract + clients      [OWNER: A]
      contract.ts           # ALL shared types (frozen — import, never redefine)
      cerebras.ts           # gemma-4-31b client (stream, image, structured, time_info)
      pipeline.ts           # agent loop, render-on-resolve emitter
      /agents               # one file per agent           [OWNER: A]
        orchestrator.ts  modeler.ts  visualizer.ts
        sensitivity.ts   risk.ts     explainer.ts
    /app                    # UI shell + renderer          [OWNER: A]
      App.tsx
      Renderer.tsx          # consumes DashboardSpec; 2D/3D + Animate toggles; streaming
      SpeedHud.tsx          # time_info HUD + Cerebras-vs-baseline race
      Uploader.tsx          # file/image drop -> Modeler
    /templates              # one file per model           [OWNER: B]
      monte-carlo.ts        # REFERENCE template (built in scaffold)
      mortality.ts  aggregate-loss.ts  var.ts  compound-interest.ts   # stubs
    /viz                    # shared render helpers
      plotly2d.ts           # 2D helpers (fan, histogram, curve, arrows)  [A scaffolds, B extends]
      three3d.ts            # 3D helpers (ribbon field, surface, particles) [A scaffolds, B extends]
    /mock
      sample-spec.json      # hardcoded DashboardSpec so app runs with no API key
      sample-image.png      # a curated input for the Modeler demo
  /render-service           # Manim deep-path (STRETCH)    [OWNER: B]
    main.py                 # FastAPI: POST /manim {script} -> mp4 url
    README.md
```

**Ownership rule:** A owns `/core`, `/app`, `/server`. B owns `/templates/*`, `/viz` extensions, `/render-service`. The two almost never touch the same file — merges stay trivial.

---

## 5. The contract — `/src/core/contract.ts` (sketch — you design the types, then freeze)

This is the single coordination point: **one file both sessions import, never redefine.** The block below is an **illustrative sketch of the shape** — you do **not** have to match the exact field types, comments, or layout. Design the precise, best-practice TypeScript yourself during scaffold; just **keep the type *names* stable** (`ViewKind`, `SliderDef`, `ParamSet`, `SimResult`, `DashboardSpec`, `TemplateModule`, `Renderer`, `RenderOpts`, `AgentId`, `AgentEvent`, `OnEvent`, `RiskFlag`) so the two independent sessions stay compatible, and improve the fields as you see fit. Then freeze it.

```ts
export type ViewKind = '2d' | '3d';

export interface SliderDef {
  id: string;            // 'sigma'
  label: string;         // 'Volatility (σ)'
  min: number; max: number; step: number; value: number;
  unit?: string;         // '%'
}
export type ParamSet = Record<string, number>;

// Deterministic numerical output — computed CLIENT-SIDE (no LLM)
export interface SimResult {
  paths?: number[][];                              // ensemble (Monte Carlo)
  series?: { name: string; x: number[]; y: number[] }[];
  metrics: { id: string; label: string; value: string }[];  // 'P(ruin)', '95% VaR'
  raw?: Record<string, unknown>;
}

// Drives the UI. Produced by the Visualizer agent, or a template's default.
export interface DashboardSpec {
  templateId: string;          // 'monte-carlo'
  title: string;
  sliders: SliderDef[];
  views: ViewKind[];           // ['2d','3d'] | ['3d'] | ['2d']
  defaultView: ViewKind;
  explainer?: { entry: string; expert: string };
}

export interface RenderOpts { animate: boolean; theme: 'light' | 'dark'; }
export interface Renderer { update(sim: SimResult, animate: boolean): void; destroy(): void; }

// A model. One per file in /templates. Pure + client-side except the spec.
export interface TemplateModule {
  id: string;
  spec: DashboardSpec;
  run(params: ParamSet): SimResult;
  render2D?(el: HTMLElement, sim: SimResult, opts: RenderOpts): Renderer;
  render3D?(el: HTMLElement, sim: SimResult, opts: RenderOpts): Renderer;
}

// Streaming — agents emit as they resolve (render-on-resolve)
export type AgentId =
  | 'orchestrator' | 'modeler' | 'visualizer'
  | 'sensitivity' | 'risk' | 'explainer';

export interface TimeInfo { ttftMs?: number; tokensPerSec?: number; totalTokens?: number; }

export interface AgentEvent {
  agent: AgentId;
  status: 'start' | 'token' | 'done' | 'error';
  delta?: string;        // streamed token text
  result?: unknown;      // final structured result (typed per agent)
  timeInfo?: TimeInfo;
}
export type OnEvent = (e: AgentEvent) => void;

export interface RiskFlag { level: 'ok' | 'warning' | 'danger'; text: string; ref?: string; }
```

---

## 6. Architecture & data flow

```
Upload (data + optional image)
   │
   ▼
Orchestrator ──► Modeler(vision) ──► Visualizer ──► DashboardSpec ──► Renderer (2D/3D + Animate)
   │                                                                      ▲
   └──────────── on each slider release (debounced, ≤3 calls) ───────────┘
                 Sensitivity · Risk · Explainer  (fire in parallel, STREAM in)
```

- **Render-on-resolve:** `pipeline.ts` exposes `runPipeline(input, onEvent)`. It does **not** `await Promise.all`. As each agent resolves it calls `onEvent({agent, status:'done', result})`; the UI paints that panel immediately. Token deltas stream via `status:'token'`.
- **Numerical truth is client-side:** templates' `run(params)` does the math (e.g., GBM RNG). Gemma never fabricates numbers; it interprets them.
- **Fast path / deep path:** fast path = streaming panels + instant browser animation (the live demo). Deep path = Manim render, async, swaps in when ready (stretch).
- **Speed harness:** `SpeedHud` fires the same prompt at Cerebras and at a baseline provider, shows both `time_info` and a cascade race. (Baseline is for comparison only; Gemma-on-Cerebras stays primary.)

---

## 7. The agents (`/src/core/agents/*`)

All return **strict JSON** (use `response_format` json schema where supported) except Explainer (streamed prose). Keep `reasoning_effort` = `none`/`low` for speed; bump only if needed.

| Agent | Multimodal | Input | Output (typed) | Prompt intent |
|---|---|---|---|---|
| **orchestrator** | no | user intent + raw data summary | `{ templateId, intent, notes }` | Decide which model fits; route. |
| **modeler** | **yes (image)** | data + **chart/sketch image** | `{ templateId, params: ParamSet, sliders: SliderDef[], mapping }` | *See* the input, infer model + parameters + ranges. **This is a hero call.** |
| **visualizer** | no | model spec | `DashboardSpec` | Choose views (2d/3d), sliders, labels, title. |
| **sensitivity** | no | params + `SimResult.metrics` + delta | streamed prose | Why the outcome moved; which driver dominates. |
| **risk** | no | current scenario + supplied thresholds / assumptions | `RiskFlag` | Tail risks, model assumptions, and governance review points. |
| **explainer** | no | scenario + depth ('entry'\|'expert') | streamed prose | The adjustable-depth narrative. |

**Generative path (hero, stretch-but-prioritised):** a `generate` mode where the Modeler/Visualizer emit a **brand-new `TemplateModule` spec + a small JS `run()` body** for a model not in the library. Keep a **pre-tested fallback** so the live demo can't faceplant. Frame the demo line: *"Gemma wrote this entire interactive model in ~1 second."*

> For the scaffold, agents may return **mock results** when `USE_LIVE=false`. Real prompts are implemented on feature branches.

---

## 8. The Cerebras client (`/src/core/cerebras.ts`)

Design one shared `chat()` function the agents call — the block below is an illustrative shape, not a fixed signature:

```ts
chat(opts: {
  messages: ChatMessage[];          // OpenAI format; supports image_url parts
  model?: string;                   // default 'gemma-4-31b'
  stream?: boolean;                 // true for streamed prose
  responseFormat?: object;          // JSON schema (strict) for structured agents
  reasoningEffort?: 'none'|'low'|'medium'|'high';
}, onToken?: (t: string) => void): Promise<{ text: string; json?: any; timeInfo: TimeInfo }>
```

- Calls the **key-proxy** at `/api/chat` (never the Cerebras endpoint directly from the browser).
- Parse streamed SSE; surface `time_info` (TTFT, tokens/sec) into `TimeInfo`.
- Images: OpenAI multimodal format (`{type:'image_url', image_url:{url}}`), base64 data URI or hosted URL.
- A small client-side **rate guard**: debounce tweak calls to slider-release; queue so we never exceed ~1.6 req/s.

---

## 9. Reference template — Monte Carlo (`/src/templates/monte-carlo.ts`)

Build this **fully** in the scaffold; it is the pattern every other template copies.

- **`run(params)`** — monthly-stepped GBM ensemble: `S_{t+1} = S_t · exp((μ − ½σ²)dt + σ√dt · Z)`. Params: `sigma` (slider 5–40%), `drift`, `horizon`. Compute `paths`, terminal distribution, and `metrics`: **P(ruin)** = fraction whose grid-monitored min < barrier; **95% VaR** = terminal 5th-percentile loss.
- **`spec`** — `views: ['2d','3d']`, `defaultView:'2d'`, slider `sigma`, explainer entry/expert text.
- **`render2D`** (Plotly) — **fan / percentile cone** + terminal **histogram**; Animate = paths draw left→right, a "today" line sweeps, histogram builds from samples.
- **`render3D`** (Three.js) — **ribbon field** (instanced lines you can orbit) and/or **probability mountain** (distribution as a surface); Animate = paths stream in, surface morphs with σ, gentle auto-rotate.
- Both views read the **same `SimResult`** — switching view never re-runs the math.

This single template demonstrates: 2D-standard + 3D-hero + Animate + the slider loop + streaming explainer. Everything else is a variation.

---

## 10. Streaming, speed harness & Animate

- **Render-on-resolve:** `Renderer.tsx` subscribes to `OnEvent`; each agent's panel (chart, risk flag, explainer) appears the moment its event lands. Explainer text streams token-by-token.
- **Speed race (`SpeedHud.tsx`):** same prompt → Cerebras vs a baseline; show both `TimeInfo` and the cascade. This is the recommended side-by-side.
- **Animate toggle:** a per-template flag passed via `RenderOpts.animate`. 2D = drawing/sweeping/flowing arrows; 3D = morph/rotate. Static is the default (reliable); Animate is the flourish for the video.
- **Control strip per chart:** `sliders · [2D | 3D] · [Animate]` (2D/3D switch shown only when `spec.views.length > 1`).

---

## 11. ⭐ SCAFFOLD SCOPE — build exactly this on `main`, then stop

When Claude Code finishes this run, `main` must contain a **running app** with:

1. Repo initialised (Vite + React + TS), `npm install` clean, `npm run dev` works.
2. `CLAUDE.md` written (see §13), `README.md`, `.env.example`.
3. `/src/core/contract.ts` — the types you designed from the §5 sketch (names stable), compiling.
4. `/src/core/cerebras.ts` — the client from §8, with a **mock mode** (`USE_LIVE=false` returns canned results so the app runs with no API key).
5. `/server/proxy.ts` — the key-proxy (works when a key is provided; ignored in mock mode).
6. `/src/core/pipeline.ts` — `runPipeline` with the **render-on-resolve emitter**, driving panels from either live agents or mock events.
7. `/src/core/agents/*` — all six agent files **stubbed** (correct signatures, return mock structured results; TODO comments pointing to §7 for real prompts).
8. `/src/app/*` — `App`, `Renderer` (2D/3D + Animate toggles + streaming subscription), `SpeedHud` (HUD + race **stub**), `Uploader`.
9. `/src/templates/monte-carlo.ts` — **fully implemented** per §9 (2D + 3D + Animate, real math).
10. `/src/templates/{mortality,aggregate-loss,var,compound-interest}.ts` — **stubs** implementing `TemplateModule` with a trivial `run` + a "coming soon" render, so they're ready for B to fill.
11. `/src/viz/{plotly2d,three3d}.ts` — shared helpers with the Monte Carlo pieces implemented; clear extension points.
12. `/src/mock/{sample-spec.json, sample-image.png}` so the app demos end-to-end offline.
13. `/render-service/` — a **stub** FastAPI app + README (no real Manim yet).

**Do NOT in this run:** write real agent prompts, build the other four templates, implement Manim rendering, or build the generative path. Those are feature branches (§14). Leave clear `// TODO(branch: ...)` markers.

**Final step of this run — generate `NEXT_WORKFLOW.md`.** Once §12 passes, write **one** committed file at the repo root: **`NEXT_WORKFLOW.md`** (full content in §14.5). It is a *runnable prompt* — when the user pastes it into Claude Code next, it brainstorms the work split and writes the two per-person plan docs. **Do NOT write the person docs in this run** — only `NEXT_WORKFLOW.md`. Then stop.

---

## 12. Acceptance criteria (how you know the scaffold is done)
- `npm install && npm run dev` boots with **no API key** and shows the app.
- The **Monte Carlo** template renders in **2D**, switches to **3D**, and the **Animate** toggle works; dragging **σ** updates the chart and the P(ruin)/VaR metrics live.
- Panels appear via **render-on-resolve** from mock events (visible cascade), and the explainer text **streams**.
- `tsc --noEmit` passes (contract + all stubs typecheck).
- Setting `USE_LIVE=true` + a key routes calls through the proxy without code changes (even if agents are still stubbed).
- `README.md` explains run, env, scripts, and the branch workflow.

---

## 13. `CLAUDE.md` (Claude Code must generate this for the repo)

Contents:
- One-paragraph product summary + the winning thesis (§1).
- The hard constraints (§2).
- **Folder ownership** (A vs B) and the rule: *only edit your folders; import shared types from `/core/contract.ts`; never redefine contract types; don't refactor the other person's files.*
- **Mock-first rule:** build and test against `/mock` and `USE_LIVE=false`; never block on the live pipeline.
- **Skills directive:** *proactively use any installed Agent Skills you find useful at each step — frontend, code-review, testing, debug, design, docs, refactoring (e.g. andrej-karpathy-skills, superpowers, ECC, and whatever else is installed). Not limited to a fixed list; decide per task.*
- A pointer: *"Full spec in `AugurForge_BUILD_SPEC.md`."*

---

## 14. Git & collaboration workflow (after scaffold)

1. Push the scaffold to **`main`**. Tag it `scaffold`.
2. **Freeze the contract** (`/core/contract.ts`) — changes only by agreement.
3. Branch per workstream:
   - **A:** `feat/agents` (real prompts + generative path), `feat/speed-harness`, `feat/integration`, then owns the **video + submissions**.
   - **B:** `feat/template-var`, `feat/template-mortality`, `feat/template-aggloss`, `feat/manim` (deep-path), `feat/polish`. One template per branch — small, independent, mock-tested, pushed when done.
4. **PR → `main`** as each piece lands; because folders are owned, merges are clean. Rebase small and often.
5. **Checkpoints:** contract frozen (T+1h) → first end-to-end on Monte Carlo via real agents (T+6h) → **feature freeze** (~T+18h) → integrate + QA + record → submit. Resubmissions allowed until **Mon 10:00 AM PDT** — ship early, polish via resubmit.
6. B works in bursts (around other commitments); each branch is self-contained, so unfinished ones simply don't merge — `main` always demos.

---

## 14.5 The `NEXT_WORKFLOW.md` hand-off (Claude Code writes this at the end of the scaffold run)

**Do NOT write the per-person plan docs during the scaffold run.** Instead write **one** file at the repo root — **`NEXT_WORKFLOW.md`** — which is itself a *runnable prompt*. The user pastes it into a fresh Claude Code session next; it brainstorms the split and writes the two per-person plan docs **autonomously** (no back-and-forth). Write `NEXT_WORKFLOW.md` with this content (adapt specifics to what you actually scaffolded):

````markdown
# AugurForge — Next Workflow (design the work split)
Run this in Claude Code, inside the AugurForge repo, after the scaffold is on `main` and green.

**Task:** Using your brainstorming/planning skill (e.g. `superpowers` brainstorming, or a `brainstorm` skill), **autonomously** design how the two developers split the remaining work, then **write two committed, self-contained plan docs:** `/plans/PERSON_A_PLAN.md` and `/plans/PERSON_B_PLAN.md`. No back-and-forth — read, decide, write both files, commit, and print a one-paragraph summary of the split.

**Method:**
1. Read `CLAUDE.md`, `/src/core/contract.ts`, and `AugurForge_BUILD_SPEC.md` (esp. §6–§16); skim the folders to see what exists vs. what's stubbed (`// TODO(branch: ...)`).
2. Brainstorm the remaining features; group them into two non-overlapping lanes whose seam is `contract.ts` + folder ownership, so the two devs never edit the same files.
3. Write both docs (structure below).

**Each `PERSON_*_PLAN.md` must be a standalone kickoff a fresh Claude Code session can run with no other context, containing:**
- **Who you are + your goal** (the features you own); start by reading `CLAUDE.md` + `contract.ts`; drive the session with `/goal` + `superpowers` + any useful skills.
- **Your feature branches, in priority order** — for each: branch name (`feat/...`), what to build, files you own, acceptance criteria, dependencies, and the mock to test against.
- **The `contract.ts` slice you depend on** (copy the relevant type signatures).
- **Rules:** only edit your folders; import shared types, never redefine; mock-first; commit small; PR to `main`.
- **Integration + merge checkpoints:** contract frozen → first end-to-end → feature freeze → record/submit.
- **Your slice of the 24h timeline.**

**Default owner split (adjust to what's actually stubbed):**
- **A — core / integration / finish:** real agents + prompts, the Cerebras streaming client, the tweak loop, the speed-race harness, the generative path, integration + QA, the 60-second video + the 3 Discord submissions.
- **B — breadth / polish (works in bursts):** the secondary templates (`var`, `mortality`, `aggregate-loss`, `compound-interest`) in 2D + 3D + Animate, the depth toggle, the Manim deep-path (stretch), visual polish/theme, and bundling the public demo data.
````

## 15. Build order (24h)
- **0–1h (both):** run this scaffold on `main`, set keys, freeze the contract.
- **1–6h:** A → real agents + Cerebras streaming; B → `var` + one more template. First live end-to-end on Monte Carlo.
- **6–14h:** A → generative path + speed harness + render-on-resolve polish; B → remaining templates + Animate variants + (stretch) Manim.
- **14–18h:** integrate, reliability pass (curate demo inputs + deterministic fallbacks), **feature freeze**.
- **18–24h:** A records the 60s video + writes the X post + posts the **3 Discord submissions**; B polishes + pre-renders one Manim clip as a video asset.

---

## 16. Demo (60s) & submission
- **0–3s hook:** *"Watch Gemma build a working actuarial model — math, 3D, and a board report — in one second."* Generate-live moment.
- **3–18s:** the cascade — panels stream in; flip 2D→3D; the ribbon field fills with 5,000 paths.
- **18–40s:** drag σ → P(ruin) + VaR + risk flag + explainer update live; hit **Animate**.
- **40–55s:** the **speed race** (Cerebras vs GPU baseline) with `time_info` on screen.
- **55–60s:** quotable stat + *"@Cerebras × @googlegemma."*
- **Submit:** post to `#g4hackathon-multiverse-agents` (Track 1), `#g4hackathon-people-choice` + X post tagging @Cerebras @googlegemma (Track 2), `#g4hackathon-enterprise-impact` (Track 3), each with a track-tailored description.

---

## 17. Kickoff setup & demo data

**Cerebras — do this first.** The user has the **Cerebras dashboard open in Chrome.** Use the **Claude-in-Chrome browser tools** to read the **API key** and **base URL**, and confirm the available models. Then:
- Write `.env` from `.env.example`: `CEREBRAS_API_KEY=…`, `CEREBRAS_BASE_URL=…`, `USE_LIVE=true`.
- **Set the model to `gemma-4-31b` (Gemma 4) — this is required; do not use any other model.**
- Point `/server/proxy.ts` at the base URL.
- **Never commit the key** — `.env` is gitignored; only the proxy reads it. (If the browser tools aren't available, ask the user to paste the key + base URL.)
- The **elevated rate tier is already active** (capacity form filed) — design for ~100 RPM.

**Demo data — use public datasets** (no proprietary numbers needed; the friend has none). The Monte Carlo sim generates its own paths — real data is for *credibility*: seed defaults from real figures, and use one real artifact as the vision input. Pull from:
- **Asset returns / volatility (GBM hero):** S&P 500 / any index via **FRED** (fred.stlouisfed.org) or **Yahoo Finance** — estimate real drift & σ for the slider defaults.
- **Mortality / survival:** US **SSA** period life table (ssa.gov/oact) or the **Human Mortality Database** (mortality.org).
- **Loss-development triangle (reserving + the vision demo):** the **CAS** loss-reserving database (casact.org) or the **`CASdatasets`** R package (Danish fire, French motor, Schedule P triangles).
- **Yield curve:** US Treasury daily par yields (home.treasury.gov) or FRED (`DGS1`…`DGS30`).
- **Volatility index:** **VIX** via FRED.

Bundle a small curated slice into `/src/mock/` — e.g., a **real loss-triangle image** as `sample-image.png` for the Modeler vision demo, and real σ for the GBM defaults. Keep it lightweight and record provenance in a `DATA_SOURCES.md`.

---

## 18. Appendix — model library (beyond v1)
v1 anchors (build): **compound interest · GBM/Monte Carlo (hero) · mortality/survival · aggregate loss · VaR/ES.**
Library / generative-path reach: Black–Scholes + Greeks, volatility surface (3D), Vasicek/CIR rates, efficient frontier, GARCH, Chain-Ladder/Mack reserving, copulas, Solvency II SCR, IFRS-17 cash flows, Markov multi-state.

*Engine is model-agnostic: adding a model = adding a `TemplateModule` file (or generating one). v1 ships ~5; the generative path claims the rest.*
