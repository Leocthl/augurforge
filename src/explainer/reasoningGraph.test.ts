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
    expect(agentForNode('insight:sensitivity')).toBe('sensitivity');
    expect(agentForNode('input')).toBeNull();
  });
});
