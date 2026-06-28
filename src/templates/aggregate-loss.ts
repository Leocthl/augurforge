/**
 * aggregate-loss.ts — STUB. [OWNER: B]  TODO(branch: feat/template-aggregate-loss)
 * Implement run() + render2D/render3D following src/templates/monte-carlo.ts.
 */
import type { DashboardSpec, ParamSet, SimResult, TemplateModule } from '../core/contract';
import { comingSoonRenderer } from './_stub';

const spec: DashboardSpec = {
  templateId: 'aggregate-loss',
  title: 'Aggregate Loss / Reserving',
  views: ['2d'],
  defaultView: '2d',
  sliders: [{ id: 'frequency', label: 'Claim frequency', min: 0, max: 100, step: 1, value: 50 }],
  explainer: { entry: 'The distribution of total insurance losses.', expert: 'TODO(branch: feat/template-aggregate-loss): expert narrative.' },
};

function run(_params: ParamSet): SimResult {
  // TODO(branch: feat/template-aggregate-loss): real client-side math.
  return { metrics: [{ id: 'placeholder', label: 'Status', value: 'stub' }], raw: {} };
}

export const aggregateLoss: TemplateModule = {
  id: 'aggregate-loss',
  spec,
  run,
  render2D: (el) => comingSoonRenderer(el, 'Aggregate Loss / Reserving — coming soon'),
};

export default aggregateLoss;