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

const AGENTS: AgentId[] = ['orchestrator', 'modeler', 'visualizer', 'sensitivity', 'risk', 'explainer'];

function isAgentId(value: string): value is AgentId {
  return (AGENTS as string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: unknown, max = 180): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function formatValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return cleanText(value, 56);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

function slug(value: string): string {
  const out = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
  return out || 'item';
}

function sentenceParts(text: unknown, max = 4): string[] {
  const cleaned = cleanText(text, 720);
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((part) => cleanText(part, 120))
    .filter((part): part is string => !!part)
    .slice(0, max);
}

function firstEntries(value: unknown, max = 6): Array<[string, unknown]> {
  return isRecord(value) ? Object.entries(value).slice(0, max) : [];
}

function resultSummary(agent: AgentId, result: unknown): string {
  const r = isRecord(result) ? result : undefined;
  if (!r) return `${AGENT_LABEL[agent]} finished.`;

  if (agent === 'orchestrator') {
    const template = cleanText(r.templateId, 48) ?? 'model';
    const notes = cleanText(r.notes, 160);
    const intent = cleanText(r.intent, 120);
    return notes ? `Routed to ${template}: ${notes}` : `Routed request to ${template}${intent ? ` for ${intent}` : ''}.`;
  }

  if (agent === 'modeler') {
    const template = cleanText(r.templateId, 48) ?? 'model';
    const params = firstEntries(r.params, 4)
      .map(([key, value]) => {
        const formatted = formatValue(value);
        return formatted ? `${key}=${formatted}` : key;
      })
      .join(', ');
    const mapping = firstEntries(r.mapping, 1)
      .map(([, value]) => cleanText(value, 110))
      .find(Boolean);
    return `Mapped inputs to ${template}${params ? ` with ${params}` : ''}.${mapping ? ` ${mapping}` : ''}`;
  }

  if (agent === 'visualizer') {
    const title = cleanText(r.title, 80) ?? cleanText(r.templateId, 48) ?? 'dashboard';
    const views = Array.isArray(r.views) ? r.views.filter((v) => typeof v === 'string').join('/') : '';
    const explainer = isRecord(r.explainer) ? cleanText(r.explainer.entry, 140) : undefined;
    return `Designed ${title}${views ? ` with ${views} view${views.includes('/') ? 's' : ''}` : ''}.${explainer ? ` ${explainer}` : ''}`;
  }

  if (agent === 'risk') {
    const flags = Array.isArray(r.flags)
      ? r.flags
          .slice(0, 2)
          .map((flag) => (isRecord(flag) ? cleanText(flag.text, 120) : undefined))
          .filter((text): text is string => !!text)
      : [];
    return flags.length ? flags.join(' ') : 'Risk scan returned no material flags.';
  }

  const text = cleanText(r.text, 260);
  return text ?? `${AGENT_LABEL[agent]} finished.`;
}

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
  if (d.nodes.some((x) => x.id === source) && !d.links.some((l) => endpointId(l.source) === source && endpointId(l.target) === target)) {
    d.links.push({ source, target });
  }
}

function endpointId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
}

function ensureAgentNode(d: GraphData, agent: AgentId, now: number, pulse: boolean): void {
  ensureNode(d, { id: agent, label: AGENT_LABEL[agent], role: agent, color: ROLE_COLOR[agent], size: 11, bornAt: now, pulse });
  const node = d.nodes.find((x) => x.id === agent);
  if (node) node.pulse = pulse;
  ensureLink(d, d.nodes.some((x) => x.id === UPSTREAM[agent]) ? UPSTREAM[agent] : 'input', agent);
}

export function applyEvent(s: ReasoningState, e: AgentEvent, now: number): ReasoningState {
  if (!isAgentId(e.agent)) return s;

  const d: GraphData = { nodes: s.data.nodes.slice(), links: s.data.links.slice() };
  const captions = { ...s.captions };
  const beats = s.beats.slice();
  let active = s.active;
  const agent = e.agent;

  const upsertBeat = (text: string, status: ReasoningBeat['status']) => {
    const i = beats.findIndex((b) => b.agent === agent);
    if (i === -1) beats.push({ agent, text, status });
    else beats[i] = { agent, text, status };
  };

  if (e.status === 'start') {
    ensureAgentNode(d, agent, now, true);
    captions[agent] = '';
    upsertBeat('', 'streaming');
    active = agent;
  } else if (e.status === 'token') {
    ensureAgentNode(d, agent, now, true);
    const text = (captions[agent] ?? '') + (e.delta ?? '');
    captions[agent] = text;
    upsertBeat(text, 'streaming');
  } else if (e.status === 'done') {
    ensureAgentNode(d, agent, now, false);
    const text = cleanText(captions[agent], 900) ?? resultSummary(agent, e.result);
    captions[agent] = text;
    upsertBeat(text, 'done');
    spawnChildren(d, agent, e, now);
    if (active === agent) active = null;
  } else if (e.status === 'error') {
    ensureAgentNode(d, agent, now, false);
    const msg = e.error ?? 'Agent failed';
    upsertBeat(captions[agent] ? captions[agent] : msg, 'error');
    if (active === agent) active = null;
  }
  return { data: d, beats, captions, active };
}

function spawnChildren(d: GraphData, agent: AgentId, e: AgentEvent, now: number): void {
  // result is `unknown` per the contract; narrow loosely (mock + live both pass through here).
  const r = isRecord(e.result) ? e.result : undefined;
  const child = (id: string, label: string, role: GNode['role'], size: number, parent: string = agent) => {
    ensureNode(d, { id, label: cleanText(label, 64) ?? label, role, color: ROLE_COLOR[role], size, bornAt: now, pulse: false });
    ensureLink(d, parent, id);
  };
  if ((agent === 'explainer' || agent === 'sensitivity')) {
    child(`insight:${agent}`, agent === 'explainer' ? 'Explanation' : 'Sensitivity', 'insight', 7);
  }
  if (!r) return;
  if (agent === 'orchestrator' && typeof r.templateId === 'string') {
    child(`model:${r.templateId}`, r.templateId, 'model', 9);
    const intent = cleanText(r.intent, 54);
    if (intent) child(`driver:orchestrator:intent`, intent, 'driver', 6);
    const notes = cleanText(r.notes, 60);
    if (notes) child(`evidence:orchestrator:notes`, notes, 'evidence', 5);
  }
  if (agent === 'modeler') {
    if (typeof r.templateId === 'string') child(`model:${r.templateId}`, r.templateId, 'model', 8);
    firstEntries(r.params).forEach(([key, value]) => {
      const formatted = formatValue(value);
      child(`param:${slug(key)}`, formatted ? `${key}: ${formatted}` : key, 'param', 6);
    });
    firstEntries(r.mapping, 5).forEach(([key, value]) => {
      const label = cleanText(value, 60);
      if (label) child(`evidence:modeler:${slug(key)}`, label, 'evidence', 5);
    });
  }
  if (agent === 'visualizer') {
    if (typeof r.templateId === 'string') child(`model:${r.templateId}`, r.templateId, 'model', 7);
    if (Array.isArray(r.views)) {
      r.views
        .filter((view): view is string => typeof view === 'string')
        .slice(0, 3)
        .forEach((view) => child(`driver:visualizer:view-${slug(view)}`, `${view} view`, 'driver', 5));
    }
    const explainer = isRecord(r.explainer) ? r.explainer : undefined;
    const entry = cleanText(explainer?.entry, 62);
    const expert = cleanText(explainer?.expert, 62);
    if (entry) child('insight:visualizer:entry', entry, 'insight', 5);
    if (expert) child('insight:visualizer:expert', expert, 'insight', 5);
  }
  if (agent === 'risk' && Array.isArray(r.flags)) {
    r.flags.slice(0, 4).forEach((flag, i) => {
      if (!isRecord(flag)) return;
      const level = cleanText(flag.level, 16) ?? 'flag';
      const text = cleanText(flag.text, 58);
      const riskId = `risk:${i}`;
      child(riskId, text ? `${level}: ${text}` : level, 'risk-flag', 6);
      const ref = cleanText(flag.ref, 50);
      if (ref) child(`evidence:risk:${i}`, ref, 'evidence', 4.5, riskId);
    });
  }
  if (agent === 'sensitivity' || agent === 'explainer') {
    if (Array.isArray(r.metrics)) {
      r.metrics.slice(0, 5).forEach((metric, i) => {
        if (!isRecord(metric)) return;
        const id = cleanText(metric.id, 36) ?? String(i);
        const label = cleanText(metric.label, 34) ?? id;
        const value = cleanText(metric.value, 24);
        child(`metric:${agent}:${slug(id)}`, value ? `${label}: ${value}` : label, 'metric', 5, `insight:${agent}`);
      });
    }
    sentenceParts(r.text, agent === 'explainer' ? 4 : 3).forEach((sentence, i) => {
      child(`insight:${agent}:${i}`, sentence, 'insight', 5.5, `insight:${agent}`);
    });
  }
}

/** Resolve a graph node id to the agent that owns it (for transcript focus). */
export function agentForNode(id: string): AgentId | null {
  if (isAgentId(id)) return id;
  if (id.startsWith('model:')) return 'orchestrator';
  if (id.startsWith('param:')) return 'modeler';
  if (id.startsWith('risk:')) return 'risk';
  const owner = id.split(':')[1];
  if (
    (id.startsWith('insight:') || id.startsWith('driver:') || id.startsWith('evidence:') || id.startsWith('metric:')) &&
    owner &&
    isAgentId(owner)
  ) {
    return owner;
  }
  return null;
}
