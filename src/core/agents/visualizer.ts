import type { DashboardSpec, OnEvent, ModelerResult, SliderDef, VisualizerResult } from '../contract';
import { chat } from '../cerebras';
import { createGeneratedTemplate, isGeneratedTemplateId, type GeneratedModelerResult } from '../generative';
import {
  cleanString,
  errMsg,
  isAbortError,
  isRecord,
  jsonSchema,
  objectSchema,
  stringEnum,
} from './shared';

const SYSTEM =
  'You are AugurForge Visualizer. Given a validated model spec, design the dashboard labels, ' +
  'view choices, and two-depth explainer. Use 3d only when the renderer supports it. ' +
  'For generated:black-scholes use 2d only. Return only strict JSON DashboardSpec.';

const SLIDER_SCHEMA = objectSchema(
  {
    id: { type: 'string' },
    label: { type: 'string' },
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number' },
    value: { type: 'number' },
    unit: { type: 'string' },
  },
  ['id', 'label', 'min', 'max', 'step', 'value', 'unit'],
);

const RESPONSE_FORMAT = jsonSchema(
  'augurforge_visualizer',
  objectSchema(
    {
      templateId: stringEnum(['monte-carlo', 'generated:black-scholes']),
      title: { type: 'string' },
      subtitle: { type: 'string' },
      sliders: { type: 'array', items: SLIDER_SCHEMA },
      views: { type: 'array', items: stringEnum(['2d', '3d']) },
      defaultView: stringEnum(['2d', '3d']),
      explainer: objectSchema(
        {
          entry: { type: 'string' },
          expert: { type: 'string' },
        },
        ['entry', 'expert'],
      ),
    },
    ['templateId', 'title', 'subtitle', 'sliders', 'views', 'defaultView', 'explainer'],
  ),
);

function mockSpec(modeler: ModelerResult): VisualizerResult {
  if (isGeneratedTemplateId(modeler.templateId)) {
    return createGeneratedTemplate((modeler as GeneratedModelerResult).generatedSpec).template.spec;
  }
  return {
    templateId: modeler.templateId,
    title: 'Monte Carlo - Portfolio Ruin (GBM)',
    subtitle: 'Daily GBM, 10,000 metric paths, Brownian bridge barrier correction',
    views: ['2d', '3d'],
    defaultView: '2d',
    sliders: modeler.sliders,
    explainer: {
      entry:
        'This shows many possible market journeys over time. Most paths grow, but some dip badly; the share that crosses the continuously approximated floor is the ruin chance.',
      expert:
        'A daily-stepped GBM ensemble of 10,000 paths with antithetic variates. Barrier breaches use a Brownian bridge correction between daily endpoints; VaR and ES are terminal-loss distribution metrics.',
    },
  };
}

function validate(json: unknown, fallback: DashboardSpec): DashboardSpec {
  if (!isRecord(json)) return fallback;
  const views = sanitizeViews(json.views, fallback.views);
  const defaultView = json.defaultView === '3d' && views.includes('3d') ? '3d' : '2d';
  return {
    templateId:
      json.templateId === fallback.templateId || json.templateId === 'monte-carlo' || json.templateId === 'generated:black-scholes'
        ? String(json.templateId)
        : fallback.templateId,
    title: cleanString(json.title, fallback.title, 80),
    subtitle: cleanString(json.subtitle, fallback.subtitle ?? '', 130),
    sliders: sanitizeSliders(json.sliders, fallback.sliders),
    views,
    defaultView,
    explainer: isRecord(json.explainer)
      ? {
          entry: cleanString(json.explainer.entry, fallback.explainer?.entry ?? '', 380),
          expert: cleanString(json.explainer.expert, fallback.explainer?.expert ?? '', 560),
        }
      : fallback.explainer,
  };
}

function sanitizeViews(raw: unknown, fallback: DashboardSpec['views']): DashboardSpec['views'] {
  if (!Array.isArray(raw)) return fallback;
  const values = raw.filter((v): v is '2d' | '3d' => v === '2d' || v === '3d');
  return values.length ? Array.from(new Set(values)) : fallback;
}

function sanitizeSliders(raw: unknown, fallback: SliderDef[]): SliderDef[] {
  if (!Array.isArray(raw)) return fallback;
  const byId = new Map(fallback.map((s) => [s.id, s]));
  const next: SliderDef[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    const base = byId.get(item.id);
    if (!base) continue;
    next.push({
      ...base,
      label: cleanString(item.label, base.label, 38),
      value: typeof item.value === 'number' ? Math.min(base.max, Math.max(base.min, item.value)) : base.value,
    });
  }
  return next.length === fallback.length ? next : fallback;
}

export async function runVisualizer(
  modeler: ModelerResult,
  onEvent: OnEvent,
  signal?: AbortSignal,
): Promise<VisualizerResult> {
  onEvent({ agent: 'visualizer', status: 'start' });
  const mockResult = mockSpec(modeler);
  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            templateId: modeler.templateId,
            params: modeler.params,
            sliders: modeler.sliders,
            generatedSpec: (modeler as GeneratedModelerResult).generatedSpec,
          }),
        },
      ],
      responseFormat: RESPONSE_FORMAT,
      reasoningEffort: 'low',
      temperature: 0,
      maxTokens: 640,
      signal,
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = validate(res.json, mockResult);
    onEvent({ agent: 'visualizer', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    if (isAbortError(err)) return mockResult;
    onEvent({ agent: 'visualizer', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}
