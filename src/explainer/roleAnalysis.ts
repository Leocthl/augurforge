import { chat } from '../core/cerebras';
import type { RoleImpactMetric, RoleImpactResult, RoleRiskLevel, StakeholderRoleId } from './types';
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

export async function runRoleAnalysis(
  roleId: StakeholderRoleId,
  state: ReasoningState,
  sessionSummary?: string,
  signal?: AbortSignal,
): Promise<RoleImpactResult> {
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

export async function runMockRoleAnalysis(
  roleId: StakeholderRoleId,
  state: ReasoningState,
  sessionSummary?: string,
): Promise<RoleImpactResult> {
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
    riskLevel: readRiskLevel(parsed.riskLevel),
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
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return isRecord(parsed) ? parsed : {};
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
  const cleaned = value
    .map((item) => cleanString(item, '', 140))
    .filter(Boolean)
    .slice(0, max);
  return cleaned.length ? cleaned : fallback;
}

function metricList(value: unknown): RoleImpactMetric[] {
  if (!Array.isArray(value)) return [{ label: 'Impact', value: '50', weight: 0.5 }];
  const metrics = value.slice(0, 4).map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      label: cleanString(record.label, 'Impact', 40),
      value: cleanString(record.value, 'n/a', 32),
      weight: clampNumber(record.weight, 0, 1, 0.5),
    };
  });
  return metrics.length ? metrics : [{ label: 'Impact', value: '50', weight: 0.5 }];
}

function readRiskLevel(value: unknown): RoleRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical' ? value : 'medium';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
