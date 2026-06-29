import type { OnEvent, ProseResult } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { errMsg, isAbortError } from './shared';

const SYSTEM =
  'You are AugurForge Sensitivity. In 2 concise sentences, explain why the deterministic metrics moved and which input dominates. ' +
  'Ground every claim in the provided params and metrics. Decision-support only, not advice.';

function mockText(ctx: TweakContext): string {
  if (ctx.templateId.startsWith('generated:black-scholes')) {
    const metric = ctx.metrics.find((m) => m.id === 'call_price')?.value ?? 'n/a';
    if (ctx.changed) {
      const dir = ctx.changed.to >= ctx.changed.from ? 'raising' : 'lowering';
      return (
        `${dir} ${ctx.changed.label ?? ctx.changed.id} moved the call price to ${metric}. ` +
        `Moneyness and volatility dominate this no-dividend European option sandbox; rate and maturity tune discounting and time value.`
      );
    }
    return (
      `At spot ${ctx.params.spot} versus strike ${ctx.params.strike}, the call price is ${metric}. ` +
      `The strongest drivers are moneyness and volatility, with Vega showing how much one volatility point changes the option value.`
    );
  }

  const ruin = ctx.metrics.find((m) => m.id === 'p_ruin')?.value ?? 'n/a';
  const sigma = ctx.params.sigma;
  if (ctx.changed) {
    const dir = ctx.changed.to >= ctx.changed.from ? 'raising' : 'lowering';
    return (
      `Volatility is the dominant driver here. ${dir} ${ctx.changed.label ?? ctx.changed.id} ` +
      `to ${ctx.changed.to} widened the outcome cone and moved P(ruin) to ${ruin}. ` +
      `Drift shifts the distribution, but it only partially offsets wider dispersion at σ=${sigma}%.`
    );
  }
  return (
    `At σ=${sigma}% the loss cone is moderate and P(ruin) sits at ${ruin}. ` +
    `Volatility is usually the strongest tail driver here, while drift moves the distribution up or down.`
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
          { role: 'user', content: JSON.stringify({ templateId: ctx.templateId, params: ctx.params, metrics: ctx.metrics, changed: ctx.changed }) },
        ],
        stream: true,
        reasoningEffort: 'low',
        temperature: 0.2,
        maxTokens: 190,
        signal: ctx.signal,
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
    if (isAbortError(err)) return { text: streamed };
    onEvent({ agent: 'sensitivity', status: 'error', error: errMsg(err) });
    return { text: streamed };
  }
}
