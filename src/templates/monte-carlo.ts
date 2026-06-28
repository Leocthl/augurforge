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

// --- fixed simulation constants ---------------------------------------------
const S0 = 100;
const BARRIER = 50; // ruin = a path''s running minimum falls below this
const N_PATHS = 500;
const STEPS_PER_YEAR = 12;

// --- numerics ---------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sortedAsc: number[], p: number): number {
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

const fmtPct = (x: number) => `${x.toFixed(1)}%`;
const fmtMoney = (x: number) => `$${x.toFixed(0)}`;

// --- run() ------------------------------------------------------------------

function run(params: ParamSet): SimResult {
  const sigma = (params.sigma ?? 18) / 100;
  const mu = (params.drift ?? 7) / 100;
  const horizon = Math.max(1, Math.round(params.horizon ?? 30));
  const steps = horizon * STEPS_PER_YEAR;
  const dt = 1 / STEPS_PER_YEAR;
  const logDrift = (mu - 0.5 * sigma * sigma) * dt;
  const vol = sigma * Math.sqrt(dt);

  const rng = mulberry32(0x9e3779b9); // fixed seed → deterministic given params
  const paths: number[][] = [];
  const mins: number[] = [];
  const terminals: number[] = [];

  for (let p = 0; p < N_PATHS; p++) {
    const path = new Array<number>(steps + 1);
    path[0] = S0;
    let s = S0;
    let min = S0;
    for (let t = 1; t <= steps; t++) {
      s = s * Math.exp(logDrift + vol * gaussian(rng));
      path[t] = s;
      if (s < min) min = s;
    }
    paths.push(path);
    mins.push(min);
    terminals.push(s);
  }

  // Time axis (years).
  const time = new Array<number>(steps + 1);
  for (let t = 0; t <= steps; t++) time[t] = t * dt;

  // Percentile cones over time.
  const pcts = [5, 25, 50, 75, 95] as const;
  const cone: Record<number, number[]> = { 5: [], 25: [], 50: [], 75: [], 95: [] };
  const column = new Array<number>(N_PATHS);
  for (let t = 0; t <= steps; t++) {
    for (let p = 0; p < N_PATHS; p++) column[p] = paths[p][t];
    const sorted = column.slice().sort((a, b) => a - b);
    for (const q of pcts) cone[q].push(percentile(sorted, q));
  }

  const series: Series[] = pcts.map((q) => ({ name: `p${q}`, x: time, y: cone[q] }));

  // Metrics.
  const sortedTerminal = terminals.slice().sort((a, b) => a - b);
  const ruinCount = mins.filter((m) => m < BARRIER).length;
  const pRuin = (ruinCount / N_PATHS) * 100;
  const p5Terminal = percentile(sortedTerminal, 5);
  const var95 = Math.max(0, ((S0 - p5Terminal) / S0) * 100);
  const median = percentile(sortedTerminal, 50);

  const vMin = Math.min(BARRIER * 0.7, percentile(sortedTerminal, 1) * 0.95);
  const vMax = percentile(sortedTerminal, 99) * 1.05;

  return {
    paths,
    series,
    metrics: [
      { id: 'p_ruin', label: 'P(ruin)', value: fmtPct(pRuin) },
      { id: 'var_95', label: '95% VaR', value: fmtPct(var95) },
      { id: 'median', label: 'Median outcome', value: fmtMoney(median) },
    ],
    raw: { time, s0: S0, barrier: BARRIER, terminal: terminals, vMin, vMax, tMax: time[time.length - 1] },
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
  title: 'Monte Carlo — Portfolio Ruin (GBM)',
  subtitle: 'Geometric Brownian motion · 500 paths · simulated client-side',
  views: ['2d', '3d'],
  defaultView: '2d',
  sliders: [
    { id: 'sigma', label: 'Volatility (σ)', min: 5, max: 40, step: 1, value: 18, unit: '%' },
    { id: 'drift', label: 'Drift (μ)', min: -5, max: 15, step: 1, value: 7, unit: '%' },
    { id: 'horizon', label: 'Horizon', min: 5, max: 40, step: 1, value: 30, unit: 'yr' },
  ],
  explainer: {
    entry:
      'This shows many possible market journeys over time. Most paths grow, but some dip badly — ' +
      'the share that falls through the floor is the "ruin" chance. Turn volatility up and the danger grows.',
    expert:
      'A GBM ensemble of 500 paths. The fan shows the 5–95 and 25–75 percentile cones; the histogram is ' +
      'the terminal distribution. P(ruin) is the fraction breaching the barrier; 95% VaR is the 5th-percentile loss.',
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