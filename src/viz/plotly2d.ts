/**
 * plotly2d.ts — shared 2D render helpers (fan / cone · histogram · curve · arrows). [A scaffolds, B extends]
 *
 * These are composable trace + layout builders, NOT full renderers. A template''s render2D()
 * composes them and owns the Plotly lifecycle (newPlot/react/purge) + the returned Renderer.
 * Theme stays dark to match the app shell; all colors live in PALETTE for easy reuse.
 */
import Plotly from 'plotly.js-dist-min';
import type { PlotData, Layout } from 'plotly.js-dist-min';
import type { Theme } from '../core/contract';

export const PALETTE = {
  axis: '#8aa0bd',
  grid: 'rgba(120,150,190,0.14)',
  cone95: 'rgba(56,189,248,0.14)',
  cone50: 'rgba(56,189,248,0.30)',
  median: '#38bdf8',
  sample: 'rgba(148,163,184,0.35)',
  bar: 'rgba(56,189,248,0.65)',
  barrier: '#fb7185',
  accent: '#fbbf24',
} as const;

export const PLOTLY_CONFIG = { displayModeBar: false, responsive: true } as const;

/** Base dark layout with the fan (left) + terminal histogram (right) subplot split. */
export function baseLayout(theme: Theme): Partial<Layout> {
  const font = theme === 'light' ? '#1e293b' : PALETTE.axis;
  return {
    paper_bgcolor: theme === 'light' ? '#ffffff' : 'rgba(0,0,0,0)',
    plot_bgcolor: theme === 'light' ? '#f8fafc' : 'rgba(0,0,0,0)',
    font: { color: font, family: 'Inter, system-ui, sans-serif', size: 12 },
    margin: { l: 56, r: 16, t: 16, b: 40 },
    showlegend: false,
    hovermode: 'closest',
    xaxis: {
      domain: [0, 0.72],
      title: { text: 'Years' },
      gridcolor: PALETTE.grid,
      zeroline: false,
    },
    yaxis: {
      title: { text: 'Portfolio value' },
      gridcolor: PALETTE.grid,
      zeroline: false,
    },
    xaxis2: {
      domain: [0.78, 1],
      title: { text: 'Frequency' },
      gridcolor: PALETTE.grid,
      zeroline: false,
    },
    yaxis2: { matches: 'y', anchor: 'x2', showticklabels: false, gridcolor: PALETTE.grid },
  };
}

/**
 * A percentile cone: an upper bound line plus a lower bound that fills up to it.
 * Pass cones outer→inner so the lighter band sits behind the darker one.
 */
export function conePair(
  x: number[],
  lower: number[],
  upper: number[],
  fill: string,
): PlotData[] {
  return [
    { x, y: upper, mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
    {
      x,
      y: lower,
      mode: 'lines',
      line: { width: 0 },
      fill: 'tonexty',
      fillcolor: fill,
      hoverinfo: 'skip',
      showlegend: false,
    },
  ];
}

export function medianLine(x: number[], y: number[]): PlotData {
  return { x, y, mode: 'lines', line: { color: PALETTE.median, width: 2.5 }, name: 'Median' };
}

/** A few thin sample trajectories for texture (kept small for performance). */
export function samplePaths(x: number[], paths: number[][], n = 12): PlotData[] {
  const step = Math.max(1, Math.floor(paths.length / n));
  const out: PlotData[] = [];
  for (let i = 0; i < paths.length && out.length < n; i += step) {
    out.push({
      x,
      y: paths[i],
      mode: 'lines',
      line: { color: PALETTE.sample, width: 1 },
      hoverinfo: 'skip',
      showlegend: false,
    });
  }
  return out;
}

/** Horizontal terminal-distribution histogram, aligned to the value axis (yaxis2 matches y). */
export function terminalHistogram(values: number[]): PlotData {
  return {
    y: values,
    type: 'histogram',
    orientation: 'h',
    xaxis: 'x2',
    yaxis: 'y2',
    marker: { color: PALETTE.bar },
    nbinsy: 36,
    hovertemplate: 'value ~%{y:.0f}<extra></extra>',
  };
}

/** A horizontal barrier line across the fan subplot. */
export function barrierShape(x0: number, x1: number, level: number) {
  return {
    type: 'line' as const,
    xref: 'x' as const,
    yref: 'y' as const,
    x0,
    x1,
    y0: level,
    y1: level,
    line: { color: PALETTE.barrier, width: 1.5, dash: 'dash' as const },
  };
}

export function mount(el: HTMLElement, traces: PlotData[], layout: Partial<Layout>): Promise<HTMLElement> {
  return Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}

export function purge(el: HTMLElement): void {
  Plotly.purge(el);
}

export function exportPlotlyPng(el: HTMLElement): Promise<string> {
  return Plotly.toImage(el, {
    format: 'png',
    width: Math.max(640, Math.round(el.clientWidth || 900)),
    height: Math.max(360, Math.round(el.clientHeight || 520)),
    scale: 2,
  });
}

/**
 * Reveal animation: grow the x-axis range left→right with an ease, like the paths
 * are drawing in. Returns a cancel function (call on update/destroy).
 */
export function revealX(el: HTMLElement, xMin: number, xMax: number, durationMs = 1100): () => void {
  let raf = 0;
  let cancelled = false;
  const startTs = performance.now();
  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startTs) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    void Plotly.relayout(el, { 'xaxis.range': [xMin, xMin + (xMax - xMin) * eased] });
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
