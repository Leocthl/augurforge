import type { OnEvent, ModelerResult, ParamSet, SliderDef } from '../contract';
import { chat, type ContentPart } from '../cerebras';
import type { PipelineInput } from '../pipeline';
import {
  GENERATED_BLACK_SCHOLES_ID,
  fallbackGeneratedSpec,
  wantsGeneratedModel,
  type GeneratedModelerResult,
  type GeneratedTemplateSpec,
} from '../generative';
import {
  cleanString,
  describeInput,
  errMsg,
  isAbortError,
  isRecord,
  jsonSchema,
  objectSchema,
  stringEnum,
} from './shared';

const SYSTEM =
  'You are AugurForge Modeler. Read text, data summaries, and any attached chart image. ' +
  'Infer safe slider defaults and a concise mapping from source fields to model parameters. ' +
  'For generated:black-scholes, emit a declarative generatedSpec only: modelKind, title, subtitle, sliders, explainer, mapping. ' +
  'Never write executable code. Return only strict JSON.';

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

const PARAMS_SCHEMA = objectSchema(
  {
    sigma: { type: 'number' },
    drift: { type: 'number' },
    horizon: { type: 'number' },
    spot: { type: 'number' },
    strike: { type: 'number' },
    volatility: { type: 'number' },
    rate: { type: 'number' },
    maturity: { type: 'number' },
  },
  [],
);

const MAPPING_SCHEMA = objectSchema(
  {
    source: { type: 'string' },
    generated: { type: 'string' },
    model: { type: 'string' },
    vision: { type: 'string' },
    data: { type: 'string' },
    assumptions: { type: 'string' },
    parameters: { type: 'string' },
  },
  [],
);

const GENERATED_SPEC_SCHEMA = objectSchema(
  {
    id: { type: 'string' },
    modelKind: stringEnum(['black-scholes']),
    title: { type: 'string' },
    subtitle: { type: 'string' },
    sliders: { type: 'array', items: SLIDER_SCHEMA },
    explainer: objectSchema(
      {
        entry: { type: 'string' },
        expert: { type: 'string' },
      },
      ['entry', 'expert'],
    ),
    mapping: MAPPING_SCHEMA,
  },
  ['id', 'modelKind', 'title', 'subtitle', 'sliders', 'explainer', 'mapping'],
);

const RESPONSE_FORMAT = jsonSchema(
  'augurforge_modeler',
  objectSchema(
    {
      templateId: stringEnum(['monte-carlo', GENERATED_BLACK_SCHOLES_ID]),
      params: PARAMS_SCHEMA,
      sliders: { type: 'array', items: SLIDER_SCHEMA },
      mapping: MAPPING_SCHEMA,
      generatedSpec: GENERATED_SPEC_SCHEMA,
    },
    ['templateId', 'params', 'sliders', 'mapping', 'generatedSpec'],
  ),
);

const MONTE_CARLO_SLIDERS: SliderDef[] = [
  { id: 'sigma', label: 'Volatility (sigma)', min: 5, max: 40, step: 1, value: 18, unit: '%' },
  { id: 'drift', label: 'Drift (mu)', min: -5, max: 15, step: 1, value: 7, unit: '%' },
  { id: 'horizon', label: 'Horizon', min: 5, max: 40, step: 1, value: 30, unit: 'yr' },
];

function paramsFromSliders(sliders: SliderDef[]): ParamSet {
  return Object.fromEntries(sliders.map((s) => [s.id, s.value]));
}

function mockModel(input: PipelineInput): GeneratedModelerResult {
  const generated = wantsGeneratedModel(input.intent, input.mode) || input.templateId === GENERATED_BLACK_SCHOLES_ID;
  if (generated) {
    const generatedSpec = fallbackGeneratedSpec(input.intent);
    const sliders = generatedSpec.sliders ?? [];
    return {
      templateId: GENERATED_BLACK_SCHOLES_ID,
      params: paramsFromSliders(sliders),
      sliders,
      mapping: generatedSpec.mapping,
      generatedSpec,
    };
  }
  return {
    templateId: 'monte-carlo',
    params: paramsFromSliders(MONTE_CARLO_SLIDERS),
    sliders: MONTE_CARLO_SLIDERS,
    mapping: { source: 'Inferred GBM drift/volatility from the supplied return series.' },
    generatedSpec: fallbackGeneratedSpec(input.intent),
  };
}

function validate(json: unknown, fallback: GeneratedModelerResult): GeneratedModelerResult {
  if (!isRecord(json)) return fallback;
  const templateId =
    json.templateId === GENERATED_BLACK_SCHOLES_ID || json.templateId === 'monte-carlo'
      ? json.templateId
      : fallback.templateId;
  const fallbackSliders = templateId === GENERATED_BLACK_SCHOLES_ID ? fallbackGeneratedSpec().sliders ?? [] : MONTE_CARLO_SLIDERS;
  const sliders = sanitizeSliders(json.sliders, fallbackSliders);
  return {
    templateId,
    params: sanitizeParams(json.params, sliders),
    sliders,
    mapping: sanitizeMapping(json.mapping, fallback.mapping),
    generatedSpec:
      templateId === GENERATED_BLACK_SCHOLES_ID
        ? sanitizeGeneratedSpec(json.generatedSpec, fallback.generatedSpec ?? fallbackGeneratedSpec())
        : fallback.generatedSpec,
  };
}

function sanitizeGeneratedSpec(raw: unknown, fallback: GeneratedTemplateSpec): GeneratedTemplateSpec {
  if (!isRecord(raw)) return fallback;
  return {
    id: GENERATED_BLACK_SCHOLES_ID,
    modelKind: raw.modelKind === 'black-scholes' ? 'black-scholes' : 'black-scholes',
    title: cleanString(raw.title, fallback.title ?? 'Generated Black-Scholes Option Sandbox', 72),
    subtitle: cleanString(raw.subtitle, fallback.subtitle ?? 'Deterministic Black-Scholes math', 120),
    sliders: sanitizeSliders(raw.sliders, fallback.sliders ?? []),
    explainer: isRecord(raw.explainer)
      ? {
          entry: cleanString(raw.explainer.entry, fallback.explainer?.entry ?? '', 360),
          expert: cleanString(raw.explainer.expert, fallback.explainer?.expert ?? '', 520),
        }
      : fallback.explainer,
    mapping: sanitizeMapping(raw.mapping, fallback.mapping),
  };
}

function sanitizeSliders(raw: unknown, fallback: SliderDef[]): SliderDef[] {
  if (!Array.isArray(raw)) return fallback;
  const ids = new Set(fallback.map((s) => s.id));
  const cleaned: SliderDef[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string' || !ids.has(item.id)) continue;
    const base = fallback.find((s) => s.id === item.id);
    if (!base) continue;
    const min = finite(item.min, base.min);
    const max = Math.max(min + base.step, finite(item.max, base.max));
    cleaned.push({
      id: base.id,
      label: cleanString(item.label, base.label, 36),
      min,
      max,
      step: finite(item.step, base.step),
      value: Math.min(max, Math.max(min, finite(item.value, base.value))),
      unit: typeof item.unit === 'string' ? item.unit.slice(0, 6) : base.unit,
    });
  }
  return cleaned.length === fallback.length ? cleaned : fallback;
}

function sanitizeParams(raw: unknown, sliders: SliderDef[]): ParamSet {
  const params = paramsFromSliders(sliders);
  if (!isRecord(raw)) return params;
  for (const slider of sliders) {
    const value = raw[slider.id];
    if (typeof value === 'number' && Number.isFinite(value)) {
      params[slider.id] = Math.min(slider.max, Math.max(slider.min, value));
    }
  }
  return params;
}

function sanitizeMapping(raw: unknown, fallback?: Record<string, string>): Record<string, string> {
  if (!isRecord(raw)) return fallback ?? {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 8)) {
    if (typeof value === 'string') out[key.slice(0, 36)] = value.slice(0, 160);
  }
  return Object.keys(out).length ? out : fallback ?? {};
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function runModeler(input: PipelineInput, onEvent: OnEvent): Promise<ModelerResult> {
  onEvent({ agent: 'modeler', status: 'start' });
  const mockResult = mockModel(input);

  // Build a multimodal user message; the image_url part is the hero of this call.
  const userParts: ContentPart[] = [{ type: 'text', text: describeInput(input) }];
  if (input.imageDataUrl) {
    userParts.push({ type: 'image_url', image_url: { url: input.imageDataUrl } });
  }

  try {
    const res = await chat({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userParts },
      ],
      responseFormat: RESPONSE_FORMAT,
      reasoningEffort: 'low',
      temperature: 0,
      maxTokens: 720,
      signal: input.signal,
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = validate(res.json, mockResult);
    onEvent({ agent: 'modeler', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    if (isAbortError(err)) return mockResult;
    onEvent({ agent: 'modeler', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}
