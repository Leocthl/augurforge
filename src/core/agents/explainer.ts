/**
 * explainer.ts — the adjustable-depth narrative. [OWNER: A]
 * Streamed prose at entry- or expert-level. STUB content references live metrics.
 * TODO(branch: feat/agents): real prompt per BUILD_SPEC §7.
 */
import type { OnEvent, ProseResult } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { errMsg } from './shared';

const SYSTEM =
  'You are AugurForge’s Explainer. Write a clear narrative at the requested depth ' +
  '(entry or expert). Decision-support only — not advice.'; // TODO(branch: feat/agents)

function mockText(ctx: TweakContext): string {
  const ruin = ctx.metrics.find((m) => m.id === 'p_ruin')?.value ?? 'n/a';
  const varMetric = ctx.metrics.find((m) => m.id === 'var_95')?.value ?? 'n/a';
  const sigma = ctx.params.sigma;
  if (ctx.depth === 'expert') {
    return (
      `Under geometric Brownian motion with σ=${sigma}% and drift μ=${ctx.params.drift}%, the ` +
      `${ctx.params.horizon}-year terminal distribution is right-skewed. The 5th-percentile loss ` +
      `(95% VaR) is ${varMetric}; modelled ruin probability is ${ruin}. The tail is volatility-driven: ` +
      `P(ruin) scales super-linearly in σ while drift shifts the median, not the left tail.`
    );
  }
  return (
    `Think of this as ${ctx.params.horizon} years of possible market journeys. With volatility at ` +
    `${sigma}%, most paths grow, but some dip badly: about ${ruin} of them fall through the floor ` +
    `(that’s the "ruin" chance), and a bad-but-not-worst year loses around ${varMetric}. ` +
    `Turn volatility up and the danger grows fast.`
  );
}

export async function runExplainer(ctx: TweakContext, onEvent: OnEvent): Promise<ProseResult> {
  onEvent({ agent: 'explainer', status: 'start' });
  let streamed = '';
  try {
    const res = await chat(
      {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify({ depth: ctx.depth ?? 'entry', params: ctx.params, metrics: ctx.metrics }) },
        ],
        stream: true,
        reasoningEffort: 'low',
        mock: { text: mockText(ctx) },
      },
      (t) => {
        streamed += t;
        onEvent({ agent: 'explainer', status: 'token', delta: t });
      },
    );
    const result: ProseResult = { text: res.text || streamed };
    onEvent({ agent: 'explainer', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    onEvent({ agent: 'explainer', status: 'error', error: errMsg(err) });
    return { text: streamed };
  }
}