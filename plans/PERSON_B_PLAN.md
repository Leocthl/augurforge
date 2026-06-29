# AugurForge — Leo Spec · Gemma-Powered Manim Deep-Path Explainer + Future Features

> **For Leo (Person B).** Standalone kickoff: read this, then `CLAUDE.md`, `src/core/contract.ts`, and
> `plans/PERSON_A_PLAN.md` (for the shared seam Andreas exposes). Drive with `/goal` + **superpowers**
> (writing-plans → TDD) + **ECC**. Mock-first; conventional commits; small PRs to `main`.

**Goal:** Build the *deep explanatory* layer — a **Gemma-4-authored, Manim-rendered** explainer video of the
current model scenario — plus future knowledge features (RAG / graph). Consume Andreas's standardized output;
**never block the live demo** (deep path is async, off the critical path).

**Architecture:** A Python **FastAPI** service (`/render-service`) receives an `ExplainPayload` (the scenario:
`SimResult` shapes + metrics + agent narrative) and renders a **narrated Manim animation → mp4**, with a
**pre-tested fallback clip** so the demo can't faceplant. **Gemma 4 writes the scene plan / voiceover** (the
"Gemma explains it" moment). Deterministic per-shape Manim scenes are the reliable base; Gemma-authored scenes are a sandboxed stretch.

**Tech stack:** Python, FastAPI, **Manim** + LaTeX + FFmpeg, `gemma-4-31b` (via the existing key-proxy or direct, key from an **env var** — never a file, this machine's AV quarantines key-bearing files). Future: a small local vector store.

---

## Ownership (keep merges trivial)
- **You (Leo) own:** `/render-service` (the Manim deep-path) and any new service dir you add (e.g. `/knowledge-service` for RAG).
- **You must NOT edit:** `/src/core`, `/src/app`, `/src/viz`, `/server` (Andreas / Person A). You **consume** his output; the app-side "show the video / call the service" wiring is **his** `/src/app` task — you hand him a stable endpoint contract.
- **Both:** import shared types from `src/core/contract.ts`; **never redefine** them.

## The seam you CONSUME (agree + freeze with Andreas first; copied from his spec)
```ts
// A model's run() emits these standard shapes in SimResult.raw.shapes — your Manim renders each kind.
type VizShape =
  | { kind: 'fan';          x: number[]; bands: { lower: number[]; upper: number[] }[]; median?: number[] }
  | { kind: 'distribution'; values: number[]; markers?: { label: string; value: number }[] }
  | { kind: 'curve';        series: { name: string; x: number[]; y: number[] }[] }
  | { kind: 'surface';      x: number[]; y: number[]; z: number[][] };

// What your service receives for the current scenario:
interface ExplainPayload {
  templateId: string;
  title: string;
  params: Record<string, number>;
  sim: { metrics: { id: string; label: string; value: string }[]; raw?: { shapes?: VizShape[] } };
  narrative: { sensitivity?: string; explainer?: { entry: string; expert: string }; risk?: { level: string; text: string; ref?: string }[] };
}
```
**Develop against a fixture, not Andreas's live app** — `feat/explain-endpoint` below creates `render-service/sample_payload.json` so you build fully offline. Mock-first.

---

## Feature branches (priority order)

### 1. `feat/manim-foundation` — FastAPI + deterministic per-shape Manim scenes · HIGH · ~4h
Flesh out `render-service/`: a real `POST /explain` that accepts an `ExplainPayload` and renders a narrated mp4 from
`sim.raw.shapes`, plus a **pre-tested fallback clip** returned whenever Manim/LaTeX fails. One Manim `Scene` per `VizShape.kind`.
- **Files:** `render-service/main.py` (FastAPI: `POST /explain` → `{ url, status, usedFallback }`, `GET /health`),
  `render-service/scenes/{fan,distribution,curve,surface}.py` (a `Scene` per shape), `render-service/assets/fallback.mp4`,
  `render-service/requirements.txt` (add `manim`), `render-service/README.md`.
- **Acceptance:** `uvicorn main:app` up; `POST /explain` with `sample_payload.json` renders an mp4 of the fan + distribution with the metrics as captions; if Manim throws, the endpoint returns the fallback clip with `usedFallback:true` (never a 500 that blanks the demo).
- **Deps:** Manim + LaTeX + FFmpeg installed on the host. **Risk:** Manim render time — keep clips short (~6–10s), render at low quality for the demo, cache by payload hash.

### 2. `feat/manim-gemma` — Gemma 4 writes the explanation · HIGH · ~3h
Before rendering, call `gemma-4-31b` with the `ExplainPayload.narrative` + metrics to produce a tight, **board-ready voiceover /
caption script + scene beats** (decision-support, "not advice"). Drive the Manim captions/sequence from Gemma's output. This is the
"Gemma writes the explainer" moment. (Stretch: let Gemma emit an actual Manim snippet, executed **sandboxed**, with the deterministic scene as fallback.)
- **Files:** `render-service/gemma.py` (Cerebras call, key from env), `render-service/script_builder.py`, wire into `main.py`.
- **Acceptance:** the rendered video's narration is Gemma-authored and matches the scenario; on any Gemma/parse failure it falls back to deterministic captions; surfaces `time_info` so the speed story holds.
- **Risk:** never run un-sandboxed LLM Python; always keep the deterministic scene as fallback.

### 3. `feat/explain-endpoint` — the contract + fixture for Andreas · MED · ~1h (do early!)
Pin the `POST /explain` request/response contract and ship `render-service/sample_payload.json` (a realistic Monte Carlo scenario
with `raw.shapes` = a `fan` + a `distribution`). This unblocks both you (offline dev) and Andreas (app wiring).
- **Files:** `render-service/sample_payload.json`, `render-service/API.md`.
- **Acceptance:** the fixture validates against `ExplainPayload`; Andreas can `POST` it and get an mp4 URL back; documented in `API.md`.

### 4. `feat/rag-grounding` — future / stretch (your call, keep it instant) · MED · time-permitting
A **lightweight, pre-indexed** retrieval (local — no heavy infra, no live-crawl) over real actuarial standards (Solvency II,
IFRS-17) so the risk/explainer cites real sources → an **Enterprise-Impact** differentiator. Or an Obsidian-style knowledge-graph
view of model/risk relationships. Keep retrieval **instant** so it never undercuts the Cerebras speed story.
- **Files:** new `/knowledge-service/*` (don't touch Andreas's folders); the app surfaces results via his `/src/app` (coordinate).
- **Acceptance (if pursued):** a risk flag shows a real cited source, retrieved with no perceptible delay; clearly framed as decision-support, not advice.
- **Note:** explicitly optional — rank it below a polished Manim clip. Add whatever future feature you dream up here, scoped the same way (own folder, consumes the seam, never blocks the demo).

## Rules · checkpoints · timeline
- Only edit `/render-service` (and new service dirs you own). Don't touch `/src/core`, `/src/app`, `/src/viz`, `/server`.
- The deep path is **always async + off the critical path**, with a pre-tested fallback. The fast-path demo must never wait on Manim.
- Key from env var only (`$env:CEREBRAS_API_KEY`), never written to a file.
- **Checkpoints:** freeze the `VizShape` + `ExplainPayload` seam with Andreas *first* → `feat/explain-endpoint` (so both sides can build) → first rendered clip → **feature freeze** (~T+18h) → hand Andreas a pre-rendered clip for the 60s video.
- **Order:** seam → `feat/explain-endpoint` → `feat/manim-foundation` → `feat/manim-gemma` → (stretch) `feat/rag-grounding`.
- **Your headline deliverable:** one polished, Gemma-narrated Manim clip that Andreas drops into the People's-Choice video.