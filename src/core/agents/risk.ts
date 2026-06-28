/**
 * risk.ts — tail risks; Solvency II SCR / IFRS-17 flags. [OWNER: A]
 * Structured RiskResult. STUB thresholds keyed off P(ruin) so flags change with the scenario.
 * TODO(branch: feat/agents): real prompt + strict JSON schema per BUILD_SPEC §7.
 */
import type { OnEvent, RiskResult, RiskFlag } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { coerce, errMsg, pct } from './shared';

const SYSTEM =
  'You are AugurForge’s Risk flagger. Given the scenario and metrics, return strict JSON ' +
  '{flags:[{level,text,ref}]} covering tail risk and Solvency II / IFRS-17 thresholds. ' +
  'Decision-support only — not advice.'; // TODO(branch: feat/agents)

function parseMetric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function mockFlags(ctx: TweakContext): RiskFlag[] {
  const ruin = parseMetric(ctx.metrics.find((m) => m.id === 'p_ruin')?.value);
  const flags: RiskFlag[] = [];
  if (ruin === undefined) {
    flags.push({ level: 'ok', text: 'Awaiting a simulation to assess ruin probability.' });
  } else if (ruin >= 5) {
    flags.push({ level: 'danger', text: `Ruin probability ${pct(ruin)} breaches the Solvency II capital buffer.`, ref: 'Solvency II SCR' });
  } else if (ruin >= 1) {
    flags.push({ level: 'warning', text: `Ruin probability ${pct(ruin)} is elevated — monitor the capital buffer.`, ref: 'Solvency II SCR' });
  } else {
    flags.push({ level: 'ok', text: `Ruin probability ${pct(ruin)} is within the capital buffer.`, ref: 'Solvency II SCR' });
  }
  if ((ctx.params.sigma ?? 0) >= 30) {
    flags.push({ level: 'warning', text: 'Volatility ≥ 30% — tail outcomes dominate; consider an IFRS-17 risk-adjustment review.', ref: 'IFRS-17' });
  }
  return flags;
}

export async function runRisk(ctx: TweakContext, onEvent: OnEvent): Promise<RiskResult> {
  onEvent({ agent: 'risk', status: 'start' });
  const mockResult: RiskResult = { flags: mockFlags(ctx) };
  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ params: ctx.params, metrics: ctx.metrics }) },
      ],
      reasoningEffort: 'low',
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = coerce<RiskResult>(res.json, mockResult, 'flags');
    onEvent({ agent: 'risk', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    onEvent({ agent: 'risk', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}