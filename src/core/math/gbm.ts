import { mulberry32, normalPair } from './random';
import {
  binomialWilsonInterval,
  clamp,
  expectedShortfall,
  meanInterval,
  median,
  quantileRankInterval,
  sortedQuantile,
  type Interval,
} from './statistics';

export interface GbmConfig {
  s0: number;
  barrier: number;
  mu: number;
  sigma: number;
  horizonYears: number;
  stepsPerYear?: number;
  nPaths?: number;
  seed?: number;
  renderPathCount?: number;
  conePathCount?: number;
  renderStepsPerYear?: number;
}

export interface GbmMetricSet {
  ruinProbability: number;
  ruinProbabilityCi: Interval;
  var95: number;
  var95Ci: Interval;
  var99: number;
  es95: number;
  es95Ci: Interval;
  medianTerminal: number;
  maxDrawdownP95: number;
  medianRuinTime: number | null;
}

export interface GbmSimulation {
  time: number[];
  paths: number[][];
  percentiles: Record<number, number[]>;
  terminal: number[];
  losses: number[];
  maxDrawdowns: number[];
  ruinTimes: number[];
  metrics: GbmMetricSet;
  metadata: {
    modelKind: 'gbm-single-asset';
    assumptions: string[];
    calibration: { source: 'manual-sliders'; window: null; sampleSize: null };
    seed: number;
    nPaths: number;
    renderPathCount: number;
    conePathCount: number;
    steps: number;
    stepsPerYear: number;
    renderStepsPerYear: number;
    dt: number;
    monitoring: 'daily-with-brownian-bridge';
    antitheticVariates: true;
    barrierCorrection: 'gbm-brownian-bridge';
    confidenceLevel: 0.95;
  };
}

const DEFAULT_PERCENTILES = [5, 25, 50, 75, 95] as const;

export function simulateGbm(config: GbmConfig): GbmSimulation {
  const s0 = positive(config.s0, 100);
  const barrier = positive(config.barrier, s0 * 0.5);
  const sigma = Math.max(0, finite(config.sigma, 0.18));
  const mu = finite(config.mu, 0.07);
  const horizonYears = Math.max(0.1, finite(config.horizonYears, 30));
  const stepsPerYear = Math.max(1, Math.round(finite(config.stepsPerYear, 252)));
  const requestedPaths = Math.max(2, Math.round(finite(config.nPaths, 10_000)));
  const nPaths = requestedPaths % 2 === 0 ? requestedPaths : requestedPaths + 1;
  const seed = Math.round(finite(config.seed, 0x9e3779b9)) >>> 0;
  const renderPathCount = Math.min(nPaths, Math.max(1, Math.round(finite(config.renderPathCount, 160))));
  const conePathCount = Math.min(nPaths, Math.max(renderPathCount, Math.round(finite(config.conePathCount, 2_000))));
  const renderStepsPerYear = Math.max(1, Math.round(finite(config.renderStepsPerYear, 12)));
  const steps = Math.max(1, Math.round(horizonYears * stepsPerYear));
  const dt = 1 / stepsPerYear;
  const logDrift = (mu - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);
  const rng = mulberry32(seed);
  const renderSteps = renderStepIndexes(steps, stepsPerYear, renderStepsPerYear);
  const time = renderSteps.map((step) => step * dt);

  const paths: number[][] = [];
  const conePaths: number[][] = [];
  const terminal = new Array<number>(nPaths);
  const losses = new Array<number>(nPaths);
  const maxDrawdowns = new Array<number>(nPaths);
  const ruinTimes: number[] = [];
  const barrierLog = Math.log(barrier);
  let spareNormal: number | null = null;
  const nextNormal = () => {
    if (spareNormal !== null) {
      const z = spareNormal;
      spareNormal = null;
      return z;
    }
    const [z0, z1] = normalPair(rng);
    spareNormal = z1;
    return z0;
  };

  for (let pathIndex = 0; pathIndex < nPaths; pathIndex += 2) {
    const stateA = createPathState(s0, pathIndex, renderPathCount, conePathCount, paths, conePaths);
    const stateB = createPathState(s0, pathIndex + 1, renderPathCount, conePathCount, paths, conePaths);

    for (let step = 1, renderCursor = 1; step <= steps; step++) {
      const z = nextNormal();
      advanceState(stateA, z, step, dt, logDrift, volStep, sigma, barrierLog, rng);
      advanceState(stateB, -z, step, dt, logDrift, volStep, sigma, barrierLog, rng);

      if (renderCursor < renderSteps.length && step === renderSteps[renderCursor]) {
        stateA.renderPath?.push(Math.exp(stateA.logValue));
        stateB.renderPath?.push(Math.exp(stateB.logValue));
        renderCursor++;
      }
    }

    writePathSummary(pathIndex, stateA, s0, terminal, losses, maxDrawdowns, ruinTimes);
    writePathSummary(pathIndex + 1, stateB, s0, terminal, losses, maxDrawdowns, ruinTimes);
  }

  const sortedTerminal = [...terminal].sort((a, b) => a - b);
  const sortedLosses = [...losses].sort((a, b) => a - b);
  const sortedDrawdowns = [...maxDrawdowns].sort((a, b) => a - b);
  const var95 = Math.max(0, sortedQuantile(sortedLosses, 0.95));
  const var99 = Math.max(0, sortedQuantile(sortedLosses, 0.99));
  const es95 = Math.max(0, expectedShortfall(losses, 0.95));
  const tail95 = losses.filter((loss) => loss >= sortedQuantile(sortedLosses, 0.95));
  const percentiles = buildPercentileSeries(conePaths, DEFAULT_PERCENTILES);

  return {
    time,
    paths,
    percentiles,
    terminal,
    losses,
    maxDrawdowns,
    ruinTimes,
    metrics: {
      ruinProbability: ruinTimes.length / nPaths,
      ruinProbabilityCi: binomialWilsonInterval(ruinTimes.length, nPaths),
      var95,
      var95Ci: clampInterval(quantileRankInterval(sortedLosses, 0.95)),
      var99,
      es95,
      es95Ci: clampInterval(meanInterval(tail95)),
      medianTerminal: median(sortedTerminal),
      maxDrawdownP95: sortedQuantile(sortedDrawdowns, 0.95),
      medianRuinTime: ruinTimes.length ? median(ruinTimes) : null,
    },
    metadata: {
      modelKind: 'gbm-single-asset',
      assumptions: [
        'Single-asset geometric Brownian motion with constant annual drift and volatility.',
        'Daily lognormal time steps with continuous barrier monitoring approximated by a Brownian bridge.',
        'Antithetic normal variates reduce Monte Carlo noise for a fixed seeded run.',
        'Headline metrics use the full path set; charts use sampled paths and sampled percentile cones.',
      ],
      calibration: { source: 'manual-sliders', window: null, sampleSize: null },
      seed,
      nPaths,
      renderPathCount,
      conePathCount,
      steps,
      stepsPerYear,
      renderStepsPerYear,
      dt,
      monitoring: 'daily-with-brownian-bridge',
      antitheticVariates: true,
      barrierCorrection: 'gbm-brownian-bridge',
      confidenceLevel: 0.95,
    },
  };
}

export function brownianBridgeCrossingProbability(
  x0: number,
  x1: number,
  barrierLog: number,
  sigma: number,
  dt: number,
): number {
  if (sigma <= 0 || dt <= 0) return 0;
  if (x0 <= barrierLog || x1 <= barrierLog) return 1;
  const exponent = (-2 * (x0 - barrierLog) * (x1 - barrierLog)) / (sigma * sigma * dt);
  if (exponent < -36) return 0;
  return clamp(Math.exp(exponent), 0, 1);
}

interface PathState {
  logValue: number;
  peakLog: number;
  maxDrawdown: number;
  ruinedAt: number | null;
  renderPath?: number[];
}

function createPathState(
  s0: number,
  pathIndex: number,
  renderPathCount: number,
  conePathCount: number,
  renderPaths: number[][],
  conePaths: number[][],
): PathState {
  const renderPath = pathIndex < conePathCount ? [s0] : undefined;
  if (renderPath && pathIndex < renderPathCount) renderPaths.push(renderPath);
  if (renderPath) conePaths.push(renderPath);
  const logValue = Math.log(s0);
  return { logValue, peakLog: logValue, maxDrawdown: 0, ruinedAt: null, renderPath };
}

function advanceState(
  state: PathState,
  z: number,
  step: number,
  dt: number,
  logDrift: number,
  volStep: number,
  sigma: number,
  barrierLog: number,
  rng: () => number,
): void {
  const previousLog = state.logValue;
  const nextLog = previousLog + logDrift + volStep * z;
  state.logValue = nextLog;
  if (nextLog > state.peakLog) {
    state.peakLog = nextLog;
  } else {
    state.maxDrawdown = Math.max(state.maxDrawdown, 1 - Math.exp(nextLog - state.peakLog));
  }

  if (state.ruinedAt === null) {
    if (nextLog <= barrierLog) {
      state.ruinedAt = step * dt;
    } else if (previousLog > barrierLog) {
      const pCross = brownianBridgeCrossingProbability(previousLog, nextLog, barrierLog, sigma, dt);
      if (pCross > 0 && rng() < pCross) state.ruinedAt = (step - 0.5) * dt;
    }
  }
}

function writePathSummary(
  pathIndex: number,
  state: PathState,
  s0: number,
  terminal: number[],
  losses: number[],
  maxDrawdowns: number[],
  ruinTimes: number[],
): void {
  const terminalValue = Math.exp(state.logValue);
  terminal[pathIndex] = terminalValue;
  losses[pathIndex] = (s0 - terminalValue) / s0;
  maxDrawdowns[pathIndex] = state.maxDrawdown;
  if (state.ruinedAt !== null) ruinTimes.push(state.ruinedAt);
}

function buildPercentileSeries(
  paths: number[][],
  percentiles: readonly number[],
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const percentile of percentiles) out[percentile] = [];
  if (!paths.length) return out;
  const columns = paths[0].length;
  const column = new Array<number>(paths.length);
  for (let t = 0; t < columns; t++) {
    for (let p = 0; p < paths.length; p++) column[p] = paths[p][t];
    column.sort((a, b) => a - b);
    for (const percentile of percentiles) out[percentile].push(sortedQuantile(column, percentile / 100));
  }
  return out;
}

function renderStepIndexes(steps: number, stepsPerYear: number, renderStepsPerYear: number): number[] {
  const interval = Math.max(1, Math.round(stepsPerYear / renderStepsPerYear));
  const indexes = [0];
  for (let step = interval; step < steps; step += interval) indexes.push(step);
  if (indexes[indexes.length - 1] !== steps) indexes.push(steps);
  return indexes;
}

function clampInterval(interval: Interval): Interval {
  return {
    lower: Math.max(0, interval.lower),
    upper: Math.max(0, interval.upper),
    confidence: interval.confidence,
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positive(value: unknown, fallback: number): number {
  return Math.max(1e-8, finite(value, fallback));
}
