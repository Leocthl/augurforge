/**
 * pipeline.ts — the agent loop with the render-on-resolve emitter. [OWNER: A]
 *
 * Build cascade is sequential where dependent (orchestrator → modeler → visualizer),
 * producing the DashboardSpec. The interpretive agents (sensitivity · risk · explainer)
 * then fire in PARALLEL on each slider release (≤3 calls, debounced upstream).
 *
 * Render-on-resolve: every agent emits start/token/done/error via OnEvent and the UI
 * paints that panel the instant the event lands — we never await Promise.all before
 * showing results. The deterministic numbers come from the client-side template.run();
 * the agents only interpret them.
 */
import type {
  OnEvent,
  ParamSet,
  Metric,
  OrchestratorResult,
  ModelerResult,
  VisualizerResult,
} from './contract';
import { runOrchestrator } from './agents/orchestrator';
import { runModeler } from './agents/modeler';
import { runVisualizer } from './agents/visualizer';
import { runSensitivity } from './agents/sensitivity';
import { runRisk } from './agents/risk';
import { runExplainer } from './agents/explainer';
import {
  createGeneratedTemplate,
  isGeneratedTemplateId,
  type GeneratedModelerResult,
  type GeneratedTemplateBuild,
} from './generative';

export interface PipelineInput {
  intent?: string;
  data?: Record<string, unknown> | string;
  /** base64 data URI for the Modeler vision call. */
  imageDataUrl?: string;
  /** Optional explicit template override. */
  templateId?: string;
  /** "generate" forces the safe runtime-generated model path. */
  mode?: 'auto' | 'library' | 'generate';
  /** Superseded cascades are cancelled by App so we do not burn live RPM. */
  signal?: AbortSignal;
}

export interface TweakContext {
  templateId: string;
  params: ParamSet;
  /** Current headline metrics from template.run() — what the agents interpret. */
  metrics: Metric[];
  /** Compact model/audit data from SimResult.raw; agents must not invent beyond it. */
  raw?: Record<string, unknown>;
  depth?: 'entry' | 'expert';
  /** The slider that just changed (for the sensitivity narrative). */
  changed?: { id: string; label?: string; from: number; to: number };
  signal?: AbortSignal;
}

export interface PipelineResult {
  orchestrator: OrchestratorResult;
  modeler: ModelerResult;
  spec: VisualizerResult;
  generatedTemplate?: GeneratedTemplateBuild;
}

/** Initial build: model selection → parameters → dashboard spec. */
export async function runPipeline(input: PipelineInput, onEvent: OnEvent): Promise<PipelineResult> {
  const orchestrator = await runOrchestrator(input, onEvent);
  const modeler = await runModeler({ ...input, templateId: orchestrator.templateId }, onEvent);
  const spec = await runVisualizer(modeler, onEvent, input.signal);
  if (isGeneratedTemplateId(spec.templateId)) {
    const generatedTemplate = createGeneratedTemplate(
      (modeler as GeneratedModelerResult).generatedSpec,
      input.intent,
      spec,
    );
    return {
      orchestrator,
      modeler,
      spec: generatedTemplate.template.spec,
      generatedTemplate,
    };
  }
  return { orchestrator, modeler, spec };
}

/** Slider-release loop: sensitivity · risk · explainer, parallel + streaming. */
export async function runTweak(ctx: TweakContext, onEvent: OnEvent): Promise<void> {
  await Promise.allSettled([
    runSensitivity(ctx, onEvent),
    runRisk(ctx, onEvent),
    runExplainer(ctx, onEvent),
  ]);
}
