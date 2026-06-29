import type { Metric, TimeInfo } from '../core/contract';
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
  metrics?: Metric[];
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

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(8, Math.min(100, Math.round((value / max) * 100)));
}

function metricCards(metrics: Metric[]): string {
  if (!metrics.length) {
    return `
      <article class="stat-card muted">
        <span>No scenario metrics</span>
        <strong>Waiting</strong>
        <small>Run the deterministic browser math before export.</small>
      </article>`;
  }
  return metrics
    .slice(0, 6)
    .map(
      (metric) => `
        <article class="stat-card">
          <span>${esc(metric.label)}</span>
          <strong>${esc(metric.value)}</strong>
          <small>${esc(metric.id)}</small>
        </article>`,
    )
    .join('');
}

function statusSummary(dossiers: AgentDossier[]): string {
  const counts = dossiers.reduce<Record<AgentDossier['status'], number>>(
    (acc, dossier) => {
      acc[dossier.status] += 1;
      return acc;
    },
    { waiting: 0, thinking: 0, complete: 0, error: 0 },
  );
  return `
    <div class="status-strip" aria-label="Agent status summary">
      <span><b>${counts.complete}</b> complete</span>
      <span><b>${counts.thinking}</b> thinking</span>
      <span><b>${counts.waiting}</b> waiting</span>
      <span><b>${counts.error}</b> errors</span>
    </div>`;
}

function agentBars(dossiers: AgentDossier[]): string {
  const maxEvidence = Math.max(1, ...dossiers.map((dossier) => dossier.evidence.length));
  return dossiers
    .map((dossier) => {
      const evidence = dossier.evidence.length;
      return `
        <div class="bar-row">
          <div>
            <strong>${esc(dossier.label)}</strong>
            <small>${esc(dossier.status)} · ${evidence} evidence items · ${dossier.stats.length} stats</small>
          </div>
          <div class="bar-track" aria-label="${esc(dossier.label)} evidence count">
            <span style="width:${pct(evidence, maxEvidence)}%"></span>
          </div>
        </div>`;
    })
    .join('');
}

function timingBars(latest: TimeInfo): string {
  const ttft = latest.ttftMs ?? 0;
  const rate = latest.tokensPerSec ?? 0;
  return `
    <div class="timing-grid">
      <div class="timing-card">
        <span>TTFT</span>
        <strong>${ttft ? `${Math.round(ttft)} ms` : 'Not reported'}</strong>
        <div class="bar-track slim"><span style="width:${pct(ttft ? 1200 - Math.min(ttft, 1200) : 0, 1200)}%"></span></div>
      </div>
      <div class="timing-card">
        <span>Gemma 4 output speed</span>
        <strong>${rate ? `${Math.round(rate).toLocaleString()} tokens/s` : 'Not reported'}</strong>
        <div class="bar-track slim"><span style="width:${pct(rate, Math.max(2500, rate))}%"></span></div>
      </div>
    </div>`;
}

function questionCards(history: QuestionTurn[]): string {
  if (!history.length) return '<p>No War Room questions were asked in this session.</p>';
  return history
    .map(
      (turn) => `
        <article class="question-card">
          <h3>${esc(turn.question)}</h3>
          <p>${esc(turn.answer)}</p>
          <small>${esc(turn.mode)} · ${turn.timeInfo?.tokensPerSec ? `${Math.round(turn.timeInfo.tokensPerSec)} tokens/s` : 'timing not reported'}</small>
        </article>`,
    )
    .join('');
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
  const metrics = input.metrics ?? [];
  const completed = input.dossiers.filter((dossier) => dossier.status === 'complete').length;
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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)} - War Room Report</title>
  <style>
    :root { color-scheme: light; --ink:#18202d; --muted:#5b6472; --line:rgba(20,24,33,0.12); --blue:#3b6fb0; --paper:#f4f5f7; --panel:#ffffff; --soft:#eef4fb; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: var(--ink); background: var(--paper); }
    main { max-width: 1180px; margin: 0 auto; padding: 34px 24px 56px; }
    header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: end; margin-bottom: 18px; }
    h1 { font-size: 34px; line-height: 1.05; margin: 0 0 10px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    h3 { font-size: 12px; margin: 18px 0 7px; text-transform: uppercase; letter-spacing: 0; color: var(--muted); }
    p { line-height: 1.55; }
    .eyebrow, .chip, small { color: var(--muted); font-size: 12px; }
    .chip { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); border-radius:8px; padding:7px 10px; background:rgba(255,255,255,0.72); font-weight:700; }
    .chip::before { content:''; width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.15); }
    .dashboard-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; margin:18px 0; }
    .stat-card, .meta, .agent, .chart-panel, .question-card, .timing-card { border:1px solid var(--line); border-radius:8px; background:var(--panel); box-shadow:0 12px 28px rgba(15,23,42,0.06); }
    .stat-card { padding:15px; min-height:104px; }
    .stat-card span, .timing-card span { display:block; color:var(--muted); font-size:12px; font-weight:700; }
    .stat-card strong { display:block; margin-top:10px; font-size:24px; line-height:1.05; color:var(--blue); }
    .stat-card small { display:block; margin-top:8px; }
    .stat-card.muted strong { color:var(--muted); }
    .meta, .agent, .chart-panel { padding:18px; margin:14px 0; }
    .narrative { white-space: pre-wrap; line-height: 1.6; border-left:4px solid var(--blue); }
    .report-grid { display:grid; grid-template-columns: minmax(0, 1fr) 360px; gap:14px; align-items:start; }
    .status-strip { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin:10px 0 14px; }
    .status-strip span { border:1px solid var(--line); border-radius:8px; background:var(--soft); padding:10px; color:var(--muted); }
    .status-strip b { display:block; color:var(--ink); font-size:20px; }
    .timing-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:12px; }
    .timing-card { padding:14px; }
    .timing-card strong { display:block; margin:8px 0 10px; color:var(--ink); font-size:18px; }
    .bar-row { display:grid; grid-template-columns: 180px minmax(0, 1fr); gap:12px; align-items:center; padding:10px 0; border-top:1px solid rgba(20,24,33,0.08); }
    .bar-row:first-child { border-top:0; }
    .bar-row strong, .bar-row small { display:block; }
    .bar-track { height:14px; overflow:hidden; border-radius:999px; background:#e5e9f0; }
    .bar-track span { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg, #3b6fb0, #4f8a86); }
    .bar-track.slim { height:9px; }
    .agent h2 { display:flex; justify-content:space-between; gap:12px; }
    .agent h2::after { content:'agent finding'; color:var(--muted); font-size:11px; font-weight:700; text-transform:uppercase; }
    .question-card { padding:14px; margin:10px 0; }
    .question-card h3 { margin:0 0 7px; color:var(--ink); text-transform:none; font-size:14px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 6px 0; }
    @media (max-width: 900px) {
      header, .report-grid { grid-template-columns: 1fr; }
      .dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bar-row, .timing-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <span class="eyebrow">AugurForge War Room · generated ${esc(new Date(input.generatedAt).toLocaleString())}</span>
        <h1>${esc(input.title)}</h1>
        <span class="chip">Gemma 4 on Cerebras · ${esc(input.mode)}</span>
      </div>
      <div class="chip">decision-support, not advice</div>
    </header>

    <section class="dashboard-grid" aria-label="Executive dashboard">
      <article class="stat-card"><span>Agent coverage</span><strong>${completed}/${input.dossiers.length}</strong><small>agents complete</small></article>
      <article class="stat-card"><span>Timing</span><strong>${esc(timing.split(' | ')[0])}</strong><small>${esc(timing.split(' | ')[1])}</small></article>
      <article class="stat-card"><span>Questions</span><strong>${input.history.length}</strong><small>swarm follow-ups</small></article>
      <article class="stat-card"><span>Math layer</span><strong>Browser</strong><small>deterministic simulation facts</small></article>
      ${metricCards(metrics)}
    </section>

    <section class="report-grid">
      <div>
        <section class="meta narrative">
          <h2>Gemma 4 Narrative</h2>
          ${esc(input.narrative)}
        </section>
        ${agentSections}
      </div>
      <aside>
        <section class="chart-panel">
          <h2>Agent Statistics</h2>
          ${statusSummary(input.dossiers)}
          ${agentBars(input.dossiers)}
        </section>
        <section class="chart-panel">
          <h2>Speed Profile</h2>
          ${timingBars(input.latest)}
        </section>
        <section class="chart-panel">
          <h2>Questions</h2>
          ${questionCards(input.history)}
        </section>
      </aside>
    </section>
  </main>
</body>
</html>`;
}

export async function generateReportPreview(input: ReportBriefInput): Promise<GeneratedReport> {
  if (!USE_LIVE) {
    throw new Error('Live mode is off. Restart with VITE_USE_LIVE=true / npm run dev:live to generate a Gemma 4 report.');
  }
  const brief = buildReportBrief(input);
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
  });
  const narrative = res.text.trim();
  if (!narrative) throw new Error('Gemma 4 returned no report narrative.');
  return {
    html: assembleReportHtml({
      title: input.title,
      mode: input.mode,
      narrative,
      brief,
      dossiers: input.dossiers,
      history: input.history,
      latest: input.latest,
      metrics: input.session?.metrics ?? [],
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
