// Minimal ambient typings for the exact plotly.js-dist-min surface AugurForge uses.
// We deliberately avoid @types/plotly.js (CommonJS `export =` interop friction) and type
// only the functions the viz helpers call. Extend this as /viz grows.
declare module 'plotly.js-dist-min' {
  export type PlotData = Record<string, unknown>;
  export type Layout = Record<string, unknown>;
  export type Config = Record<string, unknown>;

  export function newPlot(
    root: HTMLElement,
    data: PlotData[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ): Promise<HTMLElement>;

  export function react(
    root: HTMLElement,
    data: PlotData[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ): Promise<HTMLElement>;

  export function addTraces(root: HTMLElement, traces: PlotData | PlotData[]): Promise<HTMLElement>;
  export function relayout(root: HTMLElement, layout: Partial<Layout>): Promise<HTMLElement>;
  export function restyle(
    root: HTMLElement,
    update: Record<string, unknown>,
    traces?: number[],
  ): Promise<HTMLElement>;
  export function animate(root: HTMLElement, frameOrGroup: unknown, opts?: unknown): Promise<void>;
  export function purge(root: HTMLElement): void;
}