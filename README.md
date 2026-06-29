# AugurForge

**Instant, interactive model sandbox for actuaries & quants.** Drop in a model, dataset, or a
screenshot/sketch, and a Gemma-4-on-Cerebras agent swarm turns it into a live, tweakable
simulation — 2D + 3D, risk flags, and a streaming plain-English explanation.
**Decision-support, not advice.**

> This repo is the **`main` scaffold**. The hero (Monte Carlo / GBM) is fully implemented; agents
> and secondary templates are stubbed for feature branches. See `AugurForge_BUILD_SPEC.md`.

## Quickstart (mock mode — no API key)
```bash
npm install
npm run dev
# open http://localhost:5173
```
The whole experience runs offline on mock data: the streaming agent cascade, the Monte Carlo hero
in 2D + 3D, the sigma/mu/horizon sliders, the Animate toggle, the generated Black-Scholes sandbox,
and the Cerebras-vs-OpenRouter speed race.

## Uploads
The composer accepts pasted screenshots plus PNG, JPEG, WebP, SVG, and PDF files. Raster
screenshots/diagrams are prepared as Gemma 4 vision inputs; oversized images are compressed
in-browser before the live proxy sees them. PDFs and SVG diagrams are summarized into prompt
text/metadata so the Modeler can use embedded assumptions even in mock mode. Scanned/image-only PDFs
should be attached as page screenshots when visual reading is required.

## Live mode (Gemma-4-31b on Cerebras)
```bash
cp .env.example .env     # then fill in CEREBRAS_API_KEY
# set VITE_USE_LIVE=true in .env
npm run dev:live         # runs Vite + the key-proxy together
```
- The browser only ever calls `/api/chat`; the **key-proxy** (`server/proxy.ts`) holds the key and
  forwards to Cerebras with SSE passthrough. **The key never reaches the browser. `.env` is gitignored.**
- Model is pinned to **`gemma-4-31b`**.

## Environment
| Var | Where | Meaning |
|---|---|---|
| `VITE_USE_LIVE` | client | `true` = live pipeline; anything else = mock mode |
| `CEREBRAS_API_KEY` | proxy only | your key — never committed |
| `CEREBRAS_BASE_URL` | proxy only | default `https://api.cerebras.ai/v1` |
| `CEREBRAS_MODEL` | proxy only | `gemma-4-31b` |
| `PROXY_PORT` | proxy only | default `8787` |
| `BASELINE_API_KEY` | proxy only | OpenRouter key for the speed race; blank = simulated comparator |
| `BASELINE_BASE_URL` | proxy only | comparator base URL — default `https://openrouter.ai/api/v1` |
| `BASELINE_MODEL` | proxy only | OpenRouter Gemma 4 slug (run the **same** model for a fair race) |
| `BASELINE_LABEL` | proxy only | comparator name shown on the HUD — default `OpenRouter · Gemma 4` |
| `OPENROUTER_REFERER` / `OPENROUTER_TITLE` | proxy only | optional OpenRouter attribution headers |

> **Cerebras vs OpenRouter race.** The HUD races the same Gemma 4 prompt at Cerebras and at OpenRouter
> in parallel, reporting **TTFT · tokens/s · total** for both. With `BASELINE_API_KEY` set it's a real
> head-to-head; blank, the comparator runs on representative mock timing and is labeled `(sim)`.

## Scripts
| Script | Does |
|---|---|
| `npm run dev` | Vite dev server (mock mode) |
| `npm run server` | the key-proxy alone (`tsx watch`) |
| `npm run dev:live` | web + proxy together |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | typecheck + production build |

## Project structure
```
src/core/        contract.ts (frozen types) · cerebras.ts (client) · pipeline.ts · agents/*   [A]
src/app/         App · Renderer · SpeedHud · Uploader                                          [A]
src/templates/   monte-carlo.ts (full) · {mortality,aggregate-loss,var,compound-interest} stub [B]
src/viz/         plotly2d.ts · three3d.ts (shared render helpers)                         [A→B]
src/mock/        sample-spec.json · sample-image.png (offline demo data)
server/proxy.ts  key-proxy                                                                      [A]
render-service/  Manim deep-path (stub)                                                         [B]
```

## Branch workflow
- `main` always demos. Freeze `src/core/contract.ts` — change only by agreement.
- **A:** `feat/agents`, `feat/speed-harness`, `feat/integration`.
- **B:** `feat/template-var`, `feat/template-mortality`, `feat/template-aggloss`, `feat/template-compound`, `feat/manim`, `feat/polish`.
- One template per branch; small, mock-tested, PR to `main`. Folders are owned → merges stay clean.

## Acceptance criteria (scaffold)
- [x] `npm install && npm run dev` boots with no key and shows the app.
- [x] Monte Carlo renders in **2D**, switches to **3D**, **Animate** works; dragging σ updates the chart + P(ruin)/VaR live.
- [x] Panels appear via **render-on-resolve** from mock events; the explainer **streams**.
- [x] `tsc --noEmit` passes.
- [x] `VITE_USE_LIVE=true` + key routes through the proxy with no code changes.

## Local generated-model demo
Use the uploader's **Generate** mode or the **Black-Scholes demo** button, then build. Gemma's live
path emits a declarative model spec; mock mode uses the same validated fallback. The browser compiles
that spec into deterministic Black-Scholes math, not arbitrary generated JavaScript.
