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
