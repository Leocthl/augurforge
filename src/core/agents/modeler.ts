/**
 * modeler.ts — the multimodal HERO call. [OWNER: A]
 * Sees the data (and optional chart/sketch image) and infers model + params + ranges.
 * STUB: returns the Monte Carlo template defaults; image is forwarded in LIVE mode.
 * TODO(branch: feat/agents): real vision prompt + strict JSON schema per BUILD_SPEC §7.
 */
import type { OnEvent, ModelerResult, ParamSet, SliderDef } from '../contract';
import { chat, type ContentPart } from '../cerebras';
import type { PipelineInput } from '../pipeline';
import { coerce, describeInput, errMsg } from './shared';

const SYSTEM =
  'You are AugurForge’s Modeler. Read the data and any attached chart/sketch image and ' +
  'infer the model, its parameters, and sensible slider ranges. Return strict JSON ' +
  '{templateId,params,sliders,mapping}.'; // TODO(branch: feat/agents)

export async function runModeler(input: PipelineInput, onEvent: OnEvent): Promise<ModelerResult> {
  onEvent({ agent: 'modeler', status: 'start' });

  const sliders: SliderDef[] = [
    { id: 'sigma', label: 'Volatility (σ)', min: 5, max: 40, step: 1, value: 18, unit: '%' },
    { id: 'drift', label: 'Drift (μ)', min: -5, max: 15, step: 1, value: 7, unit: '%' },
    { id: 'horizon', label: 'Horizon', min: 5, max: 40, step: 1, value: 30, unit: 'yr' },
  ];
  const params: ParamSet = Object.fromEntries(sliders.map((s) => [s.id, s.value]));
  const mockResult: ModelerResult = {
    templateId: 'monte-carlo',
    params,
    sliders,
    mapping: { source: 'Inferred GBM drift/volatility from the supplied return series.' },
  };

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
      reasoningEffort: 'low',
      mock: { text: JSON.stringify(mockResult), json: mockResult },
    });
    const result = coerce<ModelerResult>(res.json, mockResult, 'templateId');
    onEvent({ agent: 'modeler', status: 'done', result, timeInfo: res.timeInfo });
    return result;
  } catch (err) {
    onEvent({ agent: 'modeler', status: 'error', error: errMsg(err) });
    return mockResult;
  }
}