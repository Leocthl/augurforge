# Graph Report - augurforge  (2026-06-29)

## Corpus Check
- 104 files · ~218,651 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 918 nodes · 1651 edges · 61 communities (44 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c3ba0b27`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 131|Community 131]]
- [[_COMMUNITY_Community 145|Community 145]]
- [[_COMMUNITY_Community 153|Community 153]]
- [[_COMMUNITY_Community 159|Community 159]]
- [[_COMMUNITY_Community 160|Community 160]]
- [[_COMMUNITY_Community 163|Community 163]]
- [[_COMMUNITY_Community 171|Community 171]]
- [[_COMMUNITY_Community 175|Community 175]]

## God Nodes (most connected - your core abstractions)
1. `AgentId` - 21 edges
2. `AugurForge — Build Spec & Implementation Plan` - 21 edges
3. `OnEvent` - 20 edges
4. `simulateGbm()` - 19 edges
5. `compilerOptions` - 18 edges
6. `Explainer Polish + Integration Implementation Plan` - 17 edges
7. `chat()` - 16 edges
8. `isRecord()` - 15 edges
9. `Math Engine Upgrade Plan` - 15 edges
10. `errMsg()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Explainer Polish + Integration Implementation Plan` --references--> `Main App Component`  [EXTRACTED]
  docs/superpowers/plans/2026-06-29-explainer-polish.md → src/app/App.tsx
- `Explainer Polish + Integration Implementation Plan` --references--> `Reasoning Graph Reducer`  [EXTRACTED]
  docs/superpowers/plans/2026-06-29-explainer-polish.md → src/explainer/reasoningGraph.ts
- `Explainer Polish + Integration Implementation Plan` --references--> `Explainer Types`  [EXTRACTED]
  docs/superpowers/plans/2026-06-29-explainer-polish.md → src/explainer/types.ts
- `War Room Recreation Design Spec` --references--> `Reasoning Graph Reducer`  [INFERRED]
  docs/superpowers/specs/2026-06-29-warroom-recreation-design.md → src/explainer/reasoningGraph.ts
- `Explainer Polish + Integration Implementation Plan` --references--> `Cascade Transcript Component`  [EXTRACTED]
  docs/superpowers/plans/2026-06-29-explainer-polish.md → src/explainer/CascadeTranscript.tsx

## Import Cycles
- 3-file cycle: `src/core/agents/shared.ts -> src/core/pipeline.ts -> src/core/agents/visualizer.ts -> src/core/agents/shared.ts`

## Communities (61 total, 17 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (66): mockText(), runExplainer(), finite(), GENERATED_SPEC_SCHEMA, MAPPING_SCHEMA, mockModel(), MONTE_CARLO_SLIDERS, PARAMS_SCHEMA (+58 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (53): AGENTS, App(), AuditItem, InsightTab, intLabel(), isRecord(), modelAuditItems(), pctInterval() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (34): advanceState(), brownianBridgeCrossingProbability(), buildPercentileSeries(), clampInterval(), createPathState(), DEFAULT_PERCENTILES, finite(), GbmConfig (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (38): Explainer, SliderDef, VizShape, BLACK_SCHOLES_EXPLAINER, BLACK_SCHOLES_SLIDERS, clamp(), cleanMapping(), cleanText() (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (36): Series, finiteParam(), fmtMoney(), fmtPct(), fmtYears(), rangesFromSim(), rawNum(), render2D() (+28 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (39): Prose, fmtMs(), fmtRate(), Lap, Props, RaceState, SpeedHud(), chain (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (39): dependencies, plotly.js-dist-min, react, react-dom, react-force-graph-3d, three, three-spritetext, description (+31 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (25): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (23): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (23): 10. Tool-Calling Proof, 11. Demo Mode For Judges, 12. Streaming UI Throttle, 1. Live Health Strip And Smoke Probe, 2. Agent Receipts, 3. Vision Evidence Chips, 4. Generated Spec Reveal, 5. Cerebras Waterfall (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (18): bakeAtlas(), bodyDims(), CharColors, drawWorker(), shade(), PER_ROW, Build, BUILDS (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (15): Current State, Design Principles, Goal, Math Engine Upgrade Plan, Out Of Scope For Now, Phase 1: Credible Single-Asset Monte Carlo, Phase 2: Calibration From Uploaded Data, Phase 3: Portfolio Simulation (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (47): AMBIENT, ambientFor(), BubbleOpts, drawBubble(), roundRectPath(), wrap(), angLerp(), buildCrowd() (+39 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (12): CLAUDE.md — AugurForge, Coding norms (from andrej-karpathy-skills), Folder ownership (keep merges trivial), graphify, Hard constraints, Mock-first rule, Product and design rules, Run (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.17
Nodes (11): Absolute Bans, Accessibility And Responsiveness, Color Tokens, Component Rules, Copy Rules, DESIGN.md - AugurForge, Layout, Motion (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (10): Anti-References, Core Capabilities To Keep Visible, Demo Promise, Design North Star, Job To Be Done, Primary Users, PRODUCT.md - AugurForge, Product Purpose (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (9): Acceptance criteria (scaffold), AugurForge, Branch workflow, Environment, Live mode (Gemma-4-31b on Cerebras), Local generated-model demo, Project structure, Quickstart (mock mode — no API key) (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (18): Main App Component, Cascade Transcript Component, Depth Explainer Component, Explainer Polish + Integration Implementation Plan, File Structure, Self-Review Notes (resolved during planning), Task 1: Extend types + reasoning reducer with ordered beats (TDD), Task 2: Make ThinkingGraph variant-aware + add polish (+10 more)

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 25 - "Community 25"
Cohesion: 0.40
Nodes (4): BaseModel, ManimRequest, AugurForge render-service — Manim deep-path STUB. [OWNER: B]  TODO(branch: feat/, render_manim()

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (5): AugurForge — Next Workflow (design the work split), Current scaffold state (so you can skip a blind re-scan), Default owner split (adjust to what is actually stubbed), Each `PERSON_*_PLAN.md` must be a standalone kickoff a fresh Claude Code session can run with no other context, containing:, Method

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 31 - "Community 31"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 32 - "Community 32"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 33 - "Community 33"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (3): Config, Layout, PlotData

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (3): AugurForge, Cerebras Inference, Gemma 4

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): Andreas Spec: Simulation Engine + Market Sandbox, Leo Spec: Manim Deep-Path Explainer, Loss Development Triangle Chart

### Community 108 - "Community 108"
Cohesion: 0.06
Nodes (65): AgentEvent, AgentId, CascadeTranscript(), Props, DepthExplainer(), Mode, Props, el (+57 more)

### Community 112 - "Community 112"
Cohesion: 0.08
Nodes (23): 10. Streaming, speed harness & Animate, 11. ⭐ SCAFFOLD SCOPE — build exactly this on `main`, then stop, 12. Acceptance criteria (how you know the scaffold is done), 13. `CLAUDE.md` (Claude Code must generate this for the repo), 14.5 The `NEXT_WORKFLOW.md` hand-off (Claude Code writes this at the end of the scaffold run), 14. Git & collaboration workflow (after scaffold), 15. Build order (24h), 16. Demo (60s) & submission (+15 more)

### Community 131 - "Community 131"
Cohesion: 0.11
Nodes (18): 10. File-by-file change list, 11. Acceptance criteria, 12. Risks / mitigations, 1. Context / current state, 2. Goals / non-goals, 3. Decisions (from brainstorming), 4. Architecture & data flow, 5.1 `ThinkingGraph` (modified — shared) (+10 more)

### Community 145 - "Community 145"
Cohesion: 0.15
Nodes (12): AGENTS.md — AugurForge, Coding norms (from andrej-karpathy-skills), Folder ownership (keep merges trivial), graphify, Hard constraints, Mock-first rule, Product and design rules, Run (+4 more)

### Community 153 - "Community 153"
Cohesion: 0.17
Nodes (11): Architecture, AugurForge — Depth Explainer: Live Gemma "Thinking Graph" (design), Data model (incremental, from AgentEvents), Goal, Integration seam (with Andreas, when wired live), MVP scope (first slice), Out of scope (for now), Prior art studied (+3 more)

### Community 159 - "Community 159"
Cohesion: 0.20
Nodes (9): 1. `feat/manim-foundation` — FastAPI + deterministic per-shape Manim scenes · HIGH · ~4h, 2. `feat/manim-gemma` — Gemma 4 writes the explanation · HIGH · ~3h, 3. `feat/explain-endpoint` — the contract + fixture for Andreas · MED · ~1h (do early!), 4. `feat/rag-grounding` — future / stretch (your call, keep it instant) · MED · time-permitting, AugurForge — Leo Spec · Gemma-Powered Manim Deep-Path Explainer + Future Features, Feature branches (priority order), Ownership (keep merges trivial), Rules · checkpoints · timeline (+1 more)

### Community 160 - "Community 160"
Cohesion: 0.20
Nodes (9): 1. What we're recreating (from the real repo), 2. The mapping (simfrancisco -> AugurForge), 3. Characters — Gemma-authored, deterministically baked, 4. Aesthetic reconciliation (resolves the CLAUDE.md conflict), 5. Data flow & reuse (no new contract types), 6. File plan (all under `src/warroom/`), 7. Acceptance checks, 8. Risks / watch-outs (+1 more)

### Community 163 - "Community 163"
Cohesion: 0.22
Nodes (8): AugurForge — Andreas Spec · Gemma-4-on-Cerebras Simulation Engine + Market Sandbox, Feature branches (priority order), FIX FIRST — punch-list from the latest merge review, Make it MORE Gemma-4-on-Cerebras (the bar to clear), Model modules (beyond Monte Carlo) — flexible; favor generation, Rules · checkpoints · timeline, The core feature you own (state it plainly), The seam Leo depends on (freeze together first)

### Community 171 - "Community 171"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **395 isolated node(s):** `name`, `private`, `version`, `type`, `description` (+390 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AgentId` connect `Community 108` to `Community 16`, `Community 1`, `Community 12`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `OnEvent` connect `Community 0` to `Community 1`, `Community 108`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `applyEvent()` connect `Community 108` to `Community 1`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _396 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08540540540540541 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05333333333333334 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12685560053981107 - nodes in this community are weakly interconnected._