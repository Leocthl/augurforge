import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentId, TimeInfo } from '../core/contract';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import { applyEvent, initReasoning, type ReasoningState } from '../explainer/reasoningGraph';
import type { GroupStatus } from './crowd';
import { AGENT_ORDER } from './agents';
import { deriveAgentDossiers } from './agentDossier';

function emptyStatuses(): Record<string, GroupStatus> {
  return Object.fromEntries(
    AGENT_ORDER.map((agent) => [agent, { started: false, thinking: false, done: false, caption: '' }]),
  );
}

function applyAll(events: AgentEvent[]): ReasoningState {
  return events.reduce((state, event, index) => applyEvent(state, event, index + 1), initReasoning(0));
}

describe('deriveAgentDossiers', () => {
  it('gives every agent a static responsibility', () => {
    const dossiers = deriveAgentDossiers({
      state: initReasoning(0),
      statuses: emptyStatuses(),
    });

    expect(dossiers).toHaveLength(AGENT_ORDER.length);
    expect(dossiers.map((dossier) => dossier.agent)).toEqual(AGENT_ORDER);
    for (const dossier of dossiers) {
      expect(dossier.responsibility.length).toBeGreaterThan(20);
      expect(dossier.status).toBe('waiting');
    }
  });

  it('puts the risk conclusion first while preserving evidence, TTFT/tokens, and transcript', () => {
    const riskTime: TimeInfo = { ttftMs: 42, tokensPerSec: 318.2, totalTokens: 137, totalMs: 510 };
    const events: AgentEvent[] = [
      { agent: 'risk', status: 'start' },
      { agent: 'risk', status: 'token', delta: 'Tail risk elevated. ' },
      {
        agent: 'risk',
        status: 'done',
        result: {
          flags: [
            { level: 'warning', text: 'Ruin probability exceeds appetite.', ref: 'P(ruin) 8.1%' },
            { level: 'danger', text: 'Drawdown tail is concentrated.', ref: '95% VaR' },
          ],
        },
        timeInfo: riskTime,
      },
    ];
    const state = applyAll(events);
    const statuses = emptyStatuses();
    statuses.risk = { started: true, thinking: false, done: true, caption: 'Tail risk elevated.' };
    const latestByAgent: Partial<Record<AgentId, TimeInfo>> = { risk: riskTime };
    const session: AugurForgeSessionSnapshot = {
      version: 1,
      updatedAt: 1,
      metrics: [{ id: 'p_ruin', label: 'P(ruin)', value: '8.1%' }],
      events,
    };

    const risk = deriveAgentDossiers({ state, statuses, latestByAgent, session }).find((dossier) => dossier.agent === 'risk');

    expect(risk).toBeDefined();
    expect(risk?.status).toBe('complete');
    expect(risk?.conclusion).toBe('Tail risk elevated.');
    expect(risk?.evidence).toEqual([
      'warning: Ruin probability exceeds appetite.',
      'P(ruin) 8.1%',
      'danger: Drawdown tail is concentrated.',
      '95% VaR',
    ]);
    expect(risk?.stats.ttftMs).toBe(42);
    expect(risk?.stats.tokensPerSec).toBe(318.2);
    expect(risk?.stats.totalTokens).toBe(137);
    expect(risk?.stats.metric).toEqual({ id: 'p_ruin', label: 'P(ruin)', value: '8.1%' });
    expect(risk?.stats).toContain('TTFT 42 ms');
    expect(risk?.stats).toContain('318 tokens/s');
    expect(risk?.timeInfo).toEqual(riskTime);
    expect(risk?.transcript).toContain('Tail risk elevated.');
  });
});
