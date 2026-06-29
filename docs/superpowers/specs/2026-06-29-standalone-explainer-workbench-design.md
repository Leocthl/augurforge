# Standalone Explainer Workbench Design

Date: 2026-06-29
Status: Approved direction, pending implementation plan

## Summary

`explainer.html` becomes the full explainer workbench for AugurForge. It should no longer feel like a separate dark graph demo. It should match the main product design: light workbench shell, Geist typography, quiet panels, disciplined blue accent, and a dark graph viewport used for contrast.

The feature exists to help different business users understand uploaded data, model output, market scenario metrics, and Gemma 4 reasoning. The graph remains the main visual object, but the surrounding UI makes each node, color group, generated sentence, and stakeholder impact understandable.

## Product Decisions

- Primary surface: standalone `explainer.html`.
- Embedded main-app surface: stays compact through `ReasoningPanel` in the Inspector Trace tab.
- Data mode: default to the current main app session when available, with an in-explainer option to replace the input.
- Detail behavior: clicking a node opens Color Group First detail.
- Stakeholder roles: preload Executive, Finance, Risk/Compliance, Marketing, HR, and Operations.
- Role analysis source: each fixed role uses a live Gemma 4 call after the main explainer finishes.
- Role output: short impact brief plus impact score, risk level, key metrics, and compact charts.
- Sentence behavior: clicking a generated sentence highlights related nodes and switches the inspector to sentence/evidence view.
- Implementation scope: hackathon MVP, not the full long-term analytics product.

## Goals

1. Make the standalone explainer visually consistent with the main AugurForge page.
2. Make graph colors meaningful product categories, not decoration.
3. Let users inspect what a color group means, what a node means, and which generated sentences depend on it.
4. Use live session/upload/model data when available, while keeping mock mode explicit and useful for offline demos.
5. Show business impact from multiple stakeholder perspectives using live Gemma 4 calls.
6. Preserve `Gemma 4`, `Cerebras`, TTFT, tokens/s, deterministic browser math, and decision-support copy in the surface.

## Non-Goals

- Do not turn the explainer into a marketing landing page.
- Do not change `src/core/contract.ts` for design reasons.
- Do not make the main app Inspector Trace as full-featured as standalone in this pass.
- Do not build a governed financial, actuarial, HR, or marketing advisory system.
- Do not add unbounded role analysis calls on every graph interaction.

## Layout

The standalone page uses a product workbench layout:

- Top bar: product label, source status, live/mock switch, depth switch, rerun, and role preload status.
- Left/source strip: compact session/input receipt with current model, uploaded evidence, selected data source, and "Replace input".
- Center: dark graph viewport with subdued bloom, stable canvas sizing, and graph controls.
- Right inspector: group detail, selected node detail, sentence/evidence view, and stakeholder impact tabs.
- Bottom transcript: generated reasoning sentences, each clickable and connected to graph highlights.

Cards remain at 8px radius. Panels may use subtle translucency but should not become decorative glass. The visual language should follow `PRODUCT.md` and `DESIGN.md`.

## Graph Category Model

Node roles map to product categories:

- Blue/cyan: orchestration, visualization, and structural model choices.
- Purple: modeler output and inferred parameters.
- Amber: sensitivity drivers and dominant movement explanations.
- Red: risk and compliance flags.
- Green: explainer insights.
- Gray: evidence and source material.
- Teal: metrics and statistics.

The inspector describes the clicked node's color group first. Each group detail includes:

- Category name.
- Plain-English purpose.
- Group summary.
- All nodes in that group.
- Selected node detail.
- Related upstream/downstream nodes.
- Related transcript sentences.

## Node And Sentence Interaction

Node click:

1. Highlight the selected node.
2. Highlight directly connected nodes.
3. Open the right inspector to the color group.
4. Scroll or filter the transcript to related sentences when practical.

Sentence click:

1. Highlight graph nodes associated with that sentence.
2. Open inspector in sentence/evidence mode.
3. Show the sentence, evidence nodes, metrics, assumptions, and affected stakeholder roles.
4. Keep the selected sentence visibly active in the transcript.

The MVP can build links from existing reducer data: sentence nodes, insight nodes, metric nodes, risk nodes, evidence nodes, and agent ownership. More exact citation mapping can be added later.

## Stakeholder Perspectives

After the main explainer finishes, the page preloads six stakeholder analyses:

- Executive
- Finance
- Risk/Compliance
- Marketing
- HR
- Operations

Each role call asks Gemma 4 to interpret the same session payload, metrics, risk flags, sensitivity text, explainer text, and graph summary from that stakeholder's perspective.

Each role result should include:

- Impact brief: 3 to 5 concise sentences.
- Impact score: 0 to 100.
- Risk level: low, medium, high, or critical.
- Key concerns: 3 bullets.
- Recommended questions: 2 to 3 questions the stakeholder should ask.
- Metrics to watch: small list derived from existing simulation metrics.
- Chart data: compact role impact bars or metric weights where possible.

The UI shows loading state per role. Finished role tabs are cached for the current analysis run. Rerunning the explainer invalidates role results.

## Live Data And Mock Data

Standalone explainer should read the main session when available:

- User intent.
- Uploaded image/PDF/text receipt.
- Selected or generated template id.
- Current parameter set.
- Simulation metrics and raw audit metadata where safe.
- Agent event stream and reasoning graph state.

If no session exists, mock mode remains available and clearly labeled. Mock mode may use deterministic fixture stakeholder outputs to keep the UI testable offline, but live mode should use Gemma 4 on Cerebras.

The live/mock switch must be visible and honest. The page should not pretend mock role analysis is live Gemma output.

## Component Plan

New or expanded explainer-local components:

- `ExplainerWorkbench`: standalone page shell and layout orchestration.
- `GraphStage`: wraps `ThinkingGraph`, graph controls, selection state, and source status.
- `GroupInspector`: color group summary plus selected node detail.
- `SentenceEvidenceInspector`: clicked sentence view and linked evidence.
- `RoleImpactPanel`: role tabs, role loading states, role briefs, scores, and charts.
- `SourceReceiptPanel`: main-session input summary plus replace-input action.
- `TranscriptStrip`: upgraded `CascadeTranscript` with clickable sentences and active sentence state.

Existing components stay useful:

- `ThinkingGraph` remains the rendering primitive.
- `ReasoningPanel` remains compact for the main app Inspector Trace.
- `applyEvent` remains the reducer seam from `AgentEvent` to graph data.

Avoid redefining contract types. Add explainer-local view models where needed.

## Data Flow

1. Standalone page loads.
2. It checks for a current session snapshot.
3. It initializes mock or live event source.
4. Agent events flow into `applyEvent`.
5. Reasoning state produces graph nodes, links, transcript beats, and metadata.
6. Main explainer completion triggers stakeholder preload.
7. Each role Gemma call receives a bounded analysis payload.
8. Role results are cached under the current run id.
9. Node and sentence selections read from the same graph/transcript state.

Role calls should be concurrency-limited to avoid rate-limit spikes. The MVP can queue the six fixed roles with a small delay or low concurrency while still showing visible progress.

## Error Handling

- Missing live session: fall back to mock and show "No live session attached".
- Missing API key or live proxy failure: disable live role generation and show a clear proxy/key state.
- One role fails: show failure inside that tab only; do not break the graph.
- Empty Gemma prose response: use the existing metric-grounded fallback pattern and label it as fallback.
- Stale role result after rerun: clear cached role tabs immediately.
- Invalid stakeholder JSON: show raw prose fallback plus a warning state.

## Testing And Acceptance

Verification should include:

- Typecheck passes.
- Focused explainer reducer tests pass.
- Standalone explainer build passes.
- Browser check for default mock route: nonblank canvas, no console errors, subdued glow.
- Browser check for live route when key/proxy are available: real pipeline selected, graph grows, transcript text appears, role tabs load or fail independently.
- Node click opens color group detail.
- Sentence click highlights related nodes and opens sentence/evidence view.
- Role tabs show cached results after preload.
- `graphify update .` runs after code changes.

Acceptance criteria:

- Standalone explainer visually matches the main product direction.
- A user can understand what each color group means.
- A clicked node has a useful detail explanation.
- A clicked generated sentence shows related evidence nodes.
- Six stakeholder tabs provide live Gemma 4 role analysis in live mode.
- Mock mode remains honest and usable offline.

## Implementation Notes

Keep edits scoped to the explainer feature where possible:

- `src/explainer/**`
- `explainer.html`
- standalone explainer build config if needed
- narrowly scoped tests

Avoid unrelated work in `src/app/App.tsx`, `src/index.css`, and `src/core/contract.ts` unless coordination requires it.

