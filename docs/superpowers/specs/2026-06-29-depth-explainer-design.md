# AugurForge — Depth Explainer: Live Gemma "Thinking Graph" (design)

**Date:** 2026-06-29 · **Owner:** Leo (Person B) · **Status:** approved, ready for plan

## Goal
A depth-explainer that makes Gemma-4-on-Cerebras speed *visceral*: a 3D force-directed "thinking graph"
that **assembles node-by-node in real time as the 6-agent swarm streams**, with captions typing in at
Cerebras tokens/sec. The user feels the speed by seeing the answer delivered **parts-by-parts**, never a
long wait. Doubles as a multi-agent showcase (Track 1) and shareable eye-candy (Track 2).

## Why this shows speed (the thesis)
Gemma is text-only, so it can't emit video — it emits the *reasoning*. We render that reasoning live:
each agent event paints a node/edge instantly, so the graph snaps into existence in ~1s **because**
Cerebras is fast. TTFT + tokens/sec on screen. (Manim is dropped — an offline render hides the speed.)

## Prior art studied
`DeusData/codebase-memory-mcp` `graph-ui/`: React 19 + Vite + **Three.js via react-three-fiber + drei +
@react-three/postprocessing (Bloom)** — instanced sphere nodes, additive-blended line edges, dark bg
(#06090f), color-by-degree, sprite labels, OrbitControls + idle auto-rotate. **But** its force layout is
precomputed server-side in C and shipped as static coords — NOT live. We keep its **aesthetic**, but use
an **in-browser force sim** so nodes can arrive incrementally.

## Architecture
A **Leo-owned `/src/explainer/` module** (new folder; no collision with Andreas's `/src/core`,`/src/app`,`/src/viz`).
- **`ThinkingGraph.tsx`** — `react-force-graph-3d` (Three.js + d3-force; lib does the live force sim + WebGL
  render). Styled to the galaxy aesthetic: dark bg, **UnrealBloom** via the lib's post-processing composer,
  color-by-role nodes, additive links, gentle `autoRotate`. Falls back to `react-force-graph` (2D) if 3D/bloom misbehaves.
- **`useReasoningGraph.ts`** — reduces a stream of `AgentEvent`s into `{nodes, links}` incrementally and
  calls the graph's `graphData()` so it grows live.
- **`eventSource.ts`** — two sources behind one interface: (a) **mock** simulated cascade (offline, no key —
  mock-first) and (b) **live** adapter that subscribes to AugurForge's real `OnEvent`/`AgentEvent` stream.
- **`captions.tsx` / HUD** — streamed caption text per beat + TTFT/tokens-sec readout.
- **`DepthExplainer.tsx`** — the mountable feature: `<DepthExplainer source={mock|live} payload={ExplainPayload?} />`.

## Data model (incremental, from AgentEvents)
```ts
type NodeRole = 'input'|'orchestrator'|'modeler'|'visualizer'|'sensitivity'|'risk'|'explainer'|'param'|'model'|'insight';
interface GNode { id: string; label: string; role: NodeRole; color: string; size: number; bornAt: number; pulse?: boolean }
interface GLink { source: string; target: string }
```
Build rule (render-on-resolve): `input` seed → on each agent `start` add its hub node (pulsing) + edge from
its upstream → on `token` stream the caption → on `done` solidify the node and spawn its concept children
(modeler→param nodes, risk→risk-flag nodes, explainer→insight node). Whole graph assembles in ~1s.

## Integration seam (with Andreas, when wired live)
Consumes the existing `AgentEvent`/`OnEvent` from `src/core/contract.ts` (no contract change). Andreas's app
mounts `<DepthExplainer source="live" />` and forwards the pipeline's `onEvent`. Until then it runs on the
**mock source** entirely offline — so it builds + demos with no key and no dependency on his pipeline.

## Reliability / mock-first
- Mock event source replays a realistic cascade with Cerebras-like cadence → full visual works with no key.
- 3D→2D fallback; node cap (~300) so physics stays smooth; bloom optional behind a flag.
- Never blocks the main app; it's an additive panel/overlay.

## MVP scope (first slice)
1. `react-force-graph-3d` galaxy graph + mock cascade event source → graph assembles live with bloom + autorotate.
2. Streamed captions + TTFT/tok-s HUD.
3. Then: live adapter to the real `AgentEvent` stream; optional `MediaRecorder` capture for the video.

## Testing
- Drive `useReasoningGraph` with a scripted event array → assert nodes/links build in the right order.
- Component mounts + renders with the mock source offline; 2D fallback path renders.
- `npm run typecheck` clean.

## Out of scope (for now)
Manim/render-service (deferred deep-path), RAG knowledge nodes (future enhancement — same graph can absorb them).