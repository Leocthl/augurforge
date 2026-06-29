import { describe, expect, it } from 'vitest';
import type { AgentDossier } from './agentDossier';
import { assembleReportHtml, buildReportBrief } from './reportExport';

const dossier: AgentDossier = {
  agentId: 'risk',
  label: 'Risk',
  responsibility: 'Reviews tail behavior.',
  status: 'complete',
  conclusion: '<Tail risk is visible>',
  evidence: ['P(ruin): 2.3%'],
  critique: 'Decision-support caveat required.',
  stats: ['TTFT 12 ms', '2100 tok/s'],
  transcript: ['Tail risk is visible.'],
};

describe('report export helpers', () => {
  it('builds a compact brief with required product labels', () => {
    const brief = buildReportBrief({
      title: 'Portfolio ruin risk',
      mode: 'Live Cerebras Gemma 4',
      latest: { ttftMs: 12, tokensPerSec: 2100 },
      dossiers: [dossier],
      history: [],
      session: null,
    });

    expect(brief).toContain('Gemma 4');
    expect(brief).toContain('Cerebras');
    expect(brief).toContain('deterministic browser math');
    expect(brief).toContain('decision-support, not advice');
  });

  it('escapes structured facts in assembled HTML', () => {
    const html = assembleReportHtml({
      title: 'Portfolio ruin risk',
      mode: 'mock',
      narrative: 'Executive summary',
      brief: 'brief',
      dossiers: [dossier],
      history: [],
      latest: { ttftMs: 12, tokensPerSec: 2100 },
      generatedAt: 1,
    });

    expect(html).toContain('Gemma 4');
    expect(html).toContain('Cerebras');
    expect(html).toContain('&lt;Tail risk is visible&gt;');
    expect(html).not.toContain('<Tail risk is visible>');
  });
});
