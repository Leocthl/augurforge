import type { OnEvent, ProseResult } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { errMsg, isAbortError } from './shared';

const SYSTEM =
  'You are AugurForge Explainer. Write a clear streaming narrative at the requested depth, entry or expert. ' +
  'Use only supplied params and metrics. Keep it practical and label this as decision-support, not advice.';

function mockText(ctx: TweakContext): string {
  if (ctx.templateId.startsWith('generated:black-scholes')) {
    const call = ctx.metrics.find((m) => m.id === 'call_price')?.value ?? 'n/a';
    const put = ctx.metrics.find((m) => m.id === 'put_price')?.value ?? 'n/a';
    const delta = ctx.metrics.find((m) => m.id === 'delta')?.value ?? 'n/a';
    if (ctx.depth === 'expert') {
      return (
        `Generated Black-Scholes sandbox: spot=${ctx.params.spot}, strike=${ctx.params.strike}, vol=${ctx.params.volatility}%, ` +
        `rate=${ctx.params.rate}%, maturity=${ctx.params.maturity}y. The call is ${call}, the put is ${put}, and call delta is ${delta}. ` +
        `Treat this as a fast closed-form sensitivity view; no dividends, constant volatility, European exercise, and continuous compounding are assumptions to review.`
      );
    }
    return (
      `Gemma generated this option-pricing sandbox, then AugurForge ran deterministic Black-Scholes math in the browser. ` +
      `At the current sliders, the call is ${call} and the put is ${put}; move spot, strike, or volatility to see the curve reprice instantly.`
    );
  }

  const ruin = ctx.metrics.find((m) => m.id === 'p_ruin')?.value ?? 'n/a';
  const varMetric = ctx.metrics.find((m) => m.id === 'var_95')?.value ?? 'n/a';
  const sigma = ctx.params.sigma;
  if (ctx.depth === 'expert') {
    return (
      `Under geometric Brownian motion with σ=${sigma}% and drift μ=${ctx.params.drift}%, the ` +
      `${ctx.params.horizon}-year terminal distribution is right-skewed. The 5th-percentile loss ` +
      `(95% VaR) is ${varMetric}; modelled ruin probability is ${ruin}. The tail is volatility-driven: ` +
      `Higher σ usually raises barrier and left-tail risk sharply; drift shifts the whole distribution and partly offsets that pressure.`
    );
  }
  return (
    `Think of this as ${ctx.params.horizon} years of possible market journeys. With volatility at ` +
    `${sigma}%, most paths grow, but some dip badly: about ${ruin} of them fall through the floor ` +
    `(that’s the "ruin" chance), and the terminal 5th-percentile loss is around ${varMetric}. ` +
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
          { role: 'user', content: JSON.stringify({ templateId: ctx.templateId, depth: ctx.depth ?? 'entry', params: ctx.params, metrics: ctx.metrics }) },
        ],
        stream: true,
        reasoningEffort: 'low',
        temperature: 0.2,
        maxTokens: 260,
        signal: ctx.signal,
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
    if (isAbortError(err)) return { text: streamed };
    onEvent({ agent: 'explainer', status: 'error', error: errMsg(err) });
    return { text: streamed };
  }
}
