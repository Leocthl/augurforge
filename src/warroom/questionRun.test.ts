import { describe, expect, it } from 'vitest';
import { extractTaggedAgentSections, mockQuestionAnswer } from './questionRun';

describe('questionRun helpers', () => {
  it('extracts tagged sections for all agents', () => {
    const text = [
      '[orchestrator] Route the two-year question through the current scenario.',
      '[modeler] The horizon and volatility assumptions drive the loss shape.',
      '[visualizer] Inspect the fan chart and terminal distribution together.',
      '[sensitivity] Volatility dominates the left tail.',
      '[risk] Greatest loss appears in the stressed tail year.',
      '[explainer] In plain English, the downside is path-dependent.',
    ].join('\n');

    const sections = extractTaggedAgentSections(text);
    expect(sections.risk).toContain('stressed tail');
    expect(sections.explainer).toContain('plain English');
  });

  it('builds an offline mock answer that names the user question', () => {
    const answer = mockQuestionAnswer('Which year had the greatest loss?');

    expect(answer).toContain('[orchestrator]');
    expect(answer).toContain('Which year had the greatest loss?');
    expect(answer).toContain('decision-support, not advice');
  });
});
