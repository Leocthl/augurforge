/**
 * mortality.ts — STUB. [OWNER: B]  TODO(branch: feat/template-mortality)
 * Implement run() + render2D/render3D following src/templates/monte-carlo.ts.
 */
import type { DashboardSpec, ParamSet, SimResult, TemplateModule } from '../core/contract';
import { comingSoonRenderer } from './_stub';

const spec: DashboardSpec = {
  templateId: 'mortality',
  title: 'Mortality / Survival Curve',
  views: ['2d'],
  defaultView: '2d',
  sliders: [{ id: 'age', label: 'Age', min: 0, max: 100, step: 1, value: 50 }],
  explainer: { entry: 'The chance of surviving to each age.', expert: 'TODO(branch: feat/template-mortality): expert narrative.' },
};

function run(_params: ParamSet): SimResult {
  // TODO(branch: feat/template-mortality): real client-side math.
  return { metrics: [{ id: 'placeholder', label: 'Status', value: 'stub' }], raw: {} };
}

export const mortality: TemplateModule = {
  id: 'mortality',
  spec,
  run,
  render2D: (el) => comingSoonRenderer(el, 'Mortality / Survival Curve — coming soon'),
};

export default mortality;