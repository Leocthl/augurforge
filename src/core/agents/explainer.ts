import type { OnEvent, ProseResult } from '../contract';
import { chat } from '../cerebras';
import type { TweakContext } from '../pipeline';
import { errMsg, isAbortError, summarizeRawForAgents } from './shared';

const SYSTEM =
  'You are AugurForge Explainer. Write a clear streaming narrative at the requested depth, entry or expert. ' +
  'Use only supplied params and metrics. Keep it practical and label this as decision-support, not advice.';

function mockText(ctx: TweakContext): string {
  if (ctx.templateId.startsWith('generated:sir')) {
    const peak = ctx.metrics.find((m) => m.id === 'peak_infected')?.value ?? 'n/a';
    const peakDay = ctx.metrics.find((m) => m.id === 'peak_day')?.value ?? 'n/a';
    const attackRate = ctx.metrics.find((m) => m.id === 'attack_rate')?.value ?? 'n/a';
    if (ctx.depth === 'expert') {
      return (
        `Generated SIR sandbox: population=${ctx.params.population}, initial infected=${ctx.params.initialInfected}, ` +
        `R0=${ctx.params.reproductionNumber}, recovery=${ctx.params.recoveryDays} days. Peak infected is ${peak} around ${peakDay}, ` +
        `with final attack rate ${attackRate}. This is deterministic compartment math for scenario exploration, not a medical forecast.`
      );
    }
    return (
      `Gemma generated this non-finance SIR sandbox, then AugurForge ran deterministic compartment math in the browser. ` +
      `At the current sliders, infections peak at ${peak} around ${peakDay}; the final attack rate is ${attackRate}.`
    );
  }

  if (ctx.templateId.startsWith('generated:black-scholes')) {
    const call = ctx.metrics.find((m) => m.id === 'call_price')?.value ?? 'n/a';
    const put = ctx.metrics.find((m) => m.id === 'put_price')?.value ?? 'n/a';
    const delta = ctx.metrics.find((m) => m.id === 'call_delta')?.value ?? 'n/a';
    if (ctx.depth === 'expert') {
      return (
        `Generated Black-Scholes sandbox: spot=${ctx.params.spot}, strike=${ctx.params.strike}, vol=${ctx.params.volatility}%, ` +
        `rate=${ctx.params.rate}%, dividend yield=${ctx.params.dividendYield ?? 0}%, maturity=${ctx.params.maturity}y. ` +
        `The call is ${call}, the put is ${put}, and call delta is ${delta}. Treat this as a fast closed-form sensitivity view; ` +
        `constant volatility, European exercise, and continuous compounding are assumptions to review.`
      );
    }
    return (
      `Gemma generated this option-pricing sandbox, then AugurForge ran deterministic Black-Scholes math in the browser. ` +
      `At the current sliders, the call is ${call} and the put is ${put}; move spot, strike, or volatility to see the curve reprice instantly.`
    );
  }

  const ruin = ctx.metrics.find((m) => m.id === 'p_ruin')?.value ?? 'n/a';
  const varMetric = ctx.metrics.find((m) => m.id === 'var_95')?.value ?? 'n/a';
  const esMetric = ctx.metrics.find((m) => m.id === 'es_95')?.value ?? 'n/a';
  const audit = summarizeRawForAgents(ctx.raw);
  const nPaths = typeof audit.nPaths === 'number' ? audit.nPaths.toLocaleString() : 'seeded';
  const sigma = ctx.params.sigma;
  if (ctx.depth === 'expert') {
    return (
      `Under geometric Brownian motion with σ=${sigma}% and drift μ=${ctx.params.drift}%, the ` +
      `${ctx.params.horizon}-year terminal distribution is right-skewed. Metrics use ${nPaths} daily paths with antithetic variates and Brownian-bridge barrier correction. ` +
      `The 95% VaR is ${varMetric}, 95% ES is ${esMetric}, and modelled ruin probability is ${ruin}. Higher σ usually raises barrier and left-tail risk sharply.`
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
          {
            role: 'user',
            content: JSON.stringify({
              templateId: ctx.templateId,
              depth: ctx.depth ?? 'entry',
              params: ctx.params,
              metrics: ctx.metrics,
              modelAudit: summarizeRawForAgents(ctx.raw),
            }),
          },
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
