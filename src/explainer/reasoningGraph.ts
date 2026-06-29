/**
 * reasoningGraph.ts — pure reducer: stream of AgentEvents -> growing {nodes, links}. [OWNER: B / explainer]
 * Render-on-resolve: each agent paints a node as it starts; concept children spawn on done.
 * Node objects are REUSED across updates (slice keeps refs) so the force sim preserves positions.
 */
import type { AgentEvent, AgentId, GraphData, GNode, ReasoningBeat } from './types';
import { ROLE_COLOR } from './types';

export const AGENT_LABEL: Record<AgentId, string> = {
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
  beats: ReasoningBeat[];
  captions: Record<string, string>;
  active: AgentId | null;
}

export function initReasoning(now: number): ReasoningState {
  return {
    data: {
      nodes: [{ id: 'input', label: 'Your model', role: 'input', color: ROLE_COLOR.input, size: 9, bornAt: now, pulse: false }],
      links: [],
    },
    beats: [],
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
  const beats = s.beats.slice();
  let active = s.active;
  const agent = e.agent as AgentId;

  const upsertBeat = (text: string, status: ReasoningBeat['status']) => {
    const i = beats.findIndex((b) => b.agent === agent);
    if (i === -1) beats.push({ agent, text, status });
    else beats[i] = { agent, text, status };
  };

  if (e.status === 'start') {
    ensureNode(d, { id: agent, label: AGENT_LABEL[agent], role: agent, color: ROLE_COLOR[agent], size: 11, bornAt: now, pulse: true });
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = true;
    ensureLink(d, UPSTREAM[agent], agent);
    captions[agent] = '';
    upsertBeat('', 'streaming');
    active = agent;
  } else if (e.status === 'token') {
    const text = (captions[agent] ?? '') + (e.delta ?? '');
    captions[agent] = text;
    upsertBeat(text, 'streaming');
  } else if (e.status === 'done') {
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = false;
    upsertBeat(captions[agent] ?? '', 'done');
    spawnChildren(d, agent, e, now);
    if (active === agent) active = null;
  } else if (e.status === 'error') {
    const node = d.nodes.find((x) => x.id === agent);
    if (node) node.pulse = false;
    const msg = e.error ?? 'Agent failed';
    upsertBeat(captions[agent] ? captions[agent] : msg, 'error');
    if (active === agent) active = null;
  }
  return { data: d, beats, captions, active };
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

/** Resolve a graph node id to the agent that owns it (for transcript focus). */
export function agentForNode(id: string): AgentId | null {
  const agents: AgentId[] = ['orchestrator', 'modeler', 'visualizer', 'sensitivity', 'risk', 'explainer'];
  if ((agents as string[]).includes(id)) return id as AgentId;
  if (id.startsWith('model:')) return 'orchestrator';
  if (id.startsWith('param:')) return 'modeler';
  if (id.startsWith('risk:')) return 'risk';
  if (id === 'insight:explainer') return 'explainer';
  if (id === 'insight:sensitivity') return 'sensitivity';
  return null;
}