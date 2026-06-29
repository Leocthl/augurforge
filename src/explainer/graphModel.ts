import type {
  AgentId,
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
  return allGraphGroups().find((group) => group.roles.includes(role)) ?? GROUPS.evidence;
}

export function inspectNode(data: GraphData, beats: ReasoningBeat[], nodeId: string | null): NodeInspection | null {
  if (!nodeId) return null;

  const selected = data.nodes.find((node) => node.id === nodeId);
  if (!selected) return null;

  const group = groupForRole(selected.role);
  const groupNodes = data.nodes.filter((node) => groupForRole(node.role).id === group.id);
  const sentences = sentenceRefsFromState(data, beats).filter((sentence) => nodeIdsForSentence(data, sentence).includes(nodeId));

  return {
    group,
    selected,
    groupNodes,
    related: relatedNodes(data, selected, group.id, sentences),
    sentences,
  };
}

export function sentenceRefsFromState(data: GraphData, beats: ReasoningBeat[]): SentenceRef[] {
  return beats.flatMap((beat) =>
    splitSentences(beat.text).map((text, index) => ({
      id: `${beat.agent}:${index}`,
      agent: beat.agent,
      text,
      nodeIds: relatedNodeIdsForSentence(data, beat.agent, index),
    })),
  );
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
  const related = new Map<string, RelatedNode>();
  related.set(selected.id, {
    id: selected.id,
    label: selected.label,
    role: selected.role,
    relation: 'selected',
  });

  for (const link of data.links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (source === selected.id && target) pushRelated(data, related, target, 'downstream');
    if (target === selected.id && source) pushRelated(data, related, source, 'upstream');
  }

  for (const node of data.nodes) {
    if (node.id !== selected.id && groupForRole(node.role).id === groupId) {
      pushRelated(data, related, node.id, 'same-group');
    }
  }

  for (const id of sentences.flatMap((sentence) => nodeIdsForSentence(data, sentence))) {
    pushRelated(data, related, id, 'sentence-evidence');
  }

  return Array.from(related.values());
}

function pushRelated(
  data: GraphData,
  related: Map<string, RelatedNode>,
  id: string,
  relation: RelatedNode['relation'],
): void {
  if (related.has(id)) return;

  const node = data.nodes.find((candidate) => candidate.id === id);
  if (!node) return;

  related.set(id, {
    id: node.id,
    label: node.label,
    role: node.role,
    relation,
  });
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function relatedNodeIdsForSentence(data: GraphData, agent: AgentId, index: number): string[] {
  const ids = new Set<string>();
  const insightId = `insight:${agent}:${index}`;

  addExisting(data, ids, agent);
  addExisting(data, ids, insightId);
  addExisting(data, ids, `insight:${agent}`);

  for (const node of data.nodes) {
    if (node.id.startsWith(`metric:${agent}:`) || node.id.startsWith(`evidence:${agent}:`)) {
      ids.add(node.id);
    }
  }

  return nodeIdsForSentence(data, {
    id: `${agent}:${index}`,
    agent,
    text: '',
    nodeIds: Array.from(ids),
  });
}

function addExisting(data: GraphData, ids: Set<string>, id: string): void {
  if (data.nodes.some((node) => node.id === id)) ids.add(id);
}

function endpointId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
