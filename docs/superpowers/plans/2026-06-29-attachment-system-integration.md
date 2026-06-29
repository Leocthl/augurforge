# Attachment System Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Andreas' multimodal attachment feature and make the main workbench, Depth Explainer, and War Room share the latest uploaded/input context.

**Architecture:** Keep the main app as the orchestration source of truth. Add a tiny shared browser-session module that stores sanitized cascade context and lets standalone Explainer/War Room pages initialize from it without storing raw image data URLs.

**Tech Stack:** React, TypeScript, Vite, Vitest, browser `localStorage`/custom events, existing AugurForge agent pipeline.

---

### Task 1: Merge Andreas And Resolve App Conflict

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/index.css`
- Add/Modify from merge: Andreas attachment files

- [ ] **Step 1: Start merge**

Run: `git merge --no-commit --no-ff origin/andreas`

Expected: one content conflict in `src/app/App.tsx`; `src/index.css` auto-merges.

- [ ] **Step 2: Resolve `App.tsx` by preserving both systems**

Keep these imports together:

```ts
import type { ModelerResult } from '../core/contract';
import { ReasoningPanel, initReasoning, applyEvent, type ReasoningState } from '../explainer';
```

Keep both pieces of state:

```ts
const [reasoning, setReasoning] = useState<ReasoningState>(() => initReasoning(performance.now()));
const [modelerMapping, setModelerMapping] = useState<Record<string, string>>({});
```

Keep both event paths:

```ts
setReasoning((s) => applyEvent(s, e, performance.now()));
// ...
} else if (e.agent === 'modeler' && e.status === 'done') {
  setModelerMapping((e.result as ModelerResult)?.mapping ?? {});
}
```

Keep both cascade resets:

```ts
setReasoning(initReasoning(performance.now()));
setModelerMapping({});
```

- [ ] **Step 3: Preserve both Inspector tabs**

The tab union must include both `trace` and model evidence:

```ts
type InsightTab = 'agents' | 'trace' | 'model' | 'risk' | 'explain' | 'sensitivity';
```

The model panel must render `inputEvidence`, and the Trace panel must render:

```tsx
{activeInsight === 'trace' && (
  <ReasoningPanel state={reasoning} building={building} latest={latestTime} />
)}
```

### Task 2: Add Shared Session Context

**Files:**
- Create: `src/core/sessionContext.ts`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Create session context module**

Add a module with:

```ts
export interface AugurForgeSessionSnapshot {
  version: 1;
  updatedAt: number;
  input?: {
    intent?: string;
    mode?: 'auto' | 'library' | 'generate';
    templateId?: string;
    attachments?: Array<{ id: string; name: string; kind: string; mimeType: string; size: number; pageCount?: number; note?: string; textPreview?: string }>;
  };
  modelerMapping?: Record<string, string>;
  title?: string;
  metrics?: Array<{ id: string; label: string; value: string }>;
  latestSummary?: string;
}
```

Export `writeAugurForgeSession`, `readAugurForgeSession`, and `sanitizeAttachmentsForSession`.

- [ ] **Step 2: Write snapshots from the main app**

In `App.tsx`, remember the latest `PipelineInput` in state/ref during `runCascade`, update the snapshot when the modeler finishes, and update headline metrics after deterministic math runs.

### Task 3: Read Session In Explainer And War Room

**Files:**
- Modify: `src/explainer/DepthExplainer.tsx`
- Modify: `src/warroom/WarRoom.tsx`

- [ ] **Step 1: Initialize Explainer from session**

On standalone load, read `readAugurForgeSession()` and use attachment names/modeler mapping as the initial context label or transcript context, while keeping existing mock defaults when absent.

- [ ] **Step 2: Initialize War Room from session**

Use the session snapshot to populate board title, phase/mode, uploaded attachment evidence, metrics, and latest summary. Keep existing live/mock cascade behavior.

### Task 4: Build And Commit

**Files:**
- Any merge result files

- [ ] **Step 1: Run fast verification**

Run: `npm run build`

Expected: successful TypeScript and Vite production build. Large chunk warning is acceptable.

- [ ] **Step 2: Update graphify**

Run: `graphify update .`

Expected: command completes or leaves updated graph output.

- [ ] **Step 3: Commit and push**

Commit with: `git commit -m "Integrate multimodal attachments across system surfaces"`

Push with: `git push origin HEAD:main`
