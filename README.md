# AugurForge

**Instant, interactive model sandbox for actuaries and quants.** Drop in a model,
dataset, or screenshot, and a Gemma-4-on-Cerebras agent swarm turns it into a
live, tweakable simulation with risk flags, timing telemetry, and a plain-English
explanation.

**Decision-support, not advice.**

## What Is Working Now

AugurForge currently ships three demo surfaces:

| Route | Surface | What to look at |
|---|---|---|
| `/` | Main modeling workbench | Uploads, generated models, Monte Carlo/GBM demo, 2D/3D views, Speed HUD, streaming agent panels |
| `/explainer.html` | Standalone Gemma thinking graph | Mock/live source switch, source receipt, entry/expert depth, stakeholder lenses, clickable transcript evidence, TTFT and tokens/s |
| `/warroom.html` | Situation-room swarm console | Agent inspector, canvas swarm view, live Q&A, provider race, and HTML report export |

The Monte Carlo hero and generated-model demos are implemented. Some secondary
templates remain intentionally stubbed so feature branches can fill them without
changing the shared contract.

## Quickstart

Mock mode needs no API key.

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:5173`
- `http://localhost:5173/explainer.html`
- `http://localhost:5173/warroom.html`

The main workbench and Explainer are credible offline demos: they use mock
agent streams, deterministic browser math, and representative Gemma timing. War
Room loads visually offline, while its default live cascade, Ask live swarm,
provider race, and report export are designed for live mode.

## Explainer Workbench

The standalone Explainer turns the live `AgentEvent` stream into a graph of how
the model was produced and interpreted. It is meant to make the data easier to
understand, not just prettier to watch.

- The graph groups input, agents, metrics, insights, caveats, and outputs by
  color.
- Clicking transcript sentences highlights the related graph evidence.
- Clicking graph groups opens the inspector for that slice of reasoning.
- Finance, Marketing, HR, Operations, Risk, and Executive lenses explain the
  same run from different stakeholder perspectives.
- Mock and Live source modes are visible in the UI, with a source receipt that
  explains whether the page is using the latest main-workbench session or the
  standalone mock cascade.
- TTFT and tokens/s are surfaced so the Cerebras speed story stays visible.

## Uploads

The composer accepts pasted screenshots plus PNG, JPEG, WebP, SVG, and PDF
files. Raster screenshots and diagrams are prepared as Gemma 4 vision inputs;
oversized images are compressed in-browser before the live proxy sees them. PDFs
and SVG diagrams are summarized into prompt text and metadata so the Modeler can
use embedded assumptions even in mock mode. Scanned or image-only PDFs should be
attached as page screenshots when visual reading is required.

## Live Mode

Live mode uses **`gemma-4-31b`** through Cerebras Inference using the
OpenAI-compatible chat-completions API.

```bash
cp .env.example .env
# fill CEREBRAS_API_KEY and set VITE_USE_LIVE=true
npm run dev:live
```

- The browser calls `/api/chat`; `server/proxy.ts` holds the key and forwards to
  Cerebras with SSE passthrough.
- The key never reaches the browser. `.env` is gitignored.
- `CEREBRAS_MODEL` defaults to `gemma-4-31b`.

## Environment

| Var | Where | Meaning |
|---|---|---|
| `VITE_USE_LIVE` | client | `true` routes through the live pipeline; anything else uses mock mode |
| `CEREBRAS_API_KEY` | proxy only | Cerebras key, never committed |
| `CEREBRAS_BASE_URL` | proxy only | Default `https://api.cerebras.ai/v1` |
| `CEREBRAS_MODEL` | proxy only | Default `gemma-4-31b` |
| `PROXY_PORT` | proxy only | Default `8787` |
| `BASELINE_API_KEY` | proxy only | Optional OpenRouter key for the speed race |
| `BASELINE_BASE_URL` | proxy only | Default `https://openrouter.ai/api/v1` |
| `BASELINE_MODEL` | proxy only | OpenRouter Gemma 4 slug for a fair race |
| `BASELINE_LABEL` | proxy only | Comparator label shown on the HUD |
| `OPENROUTER_REFERER` / `OPENROUTER_TITLE` | proxy only | Optional OpenRouter attribution headers |

With `BASELINE_API_KEY` set, the HUD races the same Gemma 4 prompt through
Cerebras and OpenRouter in parallel. Without it, the comparator uses
representative mock timing and is labeled as simulated.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server for the main app, including `/warroom.html` |
| `npm run dev:explainer` | Vite dev server pinned to `127.0.0.1:5174` for Explainer-only work |
| `npm run server` | Key proxy alone with `tsx watch` |
| `npm run dev:live` | Vite plus key proxy together |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite |
| `npm run build` | Typecheck plus production build |
| `npm run build:explainer` | Standalone Explainer production build |
| `npm run preview` | Preview the main Vite build |
| `npm run preview:explainer` | Preview the Explainer build |

## Project Structure

```text
src/core/        Frozen contract, Cerebras client, pipeline, session context, attachments, agents
src/app/         Main AugurForge workbench, renderer, Speed HUD, uploader
src/explainer/   Standalone thinking graph, inspector, transcript, source receipt, role analysis
src/warroom/     Situation-room canvas, agent dossiers, Q&A, report export
src/templates/   Monte Carlo implementation plus secondary template stubs
src/viz/         Plotly 2D and Three.js 3D render helpers
src/mock/        Offline sample spec and demo data
server/          Local key proxy for live Cerebras calls
public/warroom/  War Room visual assets
render-service/  Manim deep-path placeholder
```

## Verification

Run the main checks before publishing:

```bash
npm run typecheck
npm test
npm run build
npm run build:explainer
```

Manual smoke checklist:

- `/` loads the main workbench and renders the Monte Carlo hero.
- `/explainer.html` renders a nonblank graph, source receipt, inspector,
  stakeholder role panel, transcript, and timing status.
- `/warroom.html` renders the canvas situation room and inspector without
  crashing.
- Live mode routes through the proxy without code changes when
  `VITE_USE_LIVE=true` and a Cerebras key is present.

## Local Generated-Model Demo

Use the uploader's Generate mode or the Black-Scholes demo button, then build.
Gemma's live path emits a declarative model spec; mock mode uses the same
validated fallback. The browser compiles that spec into deterministic
Black-Scholes math, not arbitrary generated JavaScript.
