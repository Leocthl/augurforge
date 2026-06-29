/**
 * reasoningGraph.ts — pure reducer: stream of AgentEvents -> growing {nodes, links}. [OWNER: B / explainer]
 * Render-on-resolve: each agent paints a node as it starts; concept children spawn on done.
 * Node objects are REUSED across updates (slice keeps refs) so the force sim preserves positions.
 */
import type { AgentEvent, AgentId, GraphData, GNode } from './types';
import { ROLE_COLOR } from './types';

const AGENT_LABEL: Record<AgentId, string> = {
  orchestrator: 'Orchestrator',
  modeler: 'Modeler',
  visualizer: 'Visualizer',
  sensitivity: 'Sensitivity',
  risk: 'Risk',
  explainer: 'Explainer',
};

/** Who each agent visually descends from (the reasoning flow). */
const UPSTREAM: Record<AgentId, string> = {
  orchestrator: 'input',
  modeler: 'orchestrator',
  visualizer: 'modeler',
  sensitivity: 'visualizer',
  risk: 'visualizer',
  explainer: 'visualizer',
};

export interface ReasoningState {
  data: GraphData;
  captions: Record<string, string>;
  active: AgentId | null;
}

export function initReasoning(now: number): ReasoningState {
  return {
    data: {
      nodes: [{ id: 'input', label: 'Your model', role: 'input', color: ROLE_COLOR.input, size: 9, bornAt: now, pulse: false }],
      links: [],
    },
    captions: {},
    active: null,
  };
}

function ensureNode(d: GraphData, n: GNode): void {
  if (!d.nodes.some((x) => x.id === n.id)) d.nodes.push(n);
}
function ensureLink(d: GraphData, source: string, target: string): void {
  if (d.nodes.some((x) => x.id === source) && !d.links.some((l) => l.source === source && l.target === target)) {
    d.links.push({ source, target });
  }
}

export function applyEvent(s: ReasoningState, e: AgentEvent, now: number): ReasoningState {
  const d: GraphData = { nodes: s.data.nodes.slice(), links: s.data.links.slice() };
  const captions = { ...s.captions };
  let active = s.active;
  const agent = e.agent as AgentId;

  if (e.status === 'start') {
    ensureNode(d, { id: agent, label: AGENT_LABEL[agent], role: agent, color: ROLE_COLOR[agent], size: 11, bornAt: now, pulse: true });
    ensureLink(d, UPSTREAM[agent], agent);
    captions[agent] = '';
    active = agent;
  } else if (e.status === 'token') {
    captions[agent] = (captions[agent] ?? '') + (e.delta ?? '');
  } else if (e.status === 'done') {
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = false;
    spawnChildren(d, agent, e, now);
    if (active === agent) active = null;
  }
  return { data: d, captions, active };
}

function spawnChildren(d: GraphData, agent: AgentId, e: AgentEvent, now: number): void {
  // result is `unknown` per the contract; narrow loosely (mock + live both pass through here).
  const r = e.result as Record<string, unknown> | undefined;
  if (!r) return;
  const child = (id: string, label: string, role: GNode['role'], size: number) => {
    ensureNode(d, { id, label, role, color: ROLE_COLOR[role], size, bornAt: now, pulse: false });
    ensureLink(d, agent, id);
  };
  if (agent === 'orchestrator' && typeof r.templateId === 'string') {
    child(`model:${r.templateId}`, r.templateId, 'model', 9);
  }
  if (agent === 'modeler' && r.params && typeof r.params === 'object') {
    Object.keys(r.params as object).slice(0, 6).forEach((k) => child(`param:${k}`, k, 'param', 6));
  }
  if (agent === 'risk' && Array.isArray(r.flags)) {
    (r.flags as Array<{ level?: string }>).slice(0, 4).forEach((f, i) => child(`risk:${i}`, f.level ?? 'flag', 'risk-flag', 6));
  }
  if (agent === 'explainer' || agent === 'sensitivity') {
    child(`insight:${agent}`, agent === 'explainer' ? 'Explanation' : 'Sensitivity', 'insight', 7);
  }
}