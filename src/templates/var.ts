/**
 * var.ts — STUB. [OWNER: B]  TODO(branch: feat/template-var)
 * Implement run() + render2D/render3D following src/templates/monte-carlo.ts.
 */
import type { DashboardSpec, ParamSet, SimResult, TemplateModule } from '../core/contract';
import { comingSoonRenderer } from './_stub';

const spec: DashboardSpec = {
  templateId: 'var',
  title: 'Value at Risk / Expected Shortfall',
  views: ['2d'],
  defaultView: '2d',
  sliders: [{ id: 'confidence', label: 'Confidence level', min: 0, max: 100, step: 1, value: 50 }],
  explainer: { entry: 'The worst expected loss at a confidence level.', expert: 'TODO(branch: feat/template-var): expert narrative.' },
};

function run(_params: ParamSet): SimResult {
  // TODO(branch: feat/template-var): real client-side math.
  return { metrics: [{ id: 'placeholder', label: 'Status', value: 'stub' }], raw: {} };
}

export const valueAtRisk: TemplateModule = {
  id: 'var',
  spec,
  run,
  render2D: (el) => comingSoonRenderer(el, 'Value at Risk / Expected Shortfall — coming soon'),
};

export default valueAtRisk;