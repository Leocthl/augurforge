import { describe, expect, it } from 'vitest';
import { GENERATED_SIR_ID, createGeneratedTemplate, fallbackGeneratedSpec } from './generative';

describe('generated template compiler', () => {
  it('routes epidemic prompts to the deterministic SIR runtime', () => {
    const spec = fallbackGeneratedSpec('Build a non-finance SIR epidemic model');
    const build = createGeneratedTemplate(spec);
    expect(build.template.id).toBe(GENERATED_SIR_ID);
    expect(build.template.spec.templateId).toBe(GENERATED_SIR_ID);

    const sim = build.template.run(Object.fromEntries(build.template.spec.sliders.map((s) => [s.id, s.value])));
    expect(sim.metrics.some((metric) => metric.id === 'peak_infected')).toBe(true);
    expect(sim.series?.map((series) => series.name)).toEqual(['susceptible', 'infected', 'recovered']);
    expect(sim.raw?.modelKind).toBe('sir');
    expect(Array.isArray(sim.raw?.shapes)).toBe(true);
  });
});

