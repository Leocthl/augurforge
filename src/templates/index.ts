/**
 * index.ts — template registry. Adding a model = adding a TemplateModule here
 * (or generating one at runtime via the generative path). [OWNER: A scaffolds, B extends]
 */
import type { TemplateModule } from '../core/contract';
import { monteCarlo } from './monte-carlo';
import { mortality } from './mortality';
import { aggregateLoss } from './aggregate-loss';
import { valueAtRisk } from './var';
import { compoundInterest } from './compound-interest';

export const templates: Record<string, TemplateModule> = {
  [monteCarlo.id]: monteCarlo,
  [compoundInterest.id]: compoundInterest,
  [mortality.id]: mortality,
  [aggregateLoss.id]: aggregateLoss,
  [valueAtRisk.id]: valueAtRisk,
};

export const templateList: TemplateModule[] = Object.values(templates);

/** Resolve a template by id, falling back to the Monte Carlo hero. */
export function getTemplate(id: string | undefined): TemplateModule {
  return (id && templates[id]) || monteCarlo;
}