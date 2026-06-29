import { describe, expect, it } from 'vitest';
import { blackScholes, impliedVolatility } from './black-scholes';

describe('Black-Scholes math', () => {
  it('matches standard no-dividend European option values and parity', () => {
    const result = blackScholes({ spot: 100, strike: 100, volatility: 0.2, rate: 0.05, maturity: 1 });
    expect(result.call).toBeCloseTo(10.4506, 3);
    expect(result.put).toBeCloseTo(5.5735, 3);
    expect(Math.abs(result.parityResidual)).toBeLessThan(1e-6);
  });

  it('matches call delta and vega finite-difference checks', () => {
    const input = { spot: 110, strike: 100, volatility: 0.24, rate: 0.04, maturity: 1.5, dividendYield: 0.01 };
    const base = blackScholes(input);
    const spotBump = 0.01;
    const volBump = 0.0001;
    const upSpot = blackScholes({ ...input, spot: input.spot + spotBump }).call;
    const downSpot = blackScholes({ ...input, spot: input.spot - spotBump }).call;
    const upVol = blackScholes({ ...input, volatility: input.volatility + volBump }).call;
    const downVol = blackScholes({ ...input, volatility: input.volatility - volBump }).call;
    expect((upSpot - downSpot) / (2 * spotBump)).toBeCloseTo(base.callDelta, 3);
    expect((upVol - downVol) / (2 * volBump)).toBeCloseTo(base.vega, 2);
  });

  it('moves call and put prices in the expected direction as dividend yield increases', () => {
    const q0 = blackScholes({ spot: 100, strike: 100, volatility: 0.2, rate: 0.05, maturity: 1, dividendYield: 0 });
    const q5 = blackScholes({ spot: 100, strike: 100, volatility: 0.2, rate: 0.05, maturity: 1, dividendYield: 0.05 });
    expect(q5.call).toBeLessThan(q0.call);
    expect(q5.put).toBeGreaterThan(q0.put);
  });

  it('recovers implied volatility from a target call price', () => {
    const target = blackScholes({ spot: 100, strike: 105, volatility: 0.32, rate: 0.03, maturity: 2 }).call;
    const recovered = impliedVolatility({
      optionType: 'call',
      targetPrice: target,
      spot: 100,
      strike: 105,
      rate: 0.03,
      maturity: 2,
    });
    expect(recovered).toBeCloseTo(0.32, 5);
  });
});

