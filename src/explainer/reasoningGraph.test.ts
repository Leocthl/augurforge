import { describe, expect, it } from 'vitest';
import { applyEvent, initReasoning, agentForNode } from './reasoningGraph';
import type { AgentEvent } from './types';

const ev = (e: AgentEvent) => e; // shorthand

function run(events: AgentEvent[]) {
  let s = initReasoning(0);
  for (const e of events) s = applyEvent(s, e, 0);
  return s;
}

describe('reasoningGraph reducer', () => {
  it('seeds an input node and no beats', () => {
    const s = initReasoning(0);
    expect(s.beats).toEqual([]);
    expect(s.data.nodes.map((n) => n.id)).toEqual(['input']);
  });

  it('appends an ordered streaming beat on start', () => {
    const s = run([ev({ agent: 'orchestrator', status: 'start' })]);
    expect(s.beats).toHaveLength(1);
    expect(s.beats[0]).toMatchObject({ agent: 'orchestrator', text: '', status: 'streaming' });
    expect(s.active).toBe('orchestrator');
  });

  it('accumulates token deltas into the agent beat text', () => {
    const s = run([
      ev({ agent: 'orchestrator', status: 'start' }),
      ev({ agent: 'orchestrator', status: 'token', delta: 'Routing ' }),
      ev({ agent: 'orchestrator', status: 'token', delta: 'now.' }),
    ]);
    expect(s.beats[0].text).toBe('Routing now.');
    expect(s.captions.orchestrator).toBe('Routing now.');
  });

  it('marks the beat done and preserves cascade order across agents', () => {
    const s = run([
      ev({ agent: 'orchestrator', status: 'start' }),
      ev({ agent: 'orchestrator', status: 'done', result: { templateId: 'monte-carlo' } }),
      ev({ agent: 'modeler', status: 'start' }),
    ]);
    expect(s.beats.map((b) => b.agent)).toEqual(['orchestrator', 'modeler']);
    expect(s.beats[0].status).toBe('done');
    expect(s.active).toBe('modeler');
  });

  it('creates an agent node if a done event arrives without a start event', () => {
    const s = run([ev({ agent: 'orchestrator', status: 'done', result: { templateId: 'monte-carlo' } })]);
    expect(s.data.nodes.map((n) => n.id)).toContain('orchestrator');
    expect(s.data.nodes.map((n) => n.id)).toContain('model:monte-carlo');
    expect(s.beats[0].text).toContain('monte-carlo');
    expect(s.data.links).toContainEqual({ source: 'input', target: 'orchestrator' });
    expect(s.data.links).toContainEqual({ source: 'orchestrator', target: 'model:monte-carlo' });
  });

  it('spawns prose insight nodes even when done result is omitted', () => {
    const s = run([ev({ agent: 'explainer', status: 'done' })]);
    expect(s.data.nodes.map((n) => n.id)).toContain('insight:explainer');
    expect(s.data.links).toContainEqual({ source: 'input', target: 'explainer' });
    expect(s.data.links).toContainEqual({ source: 'explainer', target: 'insight:explainer' });
  });

  it('summarizes structured live done payloads instead of leaving ellipsis text', () => {
    const s = run([
      ev({
        agent: 'modeler',
        status: 'done',
        result: {
          templateId: 'monte-carlo',
          params: { sigma: 18, drift: 7, horizon: 30 },
          mapping: { source: 'Gemma inferred GBM drift and volatility from the supplied return series.' },
        },
      }),
      ev({
        agent: 'risk',
        status: 'done',
        result: {
          flags: [
            { level: 'warning', text: 'Volatility drives the left-tail loss cone.', ref: 'Scenario metric' },
          ],
        },
      }),
    ]);
    expect(s.beats.find((b) => b.agent === 'modeler')?.text).toContain('sigma=18');
    expect(s.beats.find((b) => b.agent === 'risk')?.text).toContain('Volatility drives');
  });

  it('expands Gemma result objects into a richer knowledge graph', () => {
    const s = run([
      ev({
        agent: 'orchestrator',
        status: 'done',
        result: {
          templateId: 'monte-carlo',
          intent: 'Explore portfolio ruin risk',
          notes: 'Matched the GBM Monte Carlo hero template.',
        },
      }),
      ev({
        agent: 'modeler',
        status: 'done',
        result: {
          templateId: 'monte-carlo',
          params: { sigma: 18, drift: 7, horizon: 30, seed: 2027 },
          mapping: { source: 'Inferred drift and volatility from the return series.' },
        },
      }),
      ev({
        agent: 'visualizer',
        status: 'done',
        result: {
          templateId: 'monte-carlo',
          title: 'Monte Carlo - Portfolio Ruin',
          views: ['2d', '3d'],
          explainer: {
            entry: 'Shows possible market journeys.',
            expert: 'Uses GBM with Brownian bridge correction.',
          },
        },
      }),
      ev({
        agent: 'explainer',
        status: 'done',
        result: {
          text: 'Volatility widens the cone. The ruin metric is decision-support, not advice.',
          metrics: [{ id: 'p_ruin', label: 'P(ruin)', value: '8.9%' }],
        },
      }),
    ]);
    const ids = s.data.nodes.map((n) => n.id);
    expect(ids).toContain('driver:orchestrator:intent');
    expect(ids).toContain('evidence:modeler:source');
    expect(ids).toContain('driver:visualizer:view-2d');
    expect(ids).toContain('insight:visualizer:entry');
    expect(ids).toContain('metric:explainer:p-ruin');
    expect(ids).toContain('insight:explainer:0');
    expect(s.data.nodes.length).toBeGreaterThanOrEqual(20);
  });

  it('marks the beat as error and stores the message', () => {
    const s = run([
      ev({ agent: 'explainer', status: 'start' }),
      ev({ agent: 'explainer', status: 'error', error: 'pipeline failed' }),
    ]);
    expect(s.beats[0]).toMatchObject({ agent: 'explainer', status: 'error', text: 'pipeline failed' });
  });

  it('re-running an agent resets its beat in place (no duplicate)', () => {
    const s = run([
      ev({ agent: 'risk', status: 'start' }),
      ev({ agent: 'risk', status: 'token', delta: 'first' }),
      ev({ agent: 'risk', status: 'done', result: { flags: [] } }),
      ev({ agent: 'risk', status: 'start' }),
      ev({ agent: 'risk', status: 'token', delta: 'second' }),
    ]);
    expect(s.beats.filter((b) => b.agent === 'risk')).toHaveLength(1);
    expect(s.beats[0].text).toBe('second');
    expect(s.beats[0].status).toBe('streaming');
  });

  it('reuses node object identity across updates so positions are preserved', () => {
    const s1 = run([ev({ agent: 'orchestrator', status: 'start' })]);
    const input1 = s1.data.nodes.find((n) => n.id === 'input');
    const s2 = applyEvent(s1, ev({ agent: 'orchestrator', status: 'token', delta: 'x' }), 0);
    const input2 = s2.data.nodes.find((n) => n.id === 'input');
    expect(input2).toBe(input1); // same reference
  });

  it('resolves a node id to its owning agent', () => {
    expect(agentForNode('orchestrator')).toBe('orchestrator');
    expect(agentForNode('model:monte-carlo')).toBe('orchestrator');
    expect(agentForNode('param:sigma')).toBe('modeler');
    expect(agentForNode('risk:0')).toBe('risk');
    expect(agentForNode('insight:explainer')).toBe('explainer');
    expect(agentForNode('insight:explainer:0')).toBe('explainer');
    expect(agentForNode('driver:visualizer:view-2d')).toBe('visualizer');
    expect(agentForNode('evidence:modeler:source')).toBe('modeler');
    expect(agentForNode('metric:explainer:p-ruin')).toBe('explainer');
    expect(agentForNode('insight:sensitivity')).toBe('sensitivity');
    expect(agentForNode('input')).toBeNull();
  });
});
