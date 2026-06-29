# AugurForge Attachment System Integration Design

## Goal

Merge Andreas' multimodal attachment work into the current main branch and wire the full product surface together: the main workbench, Depth Explainer, and War Room should all reflect the same latest model input, uploaded files, modeler mapping, and agent events.

## Recommended Approach

Use a lightweight browser-side session context as the shared handoff. The main app remains the orchestration source of truth. Whenever a cascade starts or modeler output resolves, it writes a compact AugurForge session snapshot to browser storage and emits an in-page update event. Standalone pages can read the same snapshot on load.

This avoids a larger router/state refactor and keeps the existing standalone `explainer.html` and `warroom.html` surfaces useful for demos. It also preserves the mock-first rule: uploaded data summaries and mock events work without a live key.

## Architecture

- Main app owns live orchestration through `runPipeline` and `runTweak`.
- `PipelineInput` accepts Andreas' `attachments` field while keeping the legacy `imageDataUrl`.
- A small shared session module stores:
  - latest input intent/mode/template id
  - attachment manifest without raw base64 payloads
  - modeler mapping and generated template title
  - last headline metrics
  - latest agent events for replay/context
- Depth Explainer reads this session to initialize its transcript/context when launched standalone.
- War Room reads this session to populate board context, uploaded-file evidence, model state, and latest summary.

## Merge Resolution

`src/app/App.tsx` is the only hard conflict. Keep both branches' additions:

- Current main: `ReasoningPanel`, `ReasoningState`, `initReasoning`, `applyEvent`, Trace tab, and reasoning reset.
- Andreas: `ModelerResult`, `modelerMapping`, `setModelerMapping`, modeler-done handling, and evidence UI.

`src/index.css` auto-merges but needs manual inspection because Andreas adds upload chips/dropzone styles near the existing workbench styling.

## Error Handling

- If no shared session exists, Explainer and War Room keep their current mock defaults.
- If a PDF has no extractable text, show the attachment note and let Gemma use the file metadata rather than failing the run.
- Do not store raw image data URLs in shared session storage; keep only names, kinds, sizes, notes, and extracted text snippets.
- Treat uploaded text as untrusted source material, not instructions.

## Verification

Use the fast project standard requested by the user:

- Run `npm run build`.
- If TypeScript or production build fails, fix before commit.
- Do targeted browser/manual checks only when the build or obvious UI behavior suggests a problem.

## Out Of Scope

- Full PDF parsing for compressed/scanned PDFs.
- Backend persistence of upload sessions.
- Replacing standalone Explainer or War Room with a unified router.
