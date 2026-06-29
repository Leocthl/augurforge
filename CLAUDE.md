# CLAUDE.md — AugurForge

> **Every Claude session reads this first.** Full spec: `AugurForge_BUILD_SPEC.md`.
> Product/design context: `PRODUCT.md` and `DESIGN.md`.

## What this is
AugurForge is an **instant, interactive model sandbox for actuaries & quants.** Drop in a model,
dataset, or even a screenshot/sketch, and a **Gemma-4-on-Cerebras agent swarm** turns it into a
**live, tweakable simulation** — rendered in industry-standard form (2D or 3D), with risk flags and
a plain-English explanation that **streams in instantly**. Framed as a fast *exploration &
explanation* sandbox — **decision-support, not advice**; not a governed reserving engine.

### Winning thesis (build toward these)
1. **Speed = instant generation.** Gemma writes a whole model + viz + report in ~1s where a GPU waits ~15s.
2. **Streaming cascade.** Never block on all agents — render each panel the instant its call resolves.
3. **Un-fakeable Gemma moments.** (a) read messy/unseen input (a chart image, a sketch); (b) generate a model not in the library, live.
4. **3D / physics wow + Animate.** Industry-standard look; 3D only where the field is genuinely 3D.
5. **Multi-agent + multimodal are real** (6 agents; Gemma reads an image).

## Hard constraints
- **Model:** `gemma-4-31b` on **Cerebras Inference** (OpenAI-compatible Chat Completions). Do **not** use another model.
- **Modality:** text **+ image input**, **text-only output**. No audio, no image generation.
- **Central component:** Gemma does all the *intelligence*. Only deterministic arithmetic (the Monte Carlo RNG) runs in plain JS.
- **Rate limit:** ~100 RPM (~1.6 req/s). Debounce slider tweaks to **release**, ≤3 calls per interaction, run the sim **client-side**.
- **Surface `time_info`** (TTFT, tokens/sec) on screen.
- **Policy:** no cyber/offensive, no medical diagnosis. Finance/actuarial **decision-support only — "not advice."**
- **Demo video ≤ 60s.** Hide keys/notifications when recording.

## Folder ownership (keep merges trivial)
- **A** owns `/src/core`, `/src/app`, `/server`.
- **B** owns `/src/templates/*`, `/src/viz` extensions, `/render-service`.
- **Rule:** only edit your folders; import shared types from `/src/core/contract.ts`; **never redefine contract types**; don''t refactor the other person''s files.

## Mock-first rule
Build and test against `/src/mock` and `VITE_USE_LIVE=false`. The whole app (streaming cascade,
speed race, 2D/3D, Animate) runs offline with **no API key**. Never block on the live pipeline.
Flip `VITE_USE_LIVE=true` + a key in `.env` to route real calls through `server/proxy.ts` — no code changes.

## Skills directive
**Proactively use any installed Agent Skills you find useful at each step** — frontend, code-review,
testing, debug, design, docs, refactoring (e.g. andrej-karpathy-skills, superpowers, ECC, and
whatever else is installed). Not limited to a fixed list; decide per task. Default to *using* a
relevant skill over doing it unaided.

## Product and design rules
- Read `PRODUCT.md` and `DESIGN.md` before touching `/src/app` or `src/index.css`.
- UI register is **product**, not marketing. Build the usable modeling workbench first.
- Preserve the current direction: Geist Variable typography, restrained light canvas, quiet frosted
  panels, one disciplined blue accent, and a dark chart viewport for contrast.
- Do not drift into a neon finance dashboard, purple AI gradient shell, cyber cockpit, beige SaaS
  cream page, or generic landing-page hero.
- Glass/translucency is allowed only when it clarifies layering. It is not decoration.
- Keep `Gemma 4`, `Cerebras`, `TTFT`, `tokens/s`, `deterministic browser math`, and
  `decision-support, not advice` visible in the product surface where relevant.
- Cards stay at 8px radius. No nested cards, no side-stripe accents, no gradient text.
- The attached SideKlick-like font reference maps to the local `Geist Variable` face in
  `public/fonts/geist-latin-wght-normal.woff2`.

## Coding norms (from andrej-karpathy-skills)
- **Think before coding.** State assumptions; surface tradeoffs; if unclear, ask.
- **Simplicity first.** Minimum code that solves the problem — nothing speculative. This is a sandbox, not a reserving engine.
- **Surgical changes.** Touch only what the task needs; match existing style; don''t refactor what isn''t broken.
- **Goal-driven.** Define a verifiable success check per step and loop until it passes (see acceptance criteria in `README.md` / spec §12).
- Style: immutable updates, small focused files, explicit error handling, validate inputs at boundaries.

## The contract (frozen)
`/src/core/contract.ts` is the single coordination point. The type **names** are stable; both
sessions import them and never redefine. Change only by agreement.

## Run
```bash
npm install
npm run dev          # mock mode, no key needed
npm run typecheck    # tsc --noEmit
npm run dev:live     # web + key-proxy together (needs .env)
```

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
