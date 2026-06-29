import { describe, expect, it } from 'vitest';
import { brownianBridgeCrossingProbability, simulateGbm, type GbmConfig } from './gbm';

const BASE: GbmConfig = {
  s0: 100,
  barrier: 60,
  mu: 0.05,
  sigma: 0.18,
  horizonYears: 8,
  stepsPerYear: 252,
  nPaths: 2_000,
  seed: 1234,
  renderPathCount: 8,
  conePathCount: 64,
  renderStepsPerYear: 4,
};

describe('GBM simulation', () => {
  it('is deterministic for the same input and seed', () => {
    const a = simulateGbm(BASE);
    const b = simulateGbm(BASE);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.terminal).toEqual(b.terminal);
    expect(a.paths).toEqual(b.paths);
  });

  it('raises ruin probability, VaR, and ES as volatility increases in a fixed-seed sweep', () => {
    const low = simulateGbm({ ...BASE, barrier: 70, sigma: 0.1, seed: 77, nPaths: 4_000 });
    const high = simulateGbm({ ...BASE, barrier: 70, sigma: 0.35, seed: 77, nPaths: 4_000 });
    expect(high.metrics.ruinProbability).toBeGreaterThan(low.metrics.ruinProbability);
    expect(high.metrics.var95).toBeGreaterThan(low.metrics.var95);
    expect(high.metrics.es95).toBeGreaterThan(low.metrics.es95);
  });

  it('raises median terminal value as drift increases in a fixed-seed sweep', () => {
    const low = simulateGbm({ ...BASE, mu: 0, seed: 99 });
    const high = simulateGbm({ ...BASE, mu: 0.1, seed: 99 });
    expect(high.metrics.medianTerminal).toBeGreaterThan(low.metrics.medianTerminal);
  });

  it('collapses to deterministic compounding when volatility is zero', () => {
    const sim = simulateGbm({ ...BASE, mu: 0.06, sigma: 0, horizonYears: 3, nPaths: 100 });
    const expected = 100 * Math.exp(0.06 * 3);
    expect(sim.metrics.medianTerminal).toBeCloseTo(expected, 8);
    expect(sim.metrics.var95).toBe(0);
  });

  it('uses a monotone Brownian bridge crossing probability', () => {
    const barrier = Math.log(99);
    const near = brownianBridgeCrossingProbability(Math.log(100), Math.log(100.25), barrier, 0.3, 1 / 252);
    const far = brownianBridgeCrossingProbability(Math.log(106), Math.log(106.25), barrier, 0.3, 1 / 252);
    expect(near).toBeGreaterThan(far);
    expect(brownianBridgeCrossingProbability(Math.log(94), Math.log(101), barrier, 0.2, 1 / 252)).toBe(1);
    expect(brownianBridgeCrossingProbability(Math.log(100), Math.log(101), barrier, 0, 1 / 252)).toBe(0);
  });
});
