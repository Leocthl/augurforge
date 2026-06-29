import { describe, expect, it } from 'vitest';
import { buildRolePayload, parseRoleJson, ROLE_DEFS, runMockRoleAnalysis, runRoleAnalysis } from './roleAnalysis';
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

  it('bounds long session text, reasoning, and graph labels', () => {
    const longText = 'x'.repeat(5000);
    const payload = buildRolePayload(
      {
        ...state,
        data: {
          nodes: [
            ...state.data.nodes,
            { id: 'metric:long', label: longText, role: 'metric', color: '#67e8f9', size: 5, bornAt: 0, pulse: false },
          ],
          links: [],
        },
        beats: [{ agent: 'explainer', status: 'done', text: longText }],
      },
      longText,
    );

    expect(payload.summary.length).toBeLessThanOrEqual(1200);
    expect(payload.reasoning.length).toBeLessThanOrEqual(2400);
    expect(payload.graph).not.toContain(longText);
  });

  it('parses role JSON into clamped impact output', () => {
    const parsed = parseRoleJson(
      'finance',
      '{"impactScore":145,"riskLevel":"high","brief":"Margin pressure.","concerns":["Capital"],"questions":["What changed?"],"metrics":[{"label":"P(ruin)","value":"8.9%","weight":1.7}]}',
    );
    expect(parsed.impactScore).toBe(100);
    expect(parsed.metrics[0].weight).toBe(1);
  });

  it('parses fenced or prose-wrapped JSON and falls back for malformed JSON', () => {
    const fenced = parseRoleJson(
      'executive',
      'Use this JSON:\n```json\n{"impactScore":77,"riskLevel":"medium","brief":"Board lens.","concerns":["Timing"],"questions":["Proceed?"],"metrics":[{"label":"Impact","value":"77","weight":0.77}]}\n```',
    );
    const malformed = parseRoleJson('hr', '{"impactScore":');

    expect(fenced.brief).toBe('Board lens.');
    expect(fenced.impactScore).toBe(77);
    expect(malformed.title).toBe('HR');
    expect(malformed.impactScore).toBe(50);
    expect(malformed.metrics[0]).toMatchObject({ label: 'Impact', weight: 0.5 });
  });

  it('rejects aborted live analysis instead of returning simulated stale output', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runRoleAnalysis('finance', state, 'Cancelled run', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects analysis cancelled while the model call is in flight', async () => {
    const controller = new AbortController();
    const pending = runRoleAnalysis('finance', state, 'Cancelled after dispatch', controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns deterministic mock output for offline mode', async () => {
    const result = await runMockRoleAnalysis('operations', state, 'No live key');
    expect(result.roleId).toBe('operations');
    expect(result.brief).toContain('Operations');
    expect(result.simulated).toBe(true);
  });
});
