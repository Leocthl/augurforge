import type { AgentId, Metric, TimeInfo } from '../core/contract';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import type { ReasoningState } from '../explainer/reasoningGraph';
import type { GNode } from '../explainer/types';
import { AGENT_LABEL, AGENT_ORDER, AGENT_PANIC_LINES, AGENT_RESPONSIBILITY } from './agents';
import type { GroupStatus } from './crowd';

export type DossierStatus = 'waiting' | 'thinking' | 'complete' | 'error';

export type AgentDossierStats = string[] & {
  status?: DossierStatus;
  ttftMs?: number;
  tokensPerSec?: number;
  totalTokens?: number;
  metric?: Metric;
};

export interface AgentDossier {
  agentId: AgentId;
  agent?: AgentId;
  label: string;
  responsibility: string;
  status: DossierStatus;
  conclusion: string;
  evidence: string[];
  critique: string;
  stats: AgentDossierStats;
  transcript: string[];
  timeInfo?: TimeInfo;
}

export interface DossierInput {
  state: ReasoningState;
  statuses: Record<string, GroupStatus>;
  latestByAgent?: Partial<Record<AgentId, TimeInfo | undefined>>;
  session?: AugurForgeSessionSnapshot | null;
}

const CRITIQUE: Record<AgentId, string> = {
  orchestrator: 'Check that the selected path matches the uploaded intent and stays in decision-support territory.',
  modeler: 'Treat inferred parameters as inspectable assumptions, not governed actuarial inputs.',
  visualizer: 'Favor clear views over spectacle unless the model is genuinely spatial or 3D.',
  sensitivity: 'Watch for brittle outputs where a single slider dominates the story.',
  risk: 'Put caveats before persuasion; a clean demo still needs visible risk boundaries.',
  explainer: 'Keep plain English tied to evidence, metrics, and deterministic browser math.',
};

function statusFor(agent: AgentId, state: ReasoningState, groupStatus: GroupStatus | undefined): DossierStatus {
  const beat = state.beats.find((item) => item.agent === agent);
  if (beat?.status === 'error') return 'error';
  if (groupStatus?.thinking || beat?.status === 'streaming') return 'thinking';
  if (groupStatus?.done || beat?.status === 'done') return 'complete';
  return 'waiting';
}

function isAgentId(value: string): value is AgentId {
  return (AGENT_ORDER as string[]).includes(value);
}

function ownerForNode(id: string): AgentId | null {
  if (isAgentId(id)) return id;
  if (id.startsWith('param:')) return 'modeler';
  if (id.startsWith('model:')) return 'orchestrator';
  if (id.startsWith('risk:')) return 'risk';

  const [prefix, owner] = id.split(':');
  if (
    (prefix === 'metric' || prefix === 'insight' || prefix === 'evidence' || prefix === 'driver') &&
    owner &&
    isAgentId(owner)
  ) {
    return owner;
  }
  return null;
}

function cleanText(value: string | undefined, fallback?: string): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function nodeEvidence(nodes: GNode[], agent: AgentId): string[] {
  const seen = new Set<string>();
  return nodes
    .filter((node) => ownerForNode(node.id) === agent && node.id !== agent)
    .map((node) => cleanText(node.label))
    .filter((label): label is string => Boolean(label))
    .filter((label) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function transcriptFor(agent: AgentId, state: ReasoningState, session: AugurForgeSessionSnapshot | null | undefined): string[] {
  const beatLines = state.beats
    .filter((beat) => beat.agent === agent)
    .map((beat) => cleanText(beat.text))
    .filter((line): line is string => Boolean(line));

  const eventLines = (session?.events ?? [])
    .filter((event) => event.agent === agent)
    .map((event) => cleanText(event.delta ?? event.error))
    .filter((line): line is string => Boolean(line));

  return [...beatLines, ...eventLines].slice(-6);
}

function latestSessionTime(agent: AgentId, session: AugurForgeSessionSnapshot | null | undefined): TimeInfo | undefined {
  return [...(session?.events ?? [])].reverse().find((event) => event.agent === agent && event.timeInfo)?.timeInfo;
}

function statsFor(status: DossierStatus, timeInfo: TimeInfo | undefined, metric: Metric | undefined): AgentDossierStats {
  const stats = [`Status ${status}`] as AgentDossierStats;
  stats.status = status;
  if (timeInfo?.ttftMs !== undefined) {
    stats.ttftMs = timeInfo.ttftMs;
    stats.push(`TTFT ${timeInfo.ttftMs} ms`);
  }
  if (timeInfo?.tokensPerSec !== undefined) {
    stats.tokensPerSec = timeInfo.tokensPerSec;
    stats.push(`${Math.round(timeInfo.tokensPerSec)} tokens/s`);
  }
  if (timeInfo?.totalTokens !== undefined) {
    stats.totalTokens = timeInfo.totalTokens;
    stats.push(`${timeInfo.totalTokens} total tokens`);
  }
  if (metric) {
    stats.metric = metric;
    stats.push(`${metric.label}: ${metric.value}`);
  }
  return stats;
}

function conclusionFor(agent: AgentId, status: DossierStatus, groupStatus: GroupStatus | undefined, evidence: string[]): string {
  const caption = cleanText(groupStatus?.caption);
  if (caption) return caption;
  if (evidence[0]) return evidence[0];
  if (status === 'error') return `${AGENT_LABEL[agent]} needs attention.`;
  return AGENT_PANIC_LINES[agent][0];
}

export function deriveAgentDossiers(input: DossierInput): AgentDossier[] {
  return AGENT_ORDER.map((agent) => {
    const groupStatus = input.statuses[agent];
    const status = statusFor(agent, input.state, groupStatus);
    const evidence = nodeEvidence(input.state.data.nodes, agent);
    const timeInfo = input.latestByAgent?.[agent] ?? latestSessionTime(agent, input.session);
    const metric = input.session?.metrics?.[0];

    return {
      agentId: agent,
      agent,
      label: AGENT_LABEL[agent],
      responsibility: AGENT_RESPONSIBILITY[agent],
      status,
      conclusion: conclusionFor(agent, status, groupStatus, evidence),
      evidence,
      critique: CRITIQUE[agent],
      stats: statsFor(status, timeInfo, metric),
      transcript: transcriptFor(agent, input.state, input.session),
      timeInfo,
    };
  });
}
