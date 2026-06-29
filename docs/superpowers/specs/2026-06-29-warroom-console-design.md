# War Room Console Expansion - Design Spec

**Date:** 2026-06-29
**Owner:** War Room lane
**Status:** Approved design draft for user review

## Goal

Turn the War Room from a mostly visual swarm scene into an interactive situation-room console. Users should be able to inspect what each Gemma agent concluded, ask follow-up questions to the whole swarm, watch the room react while the swarm thinks, and export a Gemma-written HTML report.

This remains decision-support, not advice. It must keep `Gemma 4`, `Cerebras`, TTFT, tokens/s, deterministic browser math, and the decision-support caveat visible where relevant.

## Scope

In scope:
- Clickable desk clusters and workers inside the canvas.
- A compact agent list for precise selection.
- Hover labels describing each agent's responsibility.
- A right-side inspector with agent conclusions, evidence, critiques, statistics, and transcript.
- Whole-swarm free chat that updates the room state.
- Loading "panic sprint" movement with dry office-comedy dialogue.
- Gemma 4 generated HTML report preview and download.
- Drag pan, wheel zoom around cursor, double-click focus, reset view, and keyboard navigation.

Out of scope for this slice:
- Editing `src/app`, `src/core`, `src/index.css`, `server`, or shared Vite config.
- Building a governed reserving engine or advice system.
- Native PDF generation. First export is HTML with browser download.
- A separate dashboard page. The War Room stays the primary experience.

## UX Layout

The War Room becomes a three-part workbench.

### Canvas Center

The canvas remains dominant. It shows the generated situation-room background, animated worker groups, agent bubbles, hover labels, and selection/focus highlights.

User interactions:
- Drag to pan the camera.
- Wheel to zoom around the cursor.
- Click a desk or worker to select that agent.
- Double-click a desk to focus the camera on that agent group.
- Hover a desk to show what that agent is responsible for thinking.
- Escape clears selection.
- Plus/minus zoom.
- Arrow keys pan.
- Reset view returns to the full room.

### Right Inspector

A persistent right-side inspector shows `Swarm Overview` by default and switches to the selected agent after canvas/list selection. It is DOM-based, not canvas-based, so text stays crisp and accessible.

Agent detail hierarchy:
1. Conclusion
2. Evidence
3. Critique and judgment
4. Statistics
5. Full transcript

### Bottom Command Strip

A compact bottom strip contains:
- Whole-swarm question input.
- Recent Q&A state.
- Export report action.

Questions update the War Room rather than living only in chat history.

## Agent Intelligence Model

Each agent gets a derived dossier from the current reasoning state and agent event results. This dossier powers bubbles, hover labels, the agent list, the inspector, chat context, and report export.

Dossier fields:
- `agentId`
- `label`
- `responsibility`
- `status`
- `conclusion`
- `evidence`
- `critique`
- `stats`
- `transcript`
- `timeInfo`

Responsibilities are static metadata in War Room code. Conclusions, evidence, critique, transcript, and timing come from the live event stream where available, with mock equivalents in offline mode.

Characters speaking:
- Active bubbles use each agent's real streamed conclusion when available.
- Idle bubbles are role-aware and scenario-aware instead of a generic loop.
- During question loading, relevant groups enter a panic state and speak short dry office-comedy lines tied to their job.

Example panic lines:
- Orchestrator: "Routing year-two chaos. Please keep receipts."
- Modeler: "Reopening assumptions with a fresh pen."
- Visualizer: "If this becomes a waterfall chart, I am blaming variance."
- Sensitivity: "Stress knobs unlocked. Nobody touch drift yet."
- Risk: "Year-two loss? Fine, reopening the tail cabinet."
- Explainer: "Converting panic into plain English."

## Chat Flow

The free-chat box asks the whole swarm by default.

When the user submits a question:
1. Create a new question run tied to the current simulation context.
2. Update the central board with the user question and `Swarm investigating`.
3. Mark relevant groups as `panic`.
4. Increase movement speed and loosen wander radius while loading.
5. Stream a mini-cascade through the existing `AgentEvent` shape.
6. Update desk bubbles, the right inspector, and the central board as tokens arrive.
7. Store the question, agent conclusions, final swarm answer, metrics, and timing in chat history.
8. When complete, settle workers back to desk clusters and show the final answer on the board.

Example questions:
- "What will happen in 2 years?"
- "Which year had the greatest loss?"
- "What assumption is driving the risk?"
- "Which parameter should I stress first?"

Live mode should use Gemma 4 through the existing Cerebras-compatible path. Mock mode must still run offline and clearly label mock outputs.

## Report Export

The first report export is preview-first HTML.

Flow:
1. User clicks `Export report`.
2. War Room gathers scenario title, model, params, metrics, agent dossiers, chat Q&A, timestamps, mode, and timing.
3. It sends a compact report brief to Gemma 4 through the existing Cerebras path.
4. Gemma writes the narrative report sections:
   - Executive summary
   - Agent-by-agent findings
   - Key risks and sensitivities
   - Plain-English interpretation
   - Decision-support caveat
5. The browser assembles a styled HTML report using Gemma narrative plus structured facts.
6. A modal opens with the report preview.
7. User downloads the report as `.html`.

The report must visibly include:
- `Gemma 4`
- `Cerebras`
- TTFT and tokens/s when available
- deterministic browser math
- `decision-support, not advice`

If live mode is unavailable, report export may generate a mock preview, but it must be clearly marked as mock.

## Canvas Interaction And Camera

The canvas gets map-like navigation.

Camera rules:
- Dragging changes a user camera target.
- Wheel zooms around the cursor, preserving the world point under the pointer.
- Double-clicking a desk focuses that group.
- Auto-focus on active agents only happens if the user has not manually panned recently.
- Camera is clamped to room bounds.
- Reset view clears manual override and returns to the full room.

Hit testing:
- Use existing `scene.zones` for desk hit boxes.
- Use current worker positions for worker hit boxes.
- Prefer deterministic helpers in `scene.ts`/`camera.ts`.
- Do not create DOM overlays inside the canvas for desk labels; draw hover labels on canvas.

## Components And Modules

Existing War Room files remain the primary edit surface:
- `src/warroom/WarRoom.tsx`: orchestration, selection, chat/report modal hooks, camera input wiring.
- `src/warroom/draw.ts`: hover labels, selected highlights, panic visuals, hit-area debugging if needed.
- `src/warroom/scene.ts`: desk metadata and hit testing helpers.
- `src/warroom/crowd.ts`: panic movement and settle-home behavior.
- `src/warroom/bubbles.ts`: role-aware idle/loading dialogue.
- `src/warroom/agents.ts`: responsibilities and agent metadata.

New War Room-only modules:
- `src/warroom/agentDossier.ts`: derives inspector/report data from reasoning state.
- `src/warroom/questionRun.ts`: creates whole-swarm question runs and mock/live event streams.
- `src/warroom/reportExport.ts`: builds report brief, calls Gemma in live mode, assembles HTML.
- `src/warroom/camera.ts`: pan/zoom/focus math and camera clamps.

Allowed assets/docs:
- `public/warroom/**`
- `docs/superpowers/specs/**`

Avoid unless explicitly approved:
- `src/app/**`
- `src/core/**`
- `src/index.css`
- `server/**`
- shared Vite config

If report/chat needs missing proxy capabilities, first design a War Room-side adapter against the existing APIs and ask before touching shared owner-A/server files.

## Data Flow

```text
AgentEvent stream
  -> reasoningGraph.applyEvent
  -> ReasoningState
  -> agentDossier.ts
  -> canvas bubbles / hover labels / inspector / report brief

User question
  -> questionRun.ts
  -> mini AgentEvent stream
  -> same pipeline as above

Export report
  -> reportExport.ts gathers structured facts
  -> Gemma 4 writes narrative
  -> HTML preview modal
  -> user downloads .html
```

## Error Handling

Chat:
- If live Gemma fails, show an agent-visible error state and keep the previous run intact.
- Do not silently fake live output. If mock fallback is used, label it.
- Disable duplicate submits while a question run is active, or queue only one pending question.

Report:
- If live report generation fails, keep the modal open with a retry action.
- If mock fallback is used, mark the preview as mock.
- HTML download should still work if narrative exists.

Canvas:
- If hit testing fails, no selection change occurs.
- If image assets fail to load, keep existing procedural fallback.
- If users pan/zoom too far, clamps keep them in bounds.

## Testing And Verification

Required checks:
- `npm run typecheck`
- browser smoke check at `/warroom`
- console clean after reload
- visible canvas in a real browser tab
- select each agent by desk and by list
- hover labels show responsibilities
- chat question triggers panic movement and settles after completion
- report preview opens and downloads HTML
- `graphify update .`

Because hidden preview tabs pause `requestAnimationFrame`, visual verification must use a real visible browser tab or an explicit manual tick strategy.

## Acceptance Criteria

- Users can click desks/workers and list items to inspect agents.
- Hovering a desk shows a concise responsibility label.
- Inspector shows conclusion first, then evidence, critique, stats, and transcript.
- Free chat asks the whole swarm and updates the room state.
- Loading state has faster panic movement plus dry office-comedy lines.
- Completed agents settle back near their desks.
- HTML report preview is generated by Gemma 4 in live mode and downloadable.
- Mock mode remains offline and clearly labeled.
- Drag pan, wheel zoom around cursor, double-click focus, reset view, and keyboard controls work.
- No edits are required outside the War Room lane unless separately approved.

