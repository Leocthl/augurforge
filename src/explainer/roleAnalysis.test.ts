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
    const parsed = parseRoleJson(
      'finance',
      '{"impactScore":145,"riskLevel":"high","brief":"Margin pressure.","concerns":["Capital"],"questions":["What changed?"],"metrics":[{"label":"P(ruin)","value":"8.9%","weight":1.7}]}',
    );
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
