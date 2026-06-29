import { describe, expect, it } from 'vitest';
import { GENERATED_MARKET_RISK_ID, GENERATED_SIR_ID, createGeneratedTemplate, fallbackGeneratedSpec } from './generative';

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

  it('routes financial report prompts to the market-risk runtime', () => {
    const spec = fallbackGeneratedSpec('Use this one-page market risk section to build an interest-rate and FX VaR model');
    const build = createGeneratedTemplate(spec);
    expect(build.template.id).toBe(GENERATED_MARKET_RISK_ID);
    expect(build.template.spec.templateId).toBe(GENERATED_MARKET_RISK_ID);

    const sim = build.template.run(Object.fromEntries(build.template.spec.sliders.map((s) => [s.id, s.value])));
    expect(sim.metrics.some((metric) => metric.id === 'fx_var')).toBe(true);
    expect(sim.metrics.some((metric) => metric.id === 'rate_pnl')).toBe(true);
    expect(sim.series?.map((series) => series.name)).toEqual(['rate shock P/L', 'FX VaR']);
    expect(sim.raw?.modelKind).toBe('market-risk');
    expect(Array.isArray(sim.raw?.shapes)).toBe(true);
  });
});
