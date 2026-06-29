# War Room Recreation — Design Spec

> Faithful canvas recreation of `github.com/tejasprabhune/simfrancisco`'s pixel-sprite swarm,
> re-skinned as an office "situation room" and driven by AugurForge's real 6-agent `AgentEvent`
> stream. The War Room is an **aesthetic multi-agent VIEW** of the same process the main app runs —
> instead of the market-data chart, you watch the six Gemma agents work the floor.

**Owner:** B (Leo). Lives entirely in `src/warroom/`. Imports shared types from `src/core/contract.ts`;
never redefines them; does not edit other owners' folders (one optional cross-link in `App.tsx` is left to A).

---

## 1. What we're recreating (from the real repo)

The study (`tasks/wo3adazz8.output`) reverse-engineered simfrancisco's actual frontend (`frontend/src/map.js`):

- **Sprites** — a baked atlas `sprites.png` (240x128 = 10 chars in 5x2 blocks of 48x64). Each block is a
  `3 frame-col x 4 facing-row` grid of 16x16 cells. Slice: `bx=(c%perRow)*48, by=floor(c/perRow)*64;
  sx=bx+frame*16, sy=by+dir*16`. Variety = which block (no recolor). The pack is CC BY-SA — we cannot ship it.
- **Walk cycle** — `WALK=[1,0,1,2]` (contact-pass-contact-pass) @ `WALK_FPS=8` (125ms/frame, 500ms loop),
  driven by a per-agent `frameClock` seeded with a random phase. 4-dir facing from velocity:
  `dir = |vx|>|vy| ? (vx<0?1:2) : (vy<0?3:0)` (0 down,1 left,2 right,3 up).
- **Render loop** — one self-rescheduling `requestAnimationFrame` chain, variable timestep,
  `dt = min(0.05, (now-lastT)/1000)`. Foot-anchored blit with `imageSmoothingEnabled=false`
  (nearest-neighbor upscale of the 16px cell). Below ~9 on-screen px -> cheap colored-square LOD.
- **Camera** — two objects `cam`/`camTarget`; fps-independent lerp `k = 1 - Math.pow(0.0001, dt)`.
  Discrete moves set only `camTarget`; the lerp eases the render cam over.
- **Movement** — pure constant-speed wander: `speed=5+rand*9` px/s, heading jitter +-0.8 rad every
  1.2-3.6 s, walkable-mask gate + bounce (no pathfinding).
- **Bubbles** — canvas-drawn (not DOM), max 7 at once, re-selected every 2600 ms, greedily spread >165 px
  apart; word-wrap via `measureText` to `maxW~156`, hard 3-line cap; downward tail with apex clamped
  inside the box; box-x clamped to the viewport. Only shown when zoomed in.
- **Layers** — water/letterbox fill -> baked scene image -> sprites (+inline markers) -> bubbles -> HTML HUD overlay.
- **Easing** — verdict markers pop with `easeOutBack` (c1=1.70158) over `POP_MS~340`, staggered over a
  reveal window so reactions cascade across the crowd rather than firing in unison.

## 2. The mapping (simfrancisco -> AugurForge)

| simfrancisco | War Room |
|---|---|
| SF map (baked PNG) | **Office "situation room"** floor, drawn procedurally in pixel-art (desks, monitors, central board) |
| ~thousands of ACS-sampled residents | **6 groups** (one per agent), ~20-34 workers each, capped ~180 |
| `agent_said` speech bubble | **streamed `AgentEvent.delta`** tokens for the active group |
| client-side stochastic reveal of one `p_yes` | **real per-agent `start/token/done`** — richer than the repo's aggregate |
| poll -> aggregate metric | `SimResult.metrics` on the central board (P(ruin), VaR, ...) |
| licensed sprite pack | **Gemma-generated trait JSON -> deterministic baked atlas** |

**Six groups, in pipeline topology** (`reasoningGraph.UPSTREAM`):
`input -> orchestrator -> modeler -> visualizer`, then `visualizer` fans out to `sensitivity + risk + explainer`
(these three light up **simultaneously** — `runTweak` is `Promise.allSettled`). Build cascade ~ 2 s (mock cadence:
TTFT~110ms, ~16ms/word, agents ~120ms apart) — pace the scene to it so "Cerebras-fast" is *shown*.

**Event -> visual contract:**
- `start(X)` -> light group X's pod, draw an arrow from its upstream group, begin a "thinking" pulse.
- `token(X)` -> append `delta` to group X's bubble caption (typewriter, blue caret).
- `done(X)` -> stop pulse, drop the produced artifact on the desk (template chip / param chips / whiteboard
  spec / risk sticky notes / insight card), flash `timeInfo.ttftMs` + `tokensPerSec` by the pod.
- `error(X)` -> error badge from `e.error`.

## 3. Characters — Gemma-authored, deterministically baked

Gemma can't draw PNGs, so it produces **design traits as JSON**; a pure baker turns traits -> pixels.

**Generation (once, via Cerebras `gemma-4-31b`):** one call returns all 6 groups; result committed as
`src/warroom/characters.json`. No key/proxy/rate-limit at runtime. This is "use Cerebras to generate the
characters" done in a text-only-compatible, reproducible way — mirroring how the repo *ships a baked asset*.

**Per-group trait schema** (what we ask Gemma to fill; synthetic placeholder values):
```jsonc
{
  "agentId": "orchestrator",            // one of the 6 fixed AgentIds
  "title": "Routing Desk",
  "concept": "one-line vibe of this team",
  "build": "slim" | "avg" | "broad",
  "headgear": "none" | "cap" | "headset" | "visor" | "beanie",
  "palette": {
    "skin":  ["#e8bd99", "#c98a5e", "#8d5a3c"],  // 2-4 options -> per-individual variety
    "hair":  ["#2b2b2b", "#6b4a2a", "#d9c9a0"],  // 2-4 options
    "top":   "#3b6fb0",   // the GROUP UNIFORM color (shared identity), anchored to a muted ROLE_COLOR
    "bottom":"#2a2f3a",
    "accent":"#c8a23c"    // headgear/trim
  }
}
```
**Identity vs. variety:** `top`/`accent`/`headgear`/`build` are shared across a group (its uniform look);
each individual picks `skin`/`hair` from the option arrays via a seeded RNG (mulberry32) -> unique within the group.

**Atlas layout:** `VARIANTS_PER_GROUP=4`, 6 groups -> 24 blocks, `perRow=4` -> atlas `192x384`.
`block = group*4 + variant`. Each block keeps the repo's `3 frames x 4 dirs` of 16x16. The baker draws a
16px humanoid (head+hair, torso=uniform, legs, headgear) per (dir, frame), offsetting a leg/arm per stride
frame for the contact-pass walk; left mirrors right. Output = an offscreen canvas the renderer blits exactly
like `sprites.png`. Pure + seeded => byte-reproducible.

## 4. Aesthetic reconciliation (resolves the CLAUDE.md conflict)

The study flagged the **current** War Room as a forbidden "neon cyber cockpit" (dark + cyan grid + gradient
badge + Inter). Resolution:
- **Canvas scene = pixel-art** (the point of recreating the repo) but in a **professional, neutral office
  palette** — warm floor, graphite desks, soft monitor glow; **no neon, no cyan grid**.
- **HUD/chrome = CLAUDE.md tokens** — Geist, `--paper`/`--panel` frosted surfaces, single `--blue` accent,
  `--r` 8px, `--shadow-soft`. Group accents = **muted** `ROLE_COLOR` (desaturated for the light register).
- Keep the literal strings **Gemma 4 . Cerebras . TTFT . tokens/s** visible.

## 5. Data flow & reuse (no new contract types)

Reuse the explainer plumbing verbatim:
- `eventSource.ts` -> `mockEventSource` (offline) / `liveEventSource`.
- `liveSource.ts` -> `realPipelineSource()` (real `runPipeline`+`runTweak`; flips to live Cerebras with
  `VITE_USE_LIVE=true`, no code change).
- `reasoningGraph.ts` -> `initReasoning`/`applyEvent` reducer (active agent, `captions[agent]`, artifacts).
- `useClipRecorder.ts` -> webm capture (keep Record/Replay).

## 6. File plan (all under `src/warroom/`)

| File | Action | Responsibility |
|---|---|---|
| `characters.json` | create | Gemma-generated traits for the 6 groups (committed asset) |
| `traits.ts` | create | Trait TS types + `loadGroupTraits()` (validates `characters.json`, fallback palette) |
| `sheet.ts` | create | `SHEET` constants + `frameRect(block,frame,dir)` slicing math (ported) |
| `bakeAtlas.ts` | create | Pure deterministic pixel baker: traits -> offscreen-canvas atlas (24 blocks) |
| `crowd.ts` | rewrite | Worker structs (group, variant, wx/wy, ang, speed, frameClock, dir, home); seeded layout in 6 desk zones; soft home-spring wander + desk/wall bounce (relaxed cages) |
| `scene.ts` | create | Procedural pixel office plate (floor, 6 desk clusters, central situation board) + walkable test |
| `engine.ts` | create | rAF loop, dt clamp, cam/camTarget lerp, focus-active-group, walk-cycle/facing, foot-anchor blit + LOD, layer order |
| `bubbles.ts` | create | Ported `_drawBubble` (wrap/3-line/tail/clamp), light restyle + group stripe; active caption stream + rotating ambient idle pool |
| `draw.ts` | rewrite | Thin orchestrator calling scene/engine/bubbles each frame (or fold into engine) |
| `WarRoom.tsx` | rewrite | React shell: canvas + event subscription (reuse reducer), HUD, **Back-to-AugurForge** button, Mock/Real, Record/Replay |
| `warroom.css` | rewrite | Import index.css tokens; light frosted HUD; drop dark/cyan/Inter |
| `Stickman.tsx` | delete | Superseded by baked sprites |
| `dev.tsx`, `index.ts`, `warroom.html` | keep/modify | Standalone entry unchanged; `index.ts` re-exports updated surface |

**Navigation:** War Room HUD gets a left "Back to AugurForge" frosted pill -> `import.meta.env.BASE_URL`
(serves `index.html` in dev and build). Optional reciprocal "Open Situation Room" link in `App.tsx`'s nav-rail
is left for owner A (one line) to avoid cross-folder edits.

## 7. Acceptance checks

1. `npm run typecheck` -> `TSC_EXIT=0`.
2. `npm run build` -> succeeds.
3. `/warroom.html` renders: a `<canvas>` with the office scene, **>100 animated pixel characters** in 6 groups,
   no console errors (`preview_console_logs` clean; `preview_eval` reports `canvas:true`, figure count).
4. Mock cascade: groups light up in pipeline order (3 sequential, then 3 together); active group streams a
   caption bubble; TTFT/tok-s update on the HUD.
5. "Back to AugurForge" navigates to the main app.
6. HUD uses Geist + `--blue` + 8px frosted (no cyan/neon); scene is pixel-art office.
7. `characters.json` is real Gemma output (generated via `gemma-4-31b`), committed; no API key in any file.

## 8. Risks / watch-outs

- LLM-authored hex palettes may clash -> baker clamps/normalizes colors and desaturates toward the muted
  ROLE_COLOR family; `traits.ts` supplies a deterministic fallback per group if `characters.json` is missing/invalid.
- Dense sprites can overlap -> add a per-frame y-sort (the repo skips it; our office is denser).
- Keep the LOD square fallback + offscreen cull for 60fps with ~180 figures.
- Baker pixel-art quality is the main aesthetic risk -> keep the humanoid template simple and readable at 16px;
  verify in the preview and iterate.
