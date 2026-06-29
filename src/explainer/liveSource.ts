/**
 * liveSource.ts — bridges AugurForge's REAL pipeline into the thinking graph. [OWNER: B / explainer]
 *
 * Builds a `register(onEvent)` for `liveEventSource`: it derives params from the Monte Carlo
 * template's slider defaults, runs the deterministic client-side sim to get the headline metrics,
 * then drives the real agent cascade — `runPipeline` (orchestrator → modeler → visualizer) followed
 * by `runTweak` (sensitivity · risk · explainer). Every AgentEvent the pipeline emits is forwarded
 * straight into the explainer reducer.
 *
 * Works fully OFFLINE: with VITE_USE_LIVE=false the agents still stream real start/token/done events
 * from their mock implementations. With a key + VITE_USE_LIVE=true the same code path streams live
 * Cerebras tokens — no changes here.
 */
import { runPipeline, runTweak, type PipelineInput } from '../core/pipeline';
import type { AgentEvent, Metric, ParamSet } from '../core/contract';
import type { DashboardSpec } from '../core/contract';
import { getTemplate } from '../templates';
import { liveEventSource, type EventSource } from './eventSource';
import type { OnEvent } from './types';

export type Depth = 'entry' | 'expert';

/** Default ParamSet straight from the chosen spec's declared slider values. */
function paramsFromSpec(spec: DashboardSpec): ParamSet {
  const params: ParamSet = {};
  for (const slider of spec.sliders) params[slider.id] = slider.value;
  return params;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function resultText(result: unknown): string {
  return isRecord(result) && typeof result.text === 'string' ? result.text.trim() : '';
}

function metric(metrics: Metric[], id: string): string {
  return metrics.find((m) => m.id === id)?.value ?? 'n/a';
}

function liveFallbackText(agent: 'sensitivity' | 'explainer', depth: Depth, params: ParamSet, metrics: Metric[], raw?: Record<string, unknown>): string {
  const sigma = params.sigma ?? 'n/a';
  const drift = params.drift ?? 'n/a';
  const horizon = params.horizon ?? 'n/a';
  const ruin = metric(metrics, 'p_ruin');
  const var95 = metric(metrics, 'var_95');
  const es95 = metric(metrics, 'es_95');
  const nPaths = typeof raw?.nPaths === 'number' ? raw.nPaths.toLocaleString() : '10,000';

  if (agent === 'sensitivity') {
    return (
      `Live fallback: volatility is the dominant driver in this run. At sigma=${sigma}% and drift=${drift}%, ` +
      `the ${horizon}-year scenario gives P(ruin)=${ruin}, 95% VaR=${var95}, and 95% ES=${es95}; drift moves the center, ` +
      'but dispersion and barrier crossings dominate the tail. Decision-support, not advice.'
    );
  }

  if (depth === 'expert') {
    return (
      `Live fallback: Gemma returned telemetry but no prose tokens, so the explainer is grounding this view in the deterministic browser math. ` +
      `The GBM run uses ${nPaths} seeded paths, sigma=${sigma}%, drift=${drift}%, horizon=${horizon} years, antithetic variates, and Brownian-bridge barrier correction. ` +
      `P(ruin)=${ruin}, 95% VaR=${var95}, and 95% ES=${es95}; treat this as fast scenario exploration, not actuarial or investment advice.`
    );
  }

  return (
    `Live fallback: Gemma/Cerebras completed the call, but the streamed prose body was empty, so this explanation uses the live simulation metrics. ` +
    `With volatility at ${sigma}%, about ${ruin} of paths cross the ruin floor; the 95% VaR is ${var95} and 95% ES is ${es95}. ` +
    'The numbers come from deterministic browser math, and the interpretation is decision-support, not advice.'
  );
}

function enrichProseDone(e: AgentEvent, params: ParamSet, metrics: Metric[], depth: Depth, raw?: Record<string, unknown>): AgentEvent {
  if (e.status !== 'done' || (e.agent !== 'sensitivity' && e.agent !== 'explainer')) return e;
  const existing = resultText(e.result);
  const text = existing || liveFallbackText(e.agent, depth, params, metrics, raw);
  return {
    ...e,
    result: {
      ...(isRecord(e.result) ? e.result : {}),
      text,
      params,
      metrics,
      fallback: !existing,
    },
  };
}

/**
 * A real EventSource backed by the live pipeline. `depth` selects entry/expert prose in runTweak.
 * The returned stop() flips an aborted flag so late agent events are dropped after replay/unmount.
 */
export function realPipelineSource(depth: Depth = 'entry', input?: PipelineInput): EventSource {
  return liveEventSource((onEvent: OnEvent) => {
    let aborted = false;
    let params: ParamSet = {};
    let metrics: Metric[] = [];
    let raw: Record<string, unknown> | undefined;
    const forward: OnEvent = (e) => {
      if (aborted) return;
      const enriched = enrichProseDone(e, params, metrics, depth, raw);
      if (e.status === 'done' && (e.agent === 'sensitivity' || e.agent === 'explainer') && !resultText(e.result)) {
        onEvent({ agent: e.agent, status: 'token', delta: resultText(enriched.result) });
      }
      onEvent(enriched);
    };

    (async () => {
      try {
        const res = await runPipeline(input ?? { intent: 'Explore portfolio ruin risk' }, forward);
        if (aborted) return;
        const tmpl = res.generatedTemplate?.template ?? getTemplate(res.spec.templateId);
        params = paramsFromSpec(res.spec);
        const sim = tmpl.run(params);
        metrics = sim.metrics;
        raw = sim.raw;
        await runTweak(
          { templateId: res.spec.templateId, params, metrics, raw, depth },
          forward,
        );
      } catch (err) {
        if (aborted) return;
        forward({
          agent: 'explainer',
          status: 'error',
          error: err instanceof Error ? err.message : 'pipeline failed',
        });
      }
    })();

    return () => {
      aborted = true;
    };
  });
}
