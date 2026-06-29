import { describe, expect, it } from 'vitest';
import {
  binomialWilsonInterval,
  expectedShortfall,
  maxDrawdownFromPath,
  mean,
  quantile,
  sortedQuantile,
} from './statistics';

describe('statistics helpers', () => {
  it('interpolates quantiles on sorted and unsorted data', () => {
    expect(sortedQuantile([0, 10, 20, 30], 0.5)).toBe(15);
    expect(quantile([30, 0, 20, 10], 0.25)).toBe(7.5);
  });

  it('computes expected shortfall as the tail mean beyond the confidence quantile', () => {
    expect(expectedShortfall([0, 1, 2, 3, 4], 0.75)).toBe(3.5);
  });

  it('returns Wilson intervals containing the observed binomial rate', () => {
    const interval = binomialWilsonInterval(12, 100);
    expect(interval.lower).toBeLessThan(0.12);
    expect(interval.upper).toBeGreaterThan(0.12);
  });

  it('computes path max drawdown', () => {
    expect(maxDrawdownFromPath([100, 120, 90, 110])).toBeCloseTo(0.25, 6);
    expect(mean([2, 4, 6])).toBe(4);
  });
});

