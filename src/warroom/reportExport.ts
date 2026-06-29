import type { TimeInfo } from '../core/contract';
import { chat, USE_LIVE } from '../core/cerebras';
import type { AugurForgeSessionSnapshot } from '../core/sessionContext';
import type { AgentDossier } from './agentDossier';
import type { QuestionTurn } from './questionRun';

export interface ReportBriefInput {
  title: string;
  mode: string;
  latest: TimeInfo;
  dossiers: AgentDossier[];
  history: QuestionTurn[];
  session: AugurForgeSessionSnapshot | null;
}

export interface ReportHtmlInput {
  title: string;
  mode: string;
  narrative: string;
  brief: string;
  dossiers: AgentDossier[];
  history: QuestionTurn[];
  latest: TimeInfo;
  generatedAt: number;
}

export interface GeneratedReport {
  html: string;
  narrative: string;
  mode: 'live' | 'mock';
  timeInfo?: TimeInfo;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function list(items: string[]): string {
  return items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p>None surfaced.</p>';
}

export function buildReportBrief(input: ReportBriefInput): string {
  return JSON.stringify({
    product: 'AugurForge War Room',
    model: 'Gemma 4 on Cerebras',
    mode: input.mode,
    title: input.title,
    caveat: 'decision-support, not advice',
    math: 'deterministic browser math',
    timing: input.latest,
    metrics: input.session?.metrics ?? [],
    agentFindings: input.dossiers.map((dossier) => ({
      agent: dossier.label,
      responsibility: dossier.responsibility,
      conclusion: dossier.conclusion,
      evidence: dossier.evidence,
      critique: dossier.critique,
      stats: dossier.stats,
    })),
    questions: input.history.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
      mode: turn.mode,
      timeInfo: turn.timeInfo,
    })),
  });
}

export function mockReportNarrative(input: ReportBriefInput): string {
  const risk = input.dossiers.find((dossier) => dossier.agentId === 'risk')?.conclusion ?? 'No surfaced risk conclusion yet.';
  const explainer = input.dossiers.find((dossier) => dossier.agentId === 'explainer')?.conclusion ?? 'No final explanation yet.';
  return [
    'Executive summary: Gemma 4 on Cerebras reviewed the current War Room context and the deterministic browser math.',
    `Agent findings: Risk noted ${risk} Explainer noted ${explainer}`,
    'Key risks and sensitivities: volatility, horizon, and left-tail concentration are the first assumptions to stress.',
    'Plain-English interpretation: treat the output as fast scenario exploration, not a governed reserving result.',
    'Decision-support caveat: this is decision-support, not advice.',
  ].join('\n\n');
}

export function assembleReportHtml(input: ReportHtmlInput): string {
  const timing = [
    input.latest.ttftMs !== undefined ? `TTFT ${input.latest.ttftMs} ms` : 'TTFT not reported',
    input.latest.tokensPerSec !== undefined ? `${Math.round(input.latest.tokensPerSec)} tokens/s` : 'tokens/s not reported',
  ].join(' | ');
  const agentSections = input.dossiers
    .map(
      (dossier) => `
        <section class="agent">
          <h2>${esc(dossier.label)}</h2>
          <p><strong>Responsibility:</strong> ${esc(dossier.responsibility)}</p>
          <p><strong>Conclusion:</strong> ${esc(dossier.conclusion)}</p>
          <h3>Evidence</h3>
          ${list(dossier.evidence)}
          <h3>Critique and judgment</h3>
          <p>${esc(dossier.critique)}</p>
          <h3>Statistics</h3>
          ${list(dossier.stats)}
        </section>`,
    )
    .join('');
  const questions = input.history.map((turn) => `<li><strong>${esc(turn.question)}</strong><br>${esc(turn.answer)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)} - War Room Report</title>
  <style>
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #1d2330; background: #f4f5f7; }
    main { max-width: 980px; margin: 0 auto; padding: 36px 24px 56px; }
    h1 { font-size: 30px; margin: 0 0 10px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    h3 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0; color: #5b6472; }
    .meta, .agent { border: 1px solid rgba(20,24,33,0.12); border-radius: 8px; background: #fff; padding: 16px; margin: 14px 0; }
    .narrative { white-space: pre-wrap; line-height: 1.55; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <main>
    <h1>${esc(input.title)}</h1>
    <section class="meta">
      <p><strong>Generated:</strong> ${esc(new Date(input.generatedAt).toLocaleString())}</p>
      <p><strong>Mode:</strong> ${esc(input.mode)}</p>
      <p><strong>Model:</strong> Gemma 4 on Cerebras</p>
      <p><strong>Timing:</strong> ${esc(timing)}</p>
      <p><strong>Math:</strong> deterministic browser math</p>
      <p><strong>Caveat:</strong> decision-support, not advice</p>
    </section>
    <section class="meta narrative">${esc(input.narrative)}</section>
    ${agentSections}
    <section class="meta">
      <h2>Questions</h2>
      <ul>${questions || '<li>No War Room questions were asked in this session.</li>'}</ul>
    </section>
  </main>
</body>
</html>`;
}

export async function generateReportPreview(input: ReportBriefInput): Promise<GeneratedReport> {
  const brief = buildReportBrief(input);
  const mockText = mockReportNarrative(input);
  const res = await chat({
    messages: [
      {
        role: 'system',
        content:
          'You write concise AugurForge War Room HTML report narrative sections. Include executive summary, agent findings, key risks and sensitivities, plain-English interpretation, and the decision-support caveat.',
      },
      { role: 'user', content: brief },
    ],
    stream: false,
    reasoningEffort: 'low',
    temperature: 0.2,
    maxTokens: 900,
    mock: { text: mockText },
  });
  const narrative = res.text || mockText;
  return {
    html: assembleReportHtml({
      title: input.title,
      mode: input.mode,
      narrative,
      brief,
      dossiers: input.dossiers,
      history: input.history,
      latest: input.latest,
      generatedAt: Date.now(),
    }),
    narrative,
    mode: USE_LIVE ? 'live' : 'mock',
    timeInfo: res.timeInfo,
  };
}

export function downloadReportHtml(html: string, title: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'war-room'}-report.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
