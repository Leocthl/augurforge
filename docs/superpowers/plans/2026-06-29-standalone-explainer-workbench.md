# Standalone Explainer Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `explainer.html` into a standalone AugurForge explainer workbench with color-group inspection, sentence evidence linking, and preloaded stakeholder impact analysis.

**Architecture:** Keep the frozen core contract unchanged and build explainer-local view models around the existing `AgentEvent -> ReasoningState -> ThinkingGraph/CascadeTranscript` path. `DepthExplainer` becomes a thin orchestration surface for the standalone route, while `ReasoningPanel` keeps using the compact graph/transcript components in the main app. Live role analysis imports `chat()` from `src/core/cerebras.ts` and uses bounded explainer-local payloads.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, `react-force-graph-3d`, existing AugurForge `chat()` client, existing `sessionContext` localStorage snapshot.

---

## File Structure

- Create `src/explainer/graphModel.ts`: pure view-model helpers for color groups, selected node details, related links, and sentence-to-node relationships.
- Create `src/explainer/graphModel.test.ts`: focused tests for group summaries, node selection, and sentence relation extraction.
- Create `src/explainer/roleAnalysis.ts`: stakeholder role definitions, live/mock role analysis runner, response parsing, and fallback shaping.
- Create `src/explainer/roleAnalysis.test.ts`: role list, mock analysis, parsing, and cache-key behavior tests.
- Create `src/explainer/ExplainerWorkbench.tsx`: standalone page shell that composes graph stage, source receipt, inspector, transcript, and role panel.
- Create `src/explainer/GroupInspector.tsx`: right-side color-group-first inspector for selected graph nodes.
- Create `src/explainer/RoleImpactPanel.tsx`: stakeholder tabs, role loading states, impact cards, metrics, and mini bars.
- Create `src/explainer/SourceReceiptPanel.tsx`: main-session receipt and replace-input affordance for the standalone page.
- Create `src/explainer/TranscriptStrip.tsx`: sentence-aware transcript wrapper that keeps existing agent beat behavior and adds sentence clicks.
- Modify `src/explainer/DepthExplainer.tsx`: keep event-source orchestration but render `ExplainerWorkbench`.
- Modify `src/explainer/ThinkingGraph.tsx`: accept selected/highlighted node ids and render muted non-highlighted nodes and links.
- Modify `src/explainer/types.ts`: add explainer-local UI types for selection, sentence references, group ids, and role impact results.
- Modify `src/explainer/explainer.css`: replace the dark overlay-only layout with the standalone light workbench shell and dark graph viewport.
- Modify `src/explainer/index.ts`: export new explainer-local helpers and components needed by tests or future embedding.

## Task 1: Graph View Model

**Files:**
- Create: `src/explainer/graphModel.ts`
- Create: `src/explainer/graphModel.test.ts`
- Modify: `src/explainer/types.ts`

- [ ] **Step 1: Add explainer UI types**

Add these types to `src/explainer/types.ts` after `ReasoningBeat`:

```ts
export type GraphGroupId = 'structure' | 'modeling' | 'sensitivity' | 'risk' | 'explanation' | 'evidence' | 'metrics' | 'input';

export interface GraphGroupInfo {
  id: GraphGroupId;
  label: string;
  summary: string;
  color: string;
  roles: NodeRole[];
}

export interface GraphSelection {
  nodeId: string | null;
  sentenceId: string | null;
}

export interface RelatedNode {
  id: string;
  label: string;
  role: NodeRole;
  relation: 'selected' | 'upstream' | 'downstream' | 'same-group' | 'sentence-evidence';
}

export interface SentenceRef {
  id: string;
  agent: AgentId;
  text: string;
  nodeIds: string[];
}
```

- [ ] **Step 2: Write failing graph-model tests**

Create `src/explainer/graphModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { groupForRole, inspectNode, sentenceRefsFromState } from './graphModel';
import type { GraphData, ReasoningBeat } from './types';

const data: GraphData = {
  nodes: [
    { id: 'input', label: 'Uploaded market data', role: 'input', color: '#fff', size: 9, bornAt: 0, pulse: false },
    { id: 'modeler', label: 'Modeler', role: 'modeler', color: '#a78bfa', size: 11, bornAt: 0, pulse: false },
    { id: 'param:sigma', label: 'sigma: 18', role: 'param', color: '#7dd3fc', size: 6, bornAt: 0, pulse: false },
    { id: 'risk:0', label: 'warning: tail risk', role: 'risk-flag', color: '#fb7185', size: 6, bornAt: 0, pulse: false },
    { id: 'metric:explainer:p-ruin', label: 'P(ruin): 8.9%', role: 'metric', color: '#67e8f9', size: 5, bornAt: 0, pulse: false },
    { id: 'insight:explainer:0', label: 'Volatility widens the cone.', role: 'insight', color: '#86efac', size: 5.5, bornAt: 0, pulse: false },
  ],
  links: [
    { source: 'input', target: 'modeler' },
    { source: 'modeler', target: 'param:sigma' },
    { source: 'insight:explainer:0', target: 'metric:explainer:p-ruin' },
  ],
};

const beats: ReasoningBeat[] = [
  { agent: 'explainer', status: 'done', text: 'Volatility widens the cone. Decision-support, not advice.' },
];

describe('graphModel', () => {
  it('maps node roles to product color groups', () => {
    expect(groupForRole('risk-flag').id).toBe('risk');
    expect(groupForRole('metric').label).toBe('Metrics and statistics');
    expect(groupForRole('modeler').id).toBe('modeling');
  });

  it('builds a color-group-first node inspection model', () => {
    const detail = inspectNode(data, beats, 'param:sigma');
    expect(detail?.group.label).toBe('Modeling and inferred parameters');
    expect(detail?.selected.label).toBe('sigma: 18');
    expect(detail?.related.map((node) => node.id)).toContain('modeler');
  });

  it('extracts sentence refs with related insight and metric nodes', () => {
    const refs = sentenceRefsFromState(data, beats);
    expect(refs[0]).toMatchObject({ agent: 'explainer', text: 'Volatility widens the cone.' });
    expect(refs[0].nodeIds).toContain('insight:explainer:0');
    expect(refs[0].nodeIds).toContain('metric:explainer:p-ruin');
  });
});
```

- [ ] **Step 3: Run the graph-model test and verify it fails**

Run: `npm test -- src/explainer/graphModel.test.ts`

Expected: FAIL because `src/explainer/graphModel.ts` does not exist.

- [ ] **Step 4: Implement `graphModel.ts`**

Create `src/explainer/graphModel.ts`:

```ts
import type {
  AgentId,
  GLink,
  GNode,
  GraphData,
  GraphGroupId,
  GraphGroupInfo,
  NodeRole,
  ReasoningBeat,
  RelatedNode,
  SentenceRef,
} from './types';

export interface NodeInspection {
  group: GraphGroupInfo;
  selected: GNode;
  groupNodes: GNode[];
  related: RelatedNode[];
  sentences: SentenceRef[];
}

const GROUPS: Record<GraphGroupId, GraphGroupInfo> = {
  input: {
    id: 'input',
    label: 'Input and source material',
    summary: 'Original user input, uploaded evidence, and session context that Gemma 4 used to build the analysis.',
    color: '#e6edf6',
    roles: ['input'],
  },
  structure: {
    id: 'structure',
    label: 'Structure and visualization',
    summary: 'Routing, model selection, and display choices that shape how the analysis is organized.',
    color: '#38bdf8',
    roles: ['orchestrator', 'visualizer', 'model'],
  },
  modeling: {
    id: 'modeling',
    label: 'Modeling and inferred parameters',
    summary: 'Parameters, assumptions, and field mappings inferred by the modeler from the supplied data.',
    color: '#a78bfa',
    roles: ['modeler', 'param'],
  },
  sensitivity: {
    id: 'sensitivity',
    label: 'Sensitivity and drivers',
    summary: 'Drivers that explain which assumptions move the outcome most strongly.',
    color: '#fbbf24',
    roles: ['sensitivity', 'driver'],
  },
  risk: {
    id: 'risk',
    label: 'Risk and compliance flags',
    summary: 'Warnings, review points, and governance lenses. These are decision-support signals, not regulated advice.',
    color: '#fb7185',
    roles: ['risk', 'risk-flag'],
  },
  explanation: {
    id: 'explanation',
    label: 'Explainer insights',
    summary: 'Plain-English and expert explanations generated from the model output and deterministic browser math.',
    color: '#86efac',
    roles: ['explainer', 'insight'],
  },
  evidence: {
    id: 'evidence',
    label: 'Evidence and source notes',
    summary: 'Supporting source text, mappings, references, and rationale used to ground graph statements.',
    color: '#94a3b8',
    roles: ['evidence'],
  },
  metrics: {
    id: 'metrics',
    label: 'Metrics and statistics',
    summary: 'Quantitative outputs from the deterministic browser simulation that anchor the explanation.',
    color: '#67e8f9',
    roles: ['metric'],
  },
};

export function allGraphGroups(): GraphGroupInfo[] {
  return Object.values(GROUPS);
}

export function groupForRole(role: NodeRole): GraphGroupInfo {
  return Object.values(GROUPS).find((group) => group.roles.includes(role)) ?? GROUPS.evidence;
}

export function inspectNode(data: GraphData, beats: ReasoningBeat[], nodeId: string | null): NodeInspection | null {
  if (!nodeId) return null;
  const selected = data.nodes.find((node) => node.id === nodeId);
  if (!selected) return null;
  const group = groupForRole(selected.role);
  const groupNodes = data.nodes.filter((node) => groupForRole(node.role).id === group.id);
  const sentences = sentenceRefsFromState(data, beats).filter((sentence) => sentence.nodeIds.includes(nodeId));
  return {
    group,
    selected,
    groupNodes,
    related: relatedNodes(data, selected, group.id, sentences),
    sentences,
  };
}

export function sentenceRefsFromState(data: GraphData, beats: ReasoningBeat[]): SentenceRef[] {
  return beats.flatMap((beat) => splitBeatSentences(beat).map((text, index) => ({
    id: `${beat.agent}:${index}`,
    agent: beat.agent,
    text,
    nodeIds: relatedNodeIdsForSentence(data, beat.agent, index),
  })));
}

export function nodeIdsForSentence(data: GraphData, sentence: SentenceRef | null): string[] {
  if (!sentence) return [];
  const ids = new Set(sentence.nodeIds);
  for (const id of sentence.nodeIds) {
    for (const link of data.links) {
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      if (source === id && target) ids.add(target);
      if (target === id && source) ids.add(source);
    }
  }
  return Array.from(ids);
}

function relatedNodes(data: GraphData, selected: GNode, groupId: GraphGroupId, sentences: SentenceRef[]): RelatedNode[] {
  const sentenceIds = new Set(sentences.flatMap((sentence) => sentence.nodeIds));
  const related = new Map<string, RelatedNode>();
  related.set(selected.id, { id: selected.id, label: selected.label, role: selected.role, relation: 'selected' });

  for (const node of data.nodes) {
    if (node.id !== selected.id && groupForRole(node.role).id === groupId) {
      related.set(node.id, { id: node.id, label: node.label, role: node.role, relation: 'same-group' });
    }
  }

  for (const link of data.links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (source === selected.id && target) pushRelated(data, related, target, 'downstream');
    if (target === selected.id && source) pushRelated(data, related, source, 'upstream');
  }

  for (const id of sentenceIds) pushRelated(data, related, id, 'sentence-evidence');
  return Array.from(related.values());
}

function pushRelated(data: GraphData, related: Map<string, RelatedNode>, id: string, relation: RelatedNode['relation']): void {
  const node = data.nodes.find((item) => item.id === id);
  if (!node || related.has(id)) return;
  related.set(id, { id: node.id, label: node.label, role: node.role, relation });
}

function splitBeatSentences(beat: ReasoningBeat): string[] {
  return beat.text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function relatedNodeIdsForSentence(data: GraphData, agent: AgentId, index: number): string[] {
  const ids = new Set<string>();
  const exactInsight = `insight:${agent}:${index}`;
  if (data.nodes.some((node) => node.id === exactInsight)) ids.add(exactInsight);
  for (const node of data.nodes) {
    if (node.id === agent || node.id.startsWith(`metric:${agent}:`) || node.id.startsWith(`evidence:${agent}:`)) ids.add(node.id);
  }
  return Array.from(ids);
}

function endpointId(value: GLink['source'] | GLink['target']): string {
  return typeof value === 'string' ? value : value.id;
}
```

- [ ] **Step 5: Run the graph-model test and verify it passes**

Run: `npm test -- src/explainer/graphModel.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/explainer/types.ts src/explainer/graphModel.ts src/explainer/graphModel.test.ts
git commit -m "feat: add explainer graph inspection model"
```

## Task 2: Stakeholder Role Analysis Service

**Files:**
- Create: `src/explainer/roleAnalysis.ts`
- Create: `src/explainer/roleAnalysis.test.ts`
- Modify: `src/explainer/index.ts`

- [ ] **Step 1: Add role impact types**

Add these types to `src/explainer/types.ts` after `SentenceRef`:

```ts
export type StakeholderRoleId = 'executive' | 'finance' | 'risk-compliance' | 'marketing' | 'hr' | 'operations';
export type RoleRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RoleImpactMetric {
  label: string;
  value: string;
  weight: number;
}

export interface RoleImpactResult {
  roleId: StakeholderRoleId;
  title: string;
  impactScore: number;
  riskLevel: RoleRiskLevel;
  brief: string;
  concerns: string[];
  questions: string[];
  metrics: RoleImpactMetric[];
  simulated?: boolean;
  error?: string;
}

export type RoleImpactStatus = 'idle' | 'loading' | 'done' | 'error';
```

- [ ] **Step 2: Write failing role-analysis tests**

Create `src/explainer/roleAnalysis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildRolePayload, parseRoleJson, ROLE_DEFS, runMockRoleAnalysis } from './roleAnalysis';
import type { ReasoningState } from './reasoningGraph';

const state: ReasoningState = {
  data: {
    nodes: [
      { id: 'risk:0', label: 'warning: ruin risk', role: 'risk-flag', color: '#fb7185', size: 6, bornAt: 0, pulse: false },
      { id: 'metric:explainer:p-ruin', label: 'P(ruin): 8.9%', role: 'metric', color: '#67e8f9', size: 5, bornAt: 0, pulse: false },
    ],
    links: [],
  },
  beats: [
    { agent: 'risk', status: 'done', text: 'Ruin probability is high for this scenario.' },
    { agent: 'explainer', status: 'done', text: 'Volatility drives the left tail.' },
  ],
  captions: {},
  active: null,
};

describe('roleAnalysis', () => {
  it('defines the six governed stakeholder roles in display order', () => {
    expect(ROLE_DEFS.map((role) => role.id)).toEqual([
      'executive',
      'finance',
      'risk-compliance',
      'marketing',
      'hr',
      'operations',
    ]);
  });

  it('builds a bounded payload from reasoning state and session text', () => {
    const payload = buildRolePayload(state, 'Scenario: uploaded market data');
    expect(payload.summary).toContain('Scenario: uploaded market data');
    expect(payload.metrics).toContain('P(ruin): 8.9%');
    expect(payload.reasoning).toContain('Volatility drives');
  });

  it('parses role JSON into clamped impact output', () => {
    const parsed = parseRoleJson('finance', '{"impactScore":145,"riskLevel":"high","brief":"Margin pressure.","concerns":["Capital"],"questions":["What changed?"],"metrics":[{"label":"P(ruin)","value":"8.9%","weight":1.7}]}');
    expect(parsed.impactScore).toBe(100);
    expect(parsed.metrics[0].weight).toBe(1);
  });

  it('returns deterministic mock output for offline mode', async () => {
    const result = await runMockRoleAnalysis('operations', state, 'No live key');
    expect(result.roleId).toBe('operations');
    expect(result.brief).toContain('Operations');
    expect(result.simulated).toBe(true);
  });
});
```

- [ ] **Step 3: Run role-analysis test and verify it fails**

Run: `npm test -- src/explainer/roleAnalysis.test.ts`

Expected: FAIL because `src/explainer/roleAnalysis.ts` does not exist.

- [ ] **Step 4: Implement `roleAnalysis.ts`**

Create `src/explainer/roleAnalysis.ts`:

```ts
import { chat } from '../core/cerebras';
import type { RoleImpactMetric, RoleImpactResult, StakeholderRoleId } from './types';
import type { ReasoningState } from './reasoningGraph';

export interface RoleDef {
  id: StakeholderRoleId;
  label: string;
  prompt: string;
}

export interface RolePayload {
  summary: string;
  metrics: string;
  risks: string;
  reasoning: string;
  graph: string;
}

export const ROLE_DEFS: RoleDef[] = [
  { id: 'executive', label: 'Executive', prompt: 'enterprise strategy, decision confidence, capital allocation, and future outlook' },
  { id: 'finance', label: 'Finance', prompt: 'cash flow, capital adequacy, variance, budget exposure, and financial controls' },
  { id: 'risk-compliance', label: 'Risk/Compliance', prompt: 'governance review, model risk, auditability, regulatory lenses, and decision-support boundaries' },
  { id: 'marketing', label: 'Marketing', prompt: 'market demand, customer messaging, campaign risk, pricing narrative, and brand impact' },
  { id: 'hr', label: 'HR', prompt: 'workforce planning, skill gaps, staffing risk, operating capacity, and communication needs' },
  { id: 'operations', label: 'Operations', prompt: 'process capacity, service reliability, implementation risk, vendor load, and handoff timing' },
];

export function buildRolePayload(state: ReasoningState, sessionSummary?: string): RolePayload {
  const metrics = state.data.nodes
    .filter((node) => node.role === 'metric')
    .map((node) => node.label)
    .slice(0, 8)
    .join('\n');
  const risks = state.data.nodes
    .filter((node) => node.role === 'risk-flag')
    .map((node) => node.label)
    .slice(0, 6)
    .join('\n');
  const reasoning = state.beats
    .filter((beat) => beat.text.trim())
    .map((beat) => `${beat.agent}: ${beat.text}`)
    .join('\n')
    .slice(0, 2400);
  const graph = state.data.nodes
    .map((node) => `${node.role}: ${node.label}`)
    .slice(0, 32)
    .join('\n');
  return {
    summary: sessionSummary?.trim() || 'Standalone AugurForge explainer run with no external session summary.',
    metrics: metrics || 'No metric nodes emitted yet.',
    risks: risks || 'No risk flags emitted yet.',
    reasoning: reasoning || 'No completed reasoning beats emitted yet.',
    graph,
  };
}

export async function runRoleAnalysis(roleId: StakeholderRoleId, state: ReasoningState, sessionSummary?: string, signal?: AbortSignal): Promise<RoleImpactResult> {
  const role = roleDef(roleId);
  const payload = buildRolePayload(state, sessionSummary);
  const mockText = JSON.stringify(mockResult(roleId, role.label, payload));
  try {
    const res = await chat({
      messages: [
        {
          role: 'system',
          content:
            'You are AugurForge Stakeholder Explainer. Return strict JSON with impactScore, riskLevel, brief, concerns, questions, and metrics. ' +
            'Use only supplied analysis data. This is decision-support, not advice.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            stakeholder: role.label,
            lens: role.prompt,
            requiredShape: {
              impactScore: 'number 0-100',
              riskLevel: 'low | medium | high | critical',
              brief: '3-5 concise sentences',
              concerns: '3 strings',
              questions: '2-3 strings',
              metrics: 'array of {label,value,weight 0-1}',
            },
            analysis: payload,
          }),
        },
      ],
      temperature: 0.2,
      reasoningEffort: 'low',
      maxTokens: 520,
      signal,
      mock: { text: mockText, json: JSON.parse(mockText) },
    });
    return { ...parseRoleJson(roleId, res.text), simulated: res.simulated };
  } catch (err) {
    return {
      ...mockResult(roleId, role.label, payload),
      error: err instanceof Error ? err.message : 'Role analysis failed',
      simulated: true,
    };
  }
}

export async function runMockRoleAnalysis(roleId: StakeholderRoleId, state: ReasoningState, sessionSummary?: string): Promise<RoleImpactResult> {
  const role = roleDef(roleId);
  return { ...mockResult(roleId, role.label, buildRolePayload(state, sessionSummary)), simulated: true };
}

export function parseRoleJson(roleId: StakeholderRoleId, text: string): RoleImpactResult {
  const role = roleDef(roleId);
  const parsed = parseJsonObject(text);
  return {
    roleId,
    title: role.label,
    impactScore: clampNumber(parsed.impactScore, 0, 100, 50),
    riskLevel: parsed.riskLevel === 'low' || parsed.riskLevel === 'medium' || parsed.riskLevel === 'high' || parsed.riskLevel === 'critical' ? parsed.riskLevel : 'medium',
    brief: cleanString(parsed.brief, `${role.label} should review the scenario before acting on it.`, 520),
    concerns: stringList(parsed.concerns, ['Review the scenario assumptions.', 'Check the metric movement.', 'Document decision-support limits.'], 3),
    questions: stringList(parsed.questions, ['Which assumption changed most?', 'What evidence should be validated next?'], 3),
    metrics: metricList(parsed.metrics),
  };
}

function roleDef(roleId: StakeholderRoleId): RoleDef {
  return ROLE_DEFS.find((role) => role.id === roleId) ?? ROLE_DEFS[0];
}

function mockResult(roleId: StakeholderRoleId, title: string, payload: RolePayload): RoleImpactResult {
  const score = roleId === 'risk-compliance' ? 82 : roleId === 'executive' ? 76 : 68;
  return {
    roleId,
    title,
    impactScore: score,
    riskLevel: score >= 80 ? 'high' : 'medium',
    brief: `${title} view: the current analysis points to material scenario movement that should be reviewed before decisions are made. ${payload.metrics.split('\n')[0] || 'Metrics are still forming.'} This remains decision-support, not advice.`,
    concerns: ['Validate the strongest assumption driver.', 'Check whether the metric movement is acceptable.', 'Document how the conclusion was produced.'],
    questions: ['Which assumption changed the outcome most?', 'What evidence would change this view?'],
    metrics: metricList([{ label: 'Impact', value: String(score), weight: score / 100 }]),
    simulated: true,
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
}

function cleanString(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim().slice(0, max) : fallback;
}

function stringList(value: unknown, fallback: string[], max: number): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((item) => cleanString(item, '', 140)).filter(Boolean).slice(0, max);
  return cleaned.length ? cleaned : fallback;
}

function metricList(value: unknown): RoleImpactMetric[] {
  if (!Array.isArray(value)) return [{ label: 'Impact', value: '50', weight: 0.5 }];
  const metrics = value.slice(0, 4).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      label: cleanString(record.label, 'Impact', 40),
      value: cleanString(record.value, 'n/a', 32),
      weight: clampNumber(record.weight, 0, 1, 0.5),
    };
  });
  return metrics.length ? metrics : [{ label: 'Impact', value: '50', weight: 0.5 }];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}
```

- [ ] **Step 5: Export the role helpers**

Modify `src/explainer/index.ts`:

```ts
export { ROLE_DEFS, buildRolePayload, parseRoleJson, runRoleAnalysis, runMockRoleAnalysis } from './roleAnalysis';
export type { RoleDef, RolePayload } from './roleAnalysis';
```

- [ ] **Step 6: Run role-analysis tests**

Run: `npm test -- src/explainer/roleAnalysis.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/explainer/types.ts src/explainer/roleAnalysis.ts src/explainer/roleAnalysis.test.ts src/explainer/index.ts
git commit -m "feat: add stakeholder role analysis"
```

## Task 3: Selection-Aware Graph And Transcript

**Files:**
- Create: `src/explainer/TranscriptStrip.tsx`
- Modify: `src/explainer/ThinkingGraph.tsx`
- Modify: `src/explainer/CascadeTranscript.tsx`

- [ ] **Step 1: Add graph highlight props**

Modify `src/explainer/ThinkingGraph.tsx` props:

```ts
interface Props {
  data: GraphData;
  width: number;
  height: number;
  variant?: GraphVariant;
  selectedNodeId?: string | null;
  highlightedNodeIds?: string[];
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  onNodeClick?: (id: string) => void;
}
```

Inside `ThinkingGraph`, add:

```ts
const highlighted = useMemo(() => new Set(highlightedNodeIds ?? []), [highlightedNodeIds]);
const hasHighlight = highlighted.size > 0 || !!selectedNodeId;
```

Change `nodeColor`:

```tsx
nodeColor={(n: any) => {
  const node = n as GNode;
  if (node.id === selectedNodeId) return '#ffffff';
  if (hasHighlight && !highlighted.has(node.id)) return '#3b4655';
  return palette[node.role];
}}
```

Change `nodeOpacity`:

```tsx
nodeOpacity={hasHighlight ? 0.86 : 0.95}
```

Change `linkOpacity`:

```tsx
linkOpacity={hasHighlight ? 0.38 : 0.55}
```

- [ ] **Step 2: Create sentence-aware transcript component**

Create `src/explainer/TranscriptStrip.tsx`:

```tsx
import type { GraphVariant, ReasoningBeat, SentenceRef } from './types';
import { CascadeTranscript } from './CascadeTranscript';
import { AGENT_LABEL } from './reasoningGraph';

interface Props {
  beats: ReasoningBeat[];
  sentences: SentenceRef[];
  activeSentenceId: string | null;
  variant: GraphVariant;
  activeAgent: ReasoningBeat['agent'] | null;
  focusedAgent: ReasoningBeat['agent'] | null;
  onAgentSelect: (agent: ReasoningBeat['agent']) => void;
  onSentenceSelect: (sentence: SentenceRef) => void;
}

export function TranscriptStrip({
  beats,
  sentences,
  activeSentenceId,
  variant,
  activeAgent,
  focusedAgent,
  onAgentSelect,
  onSentenceSelect,
}: Props) {
  if (sentences.length === 0) {
    return (
      <CascadeTranscript
        beats={beats}
        activeAgent={activeAgent}
        focusedAgent={focusedAgent}
        variant={variant}
        onSelect={onAgentSelect}
      />
    );
  }

  return (
    <div className={`transcript-strip ${variant}`} aria-label="Clickable reasoning sentences">
      {sentences.map((sentence) => (
        <button
          key={sentence.id}
          type="button"
          className={`transcript-sentence${activeSentenceId === sentence.id ? ' is-active' : ''}`}
          onClick={() => onSentenceSelect(sentence)}
        >
          <span>{AGENT_LABEL[sentence.agent]}</span>
          <strong>{sentence.text}</strong>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Keep `CascadeTranscript` unchanged for embedded panel**

Do not remove `CascadeTranscript`. `ReasoningPanel.tsx` depends on it. The standalone route will use `TranscriptStrip`, and the compact Inspector Trace will continue to use `CascadeTranscript`.

- [ ] **Step 4: Add transcript CSS**

Append to `src/explainer/explainer.css`:

```css
.transcript-strip { display: flex; flex-direction: column; gap: 6px; }
.transcript-sentence { display: grid; grid-template-columns: 88px 1fr; gap: 10px; width: 100%; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #c6d3e4; padding: 7px 8px; text-align: left; cursor: pointer; }
.transcript-sentence:hover { background: rgba(120, 150, 190, 0.10); }
.transcript-sentence.is-active { border-color: rgba(79, 143, 240, 0.58); background: rgba(79, 143, 240, 0.15); }
.transcript-sentence span { color: #9fb3cf; font-size: 11px; font-weight: 700; }
.transcript-sentence strong { color: inherit; font-size: 13px; font-weight: 520; line-height: 1.42; }
```

- [ ] **Step 5: Run affected tests**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/explainer/ThinkingGraph.tsx src/explainer/TranscriptStrip.tsx src/explainer/CascadeTranscript.tsx src/explainer/explainer.css
git commit -m "feat: link explainer graph and transcript selections"
```

## Task 4: Inspector And Role Components

**Files:**
- Create: `src/explainer/GroupInspector.tsx`
- Create: `src/explainer/RoleImpactPanel.tsx`
- Create: `src/explainer/SourceReceiptPanel.tsx`

- [ ] **Step 1: Create group inspector**

Create `src/explainer/GroupInspector.tsx`:

```tsx
import type { GraphData, SentenceRef } from './types';
import type { NodeInspection } from './graphModel';

interface Props {
  inspection: NodeInspection | null;
  sentence: SentenceRef | null;
  data: GraphData;
}

export function GroupInspector({ inspection, sentence, data }: Props) {
  if (sentence) {
    const related = data.nodes.filter((node) => sentence.nodeIds.includes(node.id));
    return (
      <aside className="explainer-inspector" aria-label="Sentence evidence">
        <div className="inspector-eyebrow">Sentence evidence</div>
        <h2>{sentence.text}</h2>
        <p>This sentence is grounded in the highlighted graph nodes and the current deterministic model output.</p>
        <div className="inspector-list">
          {related.map((node) => (
            <div key={node.id} className="inspector-row">
              <span>{node.role}</span>
              <strong>{node.label}</strong>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  if (!inspection) {
    return (
      <aside className="explainer-inspector" aria-label="Graph inspector">
        <div className="inspector-eyebrow">Graph inspector</div>
        <h2>Select a node</h2>
        <p>Click a graph node to inspect its color group, source, connected evidence, and related generated sentences.</p>
      </aside>
    );
  }

  return (
    <aside className="explainer-inspector" aria-label="Graph inspector">
      <div className="inspector-eyebrow">Color group</div>
      <h2>{inspection.group.label}</h2>
      <p>{inspection.group.summary}</p>

      <section>
        <h3>Selected node</h3>
        <div className="inspector-focus">
          <span>{inspection.selected.role}</span>
          <strong>{inspection.selected.label}</strong>
        </div>
      </section>

      <section>
        <h3>Group nodes</h3>
        <div className="inspector-list">
          {inspection.groupNodes.slice(0, 10).map((node) => (
            <div key={node.id} className="inspector-row">
              <span>{node.role}</span>
              <strong>{node.label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Related nodes</h3>
        <div className="inspector-list">
          {inspection.related.slice(0, 8).map((node) => (
            <div key={`${node.relation}:${node.id}`} className="inspector-row">
              <span>{node.relation}</span>
              <strong>{node.label}</strong>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: Create role impact panel**

Create `src/explainer/RoleImpactPanel.tsx`:

```tsx
import type { RoleImpactResult, RoleImpactStatus, StakeholderRoleId } from './types';
import { ROLE_DEFS } from './roleAnalysis';

interface Props {
  activeRole: StakeholderRoleId;
  statuses: Record<StakeholderRoleId, RoleImpactStatus>;
  results: Partial<Record<StakeholderRoleId, RoleImpactResult>>;
  onSelectRole: (roleId: StakeholderRoleId) => void;
}

export function RoleImpactPanel({ activeRole, statuses, results, onSelectRole }: Props) {
  const result = results[activeRole];
  return (
    <section className="role-panel" aria-label="Stakeholder impact analysis">
      <div className="role-tabs" role="tablist" aria-label="Stakeholder perspectives">
        {ROLE_DEFS.map((role) => (
          <button
            key={role.id}
            type="button"
            role="tab"
            aria-selected={activeRole === role.id}
            className={`role-tab${activeRole === role.id ? ' is-active' : ''}`}
            onClick={() => onSelectRole(role.id)}
          >
            {role.label}
            <span>{statuses[role.id]}</span>
          </button>
        ))}
      </div>

      {!result ? (
        <div className="role-empty">Gemma 4 is preparing this stakeholder view.</div>
      ) : (
        <div className="role-impact-card">
          <div className="role-score">
            <strong>{result.impactScore}</strong>
            <span>{result.riskLevel}</span>
          </div>
          <p>{result.brief}</p>
          <div className="role-metrics">
            {result.metrics.map((metric) => (
              <div key={`${metric.label}:${metric.value}`} className="role-metric">
                <div>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
                <i style={{ width: `${Math.round(metric.weight * 100)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Create source receipt panel**

Create `src/explainer/SourceReceiptPanel.tsx`:

```tsx
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';

interface Props {
  session: AugurForgeSessionSnapshot | null;
  mode: 'mock' | 'real';
  onReplaceInput: () => void;
}

export function SourceReceiptPanel({ session, mode, onReplaceInput }: Props) {
  const attachments = session?.input?.attachments ?? [];
  return (
    <aside className="source-receipt" aria-label="Explainer source receipt">
      <div className="inspector-eyebrow">Source</div>
      <h2>{session?.title ?? (mode === 'real' ? 'Live session' : 'Mock cascade')}</h2>
      <p>{session?.latestSummary ?? 'No live main-app session is attached. The standalone explainer can run from its mock cascade.'}</p>
      <div className="source-chips">
        {attachments.slice(0, 4).map((attachment) => (
          <span key={attachment.id}>{attachment.name}</span>
        ))}
      </div>
      <button type="button" className="source-replace" onClick={onReplaceInput}>
        Replace input
      </button>
    </aside>
  );
}
```

- [ ] **Step 4: Add component CSS**

Append to `src/explainer/explainer.css`:

```css
.explainer-inspector,
.source-receipt,
.role-panel { border: 1px solid rgba(28, 38, 52, 0.12); border-radius: 8px; background: rgba(255, 255, 255, 0.82); color: #172033; box-shadow: 0 18px 50px rgba(14, 25, 42, 0.10); }
.explainer-inspector,
.source-receipt { padding: 16px; }
.inspector-eyebrow { color: #5b6b82; font-size: 11px; font-weight: 680; letter-spacing: 0.065em; text-transform: uppercase; }
.explainer-inspector h2,
.source-receipt h2 { margin: 6px 0 8px; font-size: 18px; font-weight: 590; }
.explainer-inspector p,
.source-receipt p { margin: 0 0 14px; color: #536176; font-size: 13px; line-height: 1.45; }
.explainer-inspector h3 { margin: 16px 0 8px; font-size: 12px; font-weight: 680; color: #2f3b4d; }
.inspector-focus,
.inspector-row { display: grid; grid-template-columns: 92px 1fr; gap: 10px; border-top: 1px solid rgba(28, 38, 52, 0.08); padding: 8px 0; }
.inspector-focus span,
.inspector-row span { color: #6b7890; font-size: 11px; }
.inspector-focus strong,
.inspector-row strong { color: #172033; font-size: 12.5px; font-weight: 560; }
.source-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.source-chips span { border: 1px solid rgba(28, 38, 52, 0.12); border-radius: 6px; padding: 4px 7px; color: #38455a; background: #f7f9fc; font-size: 11px; }
.source-replace { border: 1px solid #c8d2e1; border-radius: 8px; background: #fff; color: #172033; padding: 7px 10px; font-weight: 650; cursor: pointer; }
.role-panel { padding: 12px; }
.role-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.role-tab { border: 1px solid #d7e0ed; border-radius: 8px; background: #f8fafc; color: #344156; padding: 7px; font-size: 11px; font-weight: 650; text-align: left; cursor: pointer; }
.role-tab.is-active { border-color: #4f8ff0; background: #eef5ff; color: #12345f; }
.role-tab span { display: block; color: #76859a; font-size: 10px; font-weight: 560; margin-top: 2px; }
.role-empty { color: #68778e; font-size: 13px; padding: 14px 4px; }
.role-impact-card { display: grid; gap: 10px; margin-top: 12px; }
.role-score { display: flex; align-items: baseline; gap: 10px; }
.role-score strong { color: #172033; font-size: 32px; font-weight: 690; }
.role-score span { color: #5f6f86; font-size: 12px; text-transform: capitalize; }
.role-impact-card p { margin: 0; color: #354157; font-size: 13px; line-height: 1.45; }
.role-metrics { display: grid; gap: 8px; }
.role-metric { display: grid; gap: 5px; }
.role-metric div { display: flex; justify-content: space-between; gap: 10px; color: #59687e; font-size: 11px; }
.role-metric strong { color: #172033; }
.role-metric i { display: block; height: 5px; max-width: 100%; border-radius: 999px; background: #4f8ff0; }
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/explainer/GroupInspector.tsx src/explainer/RoleImpactPanel.tsx src/explainer/SourceReceiptPanel.tsx src/explainer/explainer.css
git commit -m "feat: add explainer inspector and role panels"
```

## Task 5: Standalone Workbench Orchestration

**Files:**
- Create: `src/explainer/ExplainerWorkbench.tsx`
- Modify: `src/explainer/DepthExplainer.tsx`
- Modify: `src/explainer/explainer.css`
- Modify: `src/explainer/index.ts`

- [ ] **Step 1: Create workbench component**

Create `src/explainer/ExplainerWorkbench.tsx`:

```tsx
import { useMemo } from 'react';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import { inspectNode, nodeIdsForSentence, sentenceRefsFromState } from './graphModel';
import type { Depth } from './liveSource';
import type { EventSource } from './eventSource';
import type {
  AgentId,
  GraphSelection,
  ReasoningBeat,
  RoleImpactResult,
  RoleImpactStatus,
  SentenceRef,
  StakeholderRoleId,
} from './types';
import type { ReasoningState } from './reasoningGraph';
import { ThinkingGraph } from './ThinkingGraph';
import { GroupInspector } from './GroupInspector';
import { RoleImpactPanel } from './RoleImpactPanel';
import { SourceReceiptPanel } from './SourceReceiptPanel';
import { TranscriptStrip } from './TranscriptStrip';

interface Props {
  state: ReasoningState;
  latest: { ttftMs?: number; tokensPerSec?: number };
  started: boolean;
  mode: 'mock' | 'real';
  depth: Depth;
  session: AugurForgeSessionSnapshot | null;
  size: { w: number; h: number };
  graphRef: React.RefObject<HTMLDivElement>;
  source?: EventSource;
  selected: GraphSelection;
  activeRole: StakeholderRoleId;
  roleStatuses: Record<StakeholderRoleId, RoleImpactStatus>;
  roleResults: Partial<Record<StakeholderRoleId, RoleImpactResult>>;
  recorderSupported: boolean;
  recording: boolean;
  onCanvas: (canvas: HTMLCanvasElement | null) => void;
  onRun: () => void;
  onSetMode: (mode: 'mock' | 'real') => void;
  onSetDepth: (depth: Depth) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectAgent: (agent: AgentId) => void;
  onSelectSentence: (sentence: SentenceRef) => void;
  onSelectRole: (role: StakeholderRoleId) => void;
  onToggleRecording: () => void;
}

export function ExplainerWorkbench(props: Props) {
  const sentences = useMemo(() => sentenceRefsFromState(props.state.data, props.state.beats), [props.state]);
  const activeSentence = sentences.find((sentence) => sentence.id === props.selected.sentenceId) ?? null;
  const inspection = useMemo(
    () => inspectNode(props.state.data, props.state.beats, props.selected.nodeId),
    [props.state, props.selected.nodeId],
  );
  const highlighted = activeSentence ? nodeIdsForSentence(props.state.data, activeSentence) : inspection?.related.map((node) => node.id) ?? [];

  return (
    <div className="explainer-workbench">
      <header className="explainer-topbar">
        <div>
          <span>AugurForge Explainer</span>
          <strong>Gemma 4 reasoning graph</strong>
        </div>
        <div className="explainer-topbar-actions">
          {!props.source && (
            <div className="explainer-seg light" role="group" aria-label="Source">
              <button type="button" className={`explainer-seg-btn${props.mode === 'mock' ? ' is-active' : ''}`} onClick={() => props.onSetMode('mock')}>Mock</button>
              <button type="button" className={`explainer-seg-btn${props.mode === 'real' ? ' is-active' : ''}`} onClick={() => props.onSetMode('real')}>Live</button>
            </div>
          )}
          <div className="explainer-seg light" role="group" aria-label="Depth">
            <button type="button" className={`explainer-seg-btn${props.depth === 'entry' ? ' is-active' : ''}`} onClick={() => props.onSetDepth('entry')}>Entry</button>
            <button type="button" className={`explainer-seg-btn${props.depth === 'expert' ? ' is-active' : ''}`} onClick={() => props.onSetDepth('expert')}>Expert</button>
          </div>
          <button type="button" className="source-replace" onClick={props.onRun}>{props.started ? 'Replay' : 'Run'}</button>
        </div>
      </header>

      <main className="explainer-layout">
        <section className="explainer-left">
          <SourceReceiptPanel session={props.session} mode={props.mode} onReplaceInput={props.onRun} />
        </section>

        <section className="explainer-center">
          <div className="graph-stage" ref={props.graphRef}>
            <ThinkingGraph
              data={props.state.data}
              width={props.size.w}
              height={props.size.h}
              variant="showcase"
              selectedNodeId={props.selected.nodeId}
              highlightedNodeIds={highlighted}
              onCanvas={props.onCanvas}
              onNodeClick={props.onSelectNode}
            />
          </div>
          <div className="explainer-statusbar">
            <span className="explainer-badge">Gemma 4 · Cerebras</span>
            <span>TTFT {props.latest.ttftMs != null ? `${props.latest.ttftMs} ms` : '—'}</span>
            <span>{props.latest.tokensPerSec != null ? `${Math.round(props.latest.tokensPerSec)} tok/s` : 'tokens/s pending'}</span>
            <span>{props.state.data.nodes.length} nodes</span>
            <button type="button" className={`explainer-record${props.recording ? ' is-recording' : ''}`} disabled={!props.recorderSupported} onClick={props.onToggleRecording}>
              {props.recording ? 'Stop' : 'Record'}
            </button>
          </div>
          <div className="explainer-transcript-panel">
            <TranscriptStrip
              beats={props.state.beats}
              sentences={sentences}
              activeSentenceId={props.selected.sentenceId}
              variant="showcase"
              activeAgent={props.state.active}
              focusedAgent={inspection ? props.onSelectAgent && null : null}
              onAgentSelect={props.onSelectAgent}
              onSentenceSelect={props.onSelectSentence}
            />
          </div>
        </section>

        <section className="explainer-right">
          <GroupInspector inspection={inspection} sentence={activeSentence} data={props.state.data} />
          <RoleImpactPanel activeRole={props.activeRole} statuses={props.roleStatuses} results={props.roleResults} onSelectRole={props.onSelectRole} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Fix the focused agent prop before typecheck**

In `ExplainerWorkbench.tsx`, replace the `focusedAgent` line with:

```tsx
focusedAgent={null}
```

This keeps the first workbench slice simple because sentence and node highlighting are now handled through graph selection.

- [ ] **Step 3: Refactor `DepthExplainer` to render workbench**

Modify imports in `src/explainer/DepthExplainer.tsx`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExplainerWorkbench } from './ExplainerWorkbench';
import { ROLE_DEFS, runMockRoleAnalysis, runRoleAnalysis } from './roleAnalysis';
import type { AgentId, GraphSelection, RoleImpactResult, RoleImpactStatus, SentenceRef, StakeholderRoleId } from './types';
```

Remove direct imports of `ThinkingGraph`, `CascadeTranscript`, and `agentForNode`.

Add state inside `DepthExplainer`:

```ts
const [selected, setSelected] = useState<GraphSelection>({ nodeId: null, sentenceId: null });
const [activeRole, setActiveRole] = useState<StakeholderRoleId>('executive');
const [roleStatuses, setRoleStatuses] = useState<Record<StakeholderRoleId, RoleImpactStatus>>(() =>
  Object.fromEntries(ROLE_DEFS.map((role) => [role.id, 'idle'])) as Record<StakeholderRoleId, RoleImpactStatus>,
);
const [roleResults, setRoleResults] = useState<Partial<Record<StakeholderRoleId, RoleImpactResult>>>({});
const [runId, setRunId] = useState(0);
```

Update `run()`:

```ts
setSelected({ nodeId: null, sentenceId: null });
setRoleResults({});
setRoleStatuses(Object.fromEntries(ROLE_DEFS.map((role) => [role.id, 'idle'])) as Record<StakeholderRoleId, RoleImpactStatus>);
setRunId((id) => id + 1);
```

Add selection callbacks:

```ts
const selectNode = useCallback((nodeId: string) => {
  setSelected({ nodeId, sentenceId: null });
}, []);

const selectAgent = useCallback((agent: AgentId) => {
  setSelected({ nodeId: agent, sentenceId: null });
}, []);

const selectSentence = useCallback((sentence: SentenceRef) => {
  setSelected({ nodeId: null, sentenceId: sentence.id });
}, []);
```

Add role preload effect:

```ts
const roleSessionSummary = useMemo(() => {
  const parts = [
    session?.title,
    session?.latestSummary,
    ...(session?.metrics ?? []).map((metric) => `${metric.label}: ${metric.value}`),
  ].filter((part): part is string => Boolean(part));
  return parts.join('\n');
}, [session]);

useEffect(() => {
  const explainerDone = state.beats.some((beat) => beat.agent === 'explainer' && beat.status === 'done');
  if (!explainerDone) return;
  let cancelled = false;
  const queue = async () => {
    for (const role of ROLE_DEFS) {
      if (cancelled) return;
      setRoleStatuses((prev) => ({ ...prev, [role.id]: 'loading' }));
      const result = mode === 'real'
        ? await runRoleAnalysis(role.id, state, roleSessionSummary)
        : await runMockRoleAnalysis(role.id, state, roleSessionSummary);
      if (cancelled) return;
      setRoleResults((prev) => ({ ...prev, [role.id]: result }));
      setRoleStatuses((prev) => ({ ...prev, [role.id]: result.error ? 'error' : 'done' }));
    }
  };
  queue();
  return () => {
    cancelled = true;
  };
}, [runId, state.beats, mode, roleSessionSummary]);
```

Replace the existing JSX return with:

```tsx
return (
  <ExplainerWorkbench
    state={state}
    latest={latest}
    started={started}
    mode={mode}
    depth={depth}
    session={session}
    size={size}
    graphRef={wrapRef}
    source={source}
    selected={selected}
    activeRole={activeRole}
    roleStatuses={roleStatuses}
    roleResults={roleResults}
    recorderSupported={recorder.supported}
    recording={recorder.recording}
    onCanvas={onCanvas}
    onRun={run}
    onSetMode={setMode}
    onSetDepth={setDepth}
    onSelectNode={selectNode}
    onSelectAgent={selectAgent}
    onSelectSentence={selectSentence}
    onSelectRole={setActiveRole}
    onToggleRecording={toggleRecording}
  />
);
```

- [ ] **Step 4: Add workbench layout CSS**

Replace the top of `src/explainer/explainer.css` through `.explainer-caption` with:

```css
.explainer-root { width: 100%; height: 100%; background: #edf2f7; overflow: hidden; font-family: "Geist Variable", "Avenir Next", "SF Pro Display", ui-sans-serif, system-ui, sans-serif; color: #172033; }
.explainer-workbench { min-height: 100%; display: grid; grid-template-rows: 58px 1fr; background: radial-gradient(circle at 50% 10%, rgba(79,143,240,0.08), transparent 34%), #edf2f7; }
.explainer-topbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-bottom: 1px solid rgba(28, 38, 52, 0.10); background: rgba(255,255,255,0.72); backdrop-filter: blur(12px); }
.explainer-topbar div:first-child { display: grid; gap: 2px; }
.explainer-topbar span { color: #65748b; font-size: 11px; font-weight: 680; letter-spacing: 0.065em; text-transform: uppercase; }
.explainer-topbar strong { color: #172033; font-size: 17px; font-weight: 590; letter-spacing: 0; }
.explainer-topbar-actions { display: flex; align-items: center; gap: 10px; }
.explainer-layout { min-height: 0; display: grid; grid-template-columns: 230px minmax(420px, 1fr) 340px; gap: 14px; padding: 14px; }
.explainer-left,
.explainer-center,
.explainer-right { min-height: 0; }
.explainer-left,
.explainer-right { display: flex; flex-direction: column; gap: 12px; }
.explainer-center { display: grid; min-width: 0; grid-template-rows: minmax(320px, 1fr) auto 190px; gap: 10px; }
.graph-stage { position: relative; min-height: 320px; border-radius: 8px; overflow: hidden; background: #101723; border: 1px solid rgba(28, 38, 52, 0.18); box-shadow: 0 24px 80px rgba(11, 20, 34, 0.22); }
.explainer-statusbar { display: flex; align-items: center; gap: 12px; color: #65748b; font-size: 12px; font-variant-numeric: tabular-nums; }
.explainer-transcript-panel { overflow: auto; border: 1px solid rgba(28, 38, 52, 0.12); border-radius: 8px; padding: 10px; background: rgba(15, 23, 35, 0.92); color: #dce7f5; }
.explainer-badge { font-size: 11px; font-weight: 700; color: #04121f; background: #4f8ff0; padding: 3px 11px; border-radius: 999px; }
.explainer-seg { display: inline-flex; border: 1px solid #2b4a6f; border-radius: 8px; overflow: hidden; background: rgba(11,19,34,0.78); backdrop-filter: blur(6px); }
.explainer-seg.light { border-color: #cbd6e5; background: rgba(255,255,255,0.78); }
.explainer-seg-btn { border: 0; background: transparent; color: #65748b; font-size: 12px; font-weight: 650; padding: 6px 12px; cursor: pointer; }
.explainer-seg-btn + .explainer-seg-btn { border-left: 1px solid rgba(28,38,52,0.12); }
.explainer-seg-btn.is-active { background: #4f8ff0; color: #04121f; }
.explainer-record { border: 1px solid #c8d2e1; border-radius: 8px; background: #fff; color: #172033; font-size: 12px; font-weight: 650; padding: 7px 10px; cursor: pointer; }
.explainer-record.is-recording { border-color: #fb7185; color: #b42342; }
@media (max-width: 1040px) { .explainer-layout { grid-template-columns: 1fr; overflow: auto; } .explainer-center { min-height: 720px; } }
```

- [ ] **Step 5: Export workbench**

Modify `src/explainer/index.ts`:

```ts
export { ExplainerWorkbench } from './ExplainerWorkbench';
export { GroupInspector } from './GroupInspector';
export { RoleImpactPanel } from './RoleImpactPanel';
export { SourceReceiptPanel } from './SourceReceiptPanel';
export { TranscriptStrip } from './TranscriptStrip';
```

- [ ] **Step 6: Run compile checks**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/explainer/ExplainerWorkbench.tsx src/explainer/DepthExplainer.tsx src/explainer/explainer.css src/explainer/index.ts
git commit -m "feat: build standalone explainer workbench"
```

## Task 6: Final Verification And Graph Update

**Files:**
- Modify only if a verification failure points to a specific explainer file.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/explainer/reasoningGraph.test.ts src/explainer/graphModel.test.ts src/explainer/roleAnalysis.test.ts
```

Expected: PASS for all explainer tests.

- [ ] **Step 2: Run full typecheck and tests**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 3: Build standalone explainer**

Run:

```bash
npm run build:explainer
```

Expected: PASS. A large chunk warning is acceptable because the existing 3D graph bundle is large.

- [ ] **Step 4: Verify mock route in browser**

Use the in-app browser on `http://127.0.0.1:5173/explainer.html`.

Checks:

- Page title is `AugurForge — Gemma Thinking Graph`.
- Mock mode is selected on first load.
- Canvas count is `1`.
- Topbar, source receipt, dark graph stage, right inspector, role panel, and transcript are visible.
- Console `error` and `warn` logs are empty for the explainer route.
- Clicking a graph node opens a color-group inspector.
- Clicking a transcript sentence highlights graph nodes and opens sentence evidence.

- [ ] **Step 5: Verify live route when proxy and key are available**

Run the live stack if it is not already running:

```bash
npm run server
VITE_USE_LIVE=true npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --force
```

Browser checks:

- Select `Live`.
- Main graph reaches more than 20 nodes.
- Transcript has no ellipsis-only rows.
- Six role tabs move through `loading` and either `done` or isolated `error`.
- A failed role tab does not blank the graph.

- [ ] **Step 6: Update Graphify**

Run:

```bash
graphify update .
```

Expected: `graph.json`, `graph.html`, and `GRAPH_REPORT.md` updated in `graphify-out`.

- [ ] **Step 7: Commit verification fixes**

If Step 4 or Step 5 required code fixes:

```bash
git add src/explainer
git commit -m "fix: verify standalone explainer workbench"
```

If no code fixes were required, do not create an empty commit.

