/**
 * sensitivity.ts — why the outcome moved; which driver dominates. [OWNER: A]
 * Streamed prose. STUB content keyed off the scenario so the demo narrative changes live.
 * TODO(branch: feat/agents): real prompt per BUILD_SPEC §7.
 */
import type { OnEvent, ProseResult } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { errMsg } from './shared';

const SYSTEM =
  'You are AugurForge’s Sensitivity analyst. In 2–3 sentences explain why the outcome moved ' +
  'and which input dominates. Decision-support only — not advice.'; // TODO(branch: feat/agents)

function mockText(ctx: TweakContext): string {
  const ruin = ctx.metrics.find((m) => m.id === 'p_ruin')?.value ?? 'n/a';
  const sigma = ctx.params.sigma;
  if (ctx.changed) {
    const dir = ctx.changed.to >= ctx.changed.from ? 'raising' : 'lowering';
    return (
      `Volatility is the dominant driver here. ${dir} ${ctx.changed.label ?? ctx.changed.id} ` +
      `to ${ctx.changed.to} widened the outcome cone and moved P(ruin) to ${ruin}. ` +
      `Drift only partially offsets the wider dispersion at σ=${sigma}%.`
    );
  }
  return (
    `At σ=${sigma}% the loss cone is moderate and P(ruin) sits at ${ruin}. ` +
    `Volatility, not drift, controls the tail — expect P(ruin) to rise sharply as σ climbs.`
  );
}

export async function runSensitivity(ctx: TweakContext, onEvent: OnEvent): Promise<ProseResult> {
  onEvent({ agent: 'sensitivity', status: 'start' });
  let streamed = '';
  try {
    const res = await chat(
      {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify({ params: ctx.params, metrics: ctx.metrics, changed: ctx.changed }) },
        ],
        stream: true,
        reasoningEffort: 'low',
        mock: { text: mockText(ctx) },
      },
      (t) => {
        streamed += t;
        onEvent({ agent: 'sensitivity', status: 'token', delta: t });
      },
    );
    const result: ProseResult = { text: res.text || streamed };
    onEvent({ agent: 'sensitivity', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    onEvent({ agent: 'sensitivity', status: 'error', error: errMsg(err) });
    return { text: streamed };
  }
}