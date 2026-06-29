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
import { runPipeline, runTweak } from '../core/pipeline';
import type { ParamSet } from '../core/contract';
import { monteCarlo } from '../templates/monte-carlo';
import { liveEventSource, type EventSource } from './eventSource';
import type { OnEvent } from './types';

export type Depth = 'entry' | 'expert';

/** Default ParamSet straight from the template's declared slider values. */
function paramsFromSliders(): ParamSet {
  const params: ParamSet = {};
  for (const slider of monteCarlo.spec.sliders) params[slider.id] = slider.value;
  return params;
}

/**
 * A real EventSource backed by the live pipeline. `depth` selects entry/expert prose in runTweak.
 * The returned stop() flips an aborted flag so late agent events are dropped after replay/unmount.
 */
export function realPipelineSource(depth: Depth = 'entry'): EventSource {
  return liveEventSource((onEvent: OnEvent) => {
    let aborted = false;
    const forward: OnEvent = (e) => {
      if (!aborted) onEvent(e);
    };

    const params = paramsFromSliders();
    const sim = monteCarlo.run(params);

    (async () => {
      try {
        await runPipeline({ intent: 'Explore portfolio ruin risk' }, forward);
        if (aborted) return;
        await runTweak(
          { templateId: 'monte-carlo', params, metrics: sim.metrics, raw: sim.raw, depth },
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
