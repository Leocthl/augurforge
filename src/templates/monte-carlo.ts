/**
 * monte-carlo.ts — REFERENCE template (the pattern every other template copies). [OWNER: B, scaffolded by A]
 *
 * GBM ensemble:  S_{t+1} = S_t · exp((μ − ½σ²)·dt + σ·√dt·Z),  Z ~ N(0,1)
 * - run(params): deterministic, client-side. Seeded PRNG → stable charts, honest numbers.
 * - render2D: percentile fan + aligned terminal histogram + ruin barrier; Animate reveals L→R.
 * - render3D: probability-density mountain + ribbon trajectories; Animate rises + auto-rotates.
 * Both views read the SAME SimResult — switching view never re-runs the math.
 */
import type {
  DashboardSpec,
  ParamSet,
  Renderer,
  RenderOpts,
  Series,
  SimResult,
  TemplateModule,
} from '../core/contract';
import type { PlotData } from 'plotly.js-dist-min';
import * as THREE from 'three';
import {
  baseLayout,
  barrierShape,
  conePair,
  medianLine,
  mount,
  PALETTE,
  purge,
  revealX,
  samplePaths,
  terminalHistogram,
} from '../viz/plotly2d';
import {
  barrierPlane,
  clearGroup,
  createScene,
  densitySurface,
  type FieldRanges,
  ribbonLines,
} from '../viz/three3d';
import { simulateGbm } from '../core/math/gbm';
import { clamp, sortedQuantile } from '../core/math/statistics';

// --- fixed simulation constants ---------------------------------------------
const S0 = 100;
const BARRIER = 50; // ruin = a path''s running minimum falls below this
const N_PATHS = 10_000;
const RENDER_PATHS = 160;
const CONE_PATHS = 2_000;
const STEPS_PER_YEAR = 252;
const RENDER_STEPS_PER_YEAR = 12;
const DEFAULT_SEED = 2027;

// --- numerics ---------------------------------------------------------------

function finiteParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtMoney = (x: number) => `$${x.toFixed(0)}`;
const fmtYears = (x: number | null) => (x == null ? 'n/a' : `${x.toFixed(1)} yr`);

// --- run() ------------------------------------------------------------------

function run(params: ParamSet): SimResult {
  const sigmaPct = clamp(finiteParam(params.sigma, 18), 0, 60);
  const driftPct = clamp(finiteParam(params.drift, 7), -5, 15);
  const sigma = sigmaPct / 100;
  const mu = driftPct / 100;
  const horizon = Math.round(clamp(finiteParam(params.horizon, 30), 5, 40));
  const seed = Math.round(clamp(finiteParam(params.seed, DEFAULT_SEED), 1, 99_999));
  const sim = simulateGbm({
    s0: S0,
    barrier: BARRIER,
    mu,
    sigma,
    horizonYears: horizon,
    stepsPerYear: STEPS_PER_YEAR,
    nPaths: N_PATHS,
    seed,
    renderPathCount: RENDER_PATHS,
    conePathCount: CONE_PATHS,
    renderStepsPerYear: RENDER_STEPS_PER_YEAR,
  });

  const pcts = [5, 25, 50, 75, 95] as const;
  const series: Series[] = pcts.map((q) => ({ name: `p${q}`, x: sim.time, y: sim.percentiles[q] }));
  const sortedTerminal = [...sim.terminal].sort((a, b) => a - b);
  const vMin = Math.max(1, Math.min(BARRIER * 0.7, sortedQuantile(sortedTerminal, 0.01) * 0.95));
  const vMax = Math.max(S0 * 1.2, sortedQuantile(sortedTerminal, 0.99) * 1.05);

  return {
    paths: sim.paths,
    series,
    metrics: [
      { id: 'p_ruin', label: 'P(ruin)', value: fmtPct(sim.metrics.ruinProbability) },
      { id: 'var_95', label: '95% VaR', value: fmtPct(sim.metrics.var95) },
      { id: 'var_99', label: '99% VaR', value: fmtPct(sim.metrics.var99) },
      { id: 'es_95', label: '95% ES', value: fmtPct(sim.metrics.es95) },
      { id: 'median', label: 'Median outcome', value: fmtMoney(sim.metrics.medianTerminal) },
      { id: 'max_dd_95', label: 'p95 max drawdown', value: fmtPct(sim.metrics.maxDrawdownP95) },
      { id: 'median_ruin_time', label: 'Median ruin time', value: fmtYears(sim.metrics.medianRuinTime) },
    ],
    raw: {
      time: sim.time,
      s0: S0,
      barrier: BARRIER,
      terminal: sim.terminal,
      losses: sim.losses,
      maxDrawdowns: sim.maxDrawdowns,
      ruinTimes: sim.ruinTimes,
      vMin,
      vMax,
      tMax: sim.time[sim.time.length - 1],
      sigma,
      mu,
      horizon,
      steps: sim.metadata.steps,
      stepsPerYear: sim.metadata.stepsPerYear,
      renderStepsPerYear: sim.metadata.renderStepsPerYear,
      nPaths: sim.metadata.nPaths,
      renderPathCount: sim.metadata.renderPathCount,
      conePathCount: sim.metadata.conePathCount,
      seed: sim.metadata.seed,
      modelKind: sim.metadata.modelKind,
      modelFamily: 'GBM',
      assumptions: sim.metadata.assumptions,
      calibration: sim.metadata.calibration,
      monitoring: sim.metadata.monitoring,
      antitheticVariates: sim.metadata.antitheticVariates,
      barrierCorrection: sim.metadata.barrierCorrection,
      uncertainty: {
        ruinProbability: sim.metrics.ruinProbabilityCi,
        var95: sim.metrics.var95Ci,
        es95: sim.metrics.es95Ci,
      },
    },
  };
}

// --- shared sim accessors ---------------------------------------------------

function seriesY(sim: SimResult, name: string): number[] {
  return sim.series?.find((s) => s.name === name)?.y ?? [];
}

function rawNum(sim: SimResult, key: string, fallback: number): number {
  const v = sim.raw?.[key];
  return typeof v === 'number' ? v : fallback;
}

// --- render2D ---------------------------------------------------------------

function render2D(el: HTMLElement, sim: SimResult, opts: RenderOpts): Renderer {
  let cancelReveal: (() => void) | null = null;

  const draw = (s: SimResult, animate: boolean) => {
    cancelReveal?.();
    cancelReveal = null;

    const time = s.series?.[0]?.x ?? [];
    const tMax = rawNum(s, 'tMax', time[time.length - 1] ?? 1);
    const vMin = rawNum(s, 'vMin', S0 * 0.4);
    const vMax = rawNum(s, 'vMax', S0 * 1.8);
    const terminal = (s.raw?.terminal as number[]) ?? [];

    const traces: PlotData[] = [
      ...conePair(time, seriesY(s, 'p5'), seriesY(s, 'p95'), PALETTE.cone95),
      ...conePair(time, seriesY(s, 'p25'), seriesY(s, 'p75'), PALETTE.cone50),
      medianLine(time, seriesY(s, 'p50')),
      ...samplePaths(time, s.paths ?? []),
      terminalHistogram(terminal),
    ];

    const layout = baseLayout(opts.theme);
    layout.yaxis = { ...(layout.yaxis as object), range: [vMin, vMax] };
    layout.shapes = [barrierShape(0, tMax, rawNum(s, 'barrier', BARRIER))];
    if (!animate) layout.xaxis = { ...(layout.xaxis as object), range: [0, tMax] };

    mount(el, traces, layout).catch((err) => console.error('[monte-carlo render2D] Plotly error:', err));
    if (animate) cancelReveal = revealX(el, 0, tMax);
  };

  draw(sim, opts.animate);

  return {
    update: (next, animate) => draw(next, animate),
    destroy: () => {
      cancelReveal?.();
      purge(el);
    },
  };
}

// --- render3D ---------------------------------------------------------------

function rangesFromSim(sim: SimResult): FieldRanges {
  return {
    tMax: rawNum(sim, 'tMax', 30),
    vMin: rawNum(sim, 'vMin', S0 * 0.4),
    vMax: rawNum(sim, 'vMax', S0 * 1.8),
    barrier: rawNum(sim, 'barrier', BARRIER),
    s0: rawNum(sim, 's0', S0),
  };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function render3D(el: HTMLElement, sim: SimResult, opts: RenderOpts): Renderer {
  const handle = createScene(el, opts.theme);
  const group = new THREE.Group();
  handle.scene.add(group);

  // Reveal state, driven once from the per-frame hook (no per-update listener leaks).
  const reveal = { on: false, start: -1 };
  handle.onFrame((elapsed) => {
    if (!reveal.on) return;
    if (reveal.start < 0) reveal.start = elapsed;
    const p = Math.min(1, (elapsed - reveal.start) / 0.9);
    group.scale.y = Math.max(0.02, easeOutCubic(p));
    if (p >= 1) reveal.on = false;
  });

  const build = (s: SimResult, animate: boolean) => {
    clearGroup(group);
    const ranges = rangesFromSim(s);
    const time = s.series?.[0]?.x ?? [];
    const paths = s.paths ?? [];
    group.add(barrierPlane(ranges));
    group.add(densitySurface(paths, time, ranges));
    group.add(ribbonLines(paths, time, ranges));
    handle.setAutoRotate(animate);
    if (animate) {
      reveal.on = true;
      reveal.start = -1;
      group.scale.y = 0.02;
    } else {
      reveal.on = false;
      group.scale.y = 1;
    }
  };

  build(sim, opts.animate);

  return {
    update: (next, animate) => build(next, animate),
    destroy: () => handle.dispose(),
  };
}

// --- spec + module ----------------------------------------------------------

const spec: DashboardSpec = {
  templateId: 'monte-carlo',
  title: 'Monte Carlo - Portfolio Ruin (GBM)',
  subtitle: 'Daily GBM · 10,000 metric paths · Brownian bridge barrier correction',
  views: ['2d', '3d'],
  defaultView: '2d',
  sliders: [
    { id: 'sigma', label: 'Volatility (sigma)', min: 0, max: 60, step: 1, value: 18, unit: '%' },
    { id: 'drift', label: 'Drift (μ)', min: -5, max: 15, step: 1, value: 7, unit: '%' },
    { id: 'horizon', label: 'Horizon', min: 5, max: 40, step: 1, value: 30, unit: 'yr' },
    { id: 'seed', label: 'Seed', min: 1, max: 99999, step: 1, value: DEFAULT_SEED, unit: '' },
  ],
  explainer: {
    entry:
      'This shows many possible market journeys over time. Most paths grow, but some dip badly — ' +
      'the share that crosses the continuously approximated floor is the "ruin" chance. Turn volatility up and the danger grows.',
    expert:
      'A daily-stepped GBM ensemble of 10,000 paths with antithetic variates. Barrier breaches use a Brownian bridge correction between daily endpoints; ' +
      'rendered trajectories are sampled separately from the full metric path set. VaR/ES are terminal-loss distribution metrics.',
  },
};

export const monteCarlo: TemplateModule = {
  id: 'monte-carlo',
  spec,
  run,
  render2D,
  render3D,
};

export default monteCarlo;
