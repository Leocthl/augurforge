/**
 * compound-interest.ts — STUB. [OWNER: B]  TODO(branch: feat/template-compound-interest)
 * Implement run() + render2D/render3D following src/templates/monte-carlo.ts.
 */
import type { DashboardSpec, ParamSet, SimResult, TemplateModule } from '../core/contract';
import { comingSoonRenderer } from './_stub';

const spec: DashboardSpec = {
  templateId: 'compound-interest',
  title: 'Compound Interest / TVM',
  views: ['2d'],
  defaultView: '2d',
  sliders: [{ id: 'rate', label: 'Interest rate', min: 0, max: 100, step: 1, value: 50 }],
  explainer: { entry: 'How money grows over time at a given rate.', expert: 'TODO(branch: feat/template-compound-interest): expert narrative.' },
};

function run(_params: ParamSet): SimResult {
  // TODO(branch: feat/template-compound-interest): real client-side math.
  return { metrics: [{ id: 'placeholder', label: 'Status', value: 'stub' }], raw: {} };
}

export const compoundInterest: TemplateModule = {
  id: 'compound-interest',
  spec,
  run,
  render2D: (el) => comingSoonRenderer(el, 'Compound Interest / TVM — coming soon'),
};

export default compoundInterest;