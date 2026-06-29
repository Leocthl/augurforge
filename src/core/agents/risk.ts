import type { OnEvent, RiskResult, RiskFlag } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { errMsg, isAbortError, isRecord, jsonSchema, objectSchema, pct, stringEnum } from './shared';

const SYSTEM =
  'You are AugurForge Risk. Given the scenario and deterministic metrics, return strict JSON ' +
  '{flags:[{level,text,ref}]} covering tail risk, model assumptions, and governance review points. ' +
  'Do not claim a regulatory breach from demo metrics alone; Solvency II / IFRS-17 references are review lenses unless supplied thresholds are explicit. ' +
  'For option-pricing models, flag model assumption and Greek exposure risks. Decision-support only, not advice.';

const RESPONSE_FORMAT = jsonSchema(
  'augurforge_risk',
  objectSchema(
    {
      flags: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: objectSchema(
          {
            level: stringEnum(['ok', 'warning', 'danger']),
            text: { type: 'string' },
            ref: { type: 'string' },
          },
          ['level', 'text', 'ref'],
        ),
      },
    },
    ['flags'],
  ),
);

function parseMetric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function mockFlags(ctx: TweakContext): RiskFlag[] {
  if (ctx.templateId.startsWith('generated:black-scholes')) {
    const flags: RiskFlag[] = [];
    const vol = ctx.params.volatility ?? 0;
    const maturity = ctx.params.maturity ?? 0;
    if (vol >= 55) {
      flags.push({ level: 'warning', text: `Volatility at ${pct(vol)} makes Vega the dominant exposure.`, ref: 'Black-Scholes Greeks' });
    } else {
      flags.push({ level: 'ok', text: 'Option values are inside the calibrated slider range.', ref: 'Black-Scholes' });
    }
    if (maturity >= 3) {
      flags.push({ level: 'warning', text: 'Long maturity increases assumption risk from constant volatility and rates.', ref: 'Model risk' });
    }
    flags.push({ level: 'warning', text: 'No-dividend European exercise and constant-volatility assumptions must be governance-reviewed before use.', ref: 'Decision-support only' });
    return flags;
  }

  const ruin = parseMetric(ctx.metrics.find((m) => m.id === 'p_ruin')?.value);
  const flags: RiskFlag[] = [];
  if (ruin === undefined) {
    flags.push({ level: 'ok', text: 'Awaiting a simulation to assess ruin probability.' });
  } else if (ruin >= 5) {
    flags.push({ level: 'danger', text: `Ruin probability ${pct(ruin)} is high for this scenario; review capital adequacy and calibration before use.`, ref: 'Internal demo threshold' });
  } else if (ruin >= 1) {
    flags.push({ level: 'warning', text: `Ruin probability ${pct(ruin)} is elevated for this scenario; monitor the barrier and assumptions.`, ref: 'Internal demo threshold' });
  } else {
    flags.push({ level: 'ok', text: `Ruin probability ${pct(ruin)} is low under the current scenario settings.`, ref: 'Scenario metric' });
  }
  if ((ctx.params.sigma ?? 0) >= 30) {
    flags.push({ level: 'warning', text: 'Volatility ≥ 30% — tail outcomes dominate; consider an IFRS-17 risk-adjustment review.', ref: 'IFRS-17' });
  }
  flags.push({ level: 'ok', text: 'This horizon barrier metric is not a standalone Solvency II SCR calculation.', ref: 'Decision-support only' });
  return flags;
}

function validate(json: unknown, fallback: RiskResult): RiskResult {
  if (!isRecord(json) || !Array.isArray(json.flags)) return fallback;
  const flags: RiskFlag[] = [];
  for (const item of json.flags.slice(0, 3)) {
    if (!isRecord(item)) continue;
    const level = item.level === 'danger' || item.level === 'warning' || item.level === 'ok' ? item.level : 'warning';
    if (typeof item.text !== 'string' || !item.text.trim()) continue;
    flags.push({
      level,
      text: item.text.replace(/\s+/g, ' ').trim().slice(0, 180),
      ref: typeof item.ref === 'string' ? item.ref.slice(0, 48) : undefined,
    });
  }
  return flags.length ? { flags } : fallback;
}

export async function runRisk(ctx: TweakContext, onEvent: OnEvent): Promise<RiskResult> {
  onEvent({ agent: 'risk', status: 'start' });
  const mockResult: RiskResult = { flags: mockFlags(ctx) };
  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ templateId: ctx.templateId, params: ctx.params, metrics: ctx.metrics }) },
      ],
      responseFormat: RESPONSE_FORMAT,
      reasoningEffort: 'low',
      temperature: 0,
      maxTokens: 420,
      signal: ctx.signal,
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = validate(res.json, mockResult);
    onEvent({ agent: 'risk', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    if (isAbortError(err)) return mockResult;
    onEvent({ agent: 'risk', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}
