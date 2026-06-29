import { clamp } from './statistics';

export type OptionType = 'call' | 'put';

export interface BlackScholesInput {
  spot: number;
  strike: number;
  volatility: number;
  rate: number;
  maturity: number;
  dividendYield?: number;
}

export interface BlackScholesResult {
  call: number;
  put: number;
  callDelta: number;
  putDelta: number;
  gamma: number;
  vega: number;
  callTheta: number;
  putTheta: number;
  callRho: number;
  putRho: number;
  d1: number;
  d2: number;
  parityResidual: number;
  warnings: string[];
}

export interface ImpliedVolatilityInput extends Omit<BlackScholesInput, 'volatility'> {
  optionType: OptionType;
  targetPrice: number;
  lowerVol?: number;
  upperVol?: number;
  tolerance?: number;
  maxIterations?: number;
}

export function blackScholes(input: BlackScholesInput): BlackScholesResult {
  const spot = Math.max(1e-8, input.spot);
  const strike = Math.max(1e-8, input.strike);
  const sigma = clamp(input.volatility, 1e-8, 5);
  const rate = input.rate;
  const maturity = Math.max(1e-8, input.maturity);
  const q = input.dividendYield ?? 0;
  const sqrtT = Math.sqrt(maturity);
  const discount = Math.exp(-rate * maturity);
  const dividendDiscount = Math.exp(-q * maturity);
  const d1 = (Math.log(spot / strike) + (rate - q + 0.5 * sigma * sigma) * maturity) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nMinusD1 = normalCdf(-d1);
  const nMinusD2 = normalCdf(-d2);
  const pdfD1 = normalPdf(d1);

  const call = spot * dividendDiscount * nd1 - strike * discount * nd2;
  const put = strike * discount * nMinusD2 - spot * dividendDiscount * nMinusD1;
  const gamma = (dividendDiscount * pdfD1) / (spot * sigma * sqrtT);
  const vega = spot * dividendDiscount * pdfD1 * sqrtT;
  const callTheta =
    -(spot * dividendDiscount * pdfD1 * sigma) / (2 * sqrtT) -
    rate * strike * discount * nd2 +
    q * spot * dividendDiscount * nd1;
  const putTheta =
    -(spot * dividendDiscount * pdfD1 * sigma) / (2 * sqrtT) +
    rate * strike * discount * nMinusD2 -
    q * spot * dividendDiscount * nMinusD1;
  const callRho = strike * maturity * discount * nd2;
  const putRho = -strike * maturity * discount * nMinusD2;
  const parityResidual = call - put - (spot * dividendDiscount - strike * discount);

  return {
    call,
    put,
    callDelta: dividendDiscount * nd1,
    putDelta: dividendDiscount * (nd1 - 1),
    gamma,
    vega,
    callTheta,
    putTheta,
    callRho,
    putRho,
    d1,
    d2,
    parityResidual,
    warnings: parameterWarnings({ spot, strike, volatility: sigma, rate, maturity, dividendYield: q }),
  };
}

export function impliedVolatility(input: ImpliedVolatilityInput): number | null {
  const lower = input.lowerVol ?? 1e-6;
  const upper = input.upperVol ?? 5;
  const tolerance = input.tolerance ?? 1e-7;
  const maxIterations = input.maxIterations ?? 100;
  const priceAt = (volatility: number) => {
    const result = blackScholes({ ...input, volatility });
    return input.optionType === 'call' ? result.call : result.put;
  };
  const lowerPrice = priceAt(lower);
  const upperPrice = priceAt(upper);
  if (input.targetPrice < lowerPrice - tolerance || input.targetPrice > upperPrice + tolerance) return null;

  let lo = lower;
  let hi = upper;
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const price = priceAt(mid);
    if (Math.abs(price - input.targetPrice) <= tolerance) return mid;
    if (price < input.targetPrice) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    sign *
    (1 -
      (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) *
        t *
        Math.exp(-z * z)));
  return 0.5 * (1 + erf);
}

function parameterWarnings(input: Required<BlackScholesInput>): string[] {
  const warnings: string[] = [];
  if (input.volatility > 1) warnings.push('Volatility above 100% is outside the usual Black-Scholes interpretation range.');
  if (input.rate < 0) warnings.push('Negative rates are mathematically allowed but need explicit market context.');
  if (input.maturity > 10) warnings.push('Long maturities amplify constant-rate and constant-volatility model risk.');
  if (input.dividendYield > 0.15) warnings.push('Dividend yield is unusually high; confirm the yield convention.');
  return warnings;
}

