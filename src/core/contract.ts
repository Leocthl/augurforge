/**
 * AugurForge — THE CONTRACT.
 *
 * The single coordination point between the two dev sessions:
 *   A = /core, /app, /server   ·   B = /templates, /viz, /render-service
 *
 * Both sides import from this file and NEVER redefine these types elsewhere.
 * Frozen after the scaffold lands on `main` — change only by mutual agreement
 * (see CLAUDE.md and AugurForge_BUILD_SPEC.md §14). The type *names* here are the
 * stable surface; everything else in the repo is free to evolve around them.
 */

// ---------------------------------------------------------------------------
// View + theme
// ---------------------------------------------------------------------------

/** A renderable view of a model. Use '3d' only where the field is genuinely 3D. */
export type ViewKind = '2d' | '3d';

/** Renderer theme. The app currently ships dark. */
export type Theme = 'light' | 'dark';

// ---------------------------------------------------------------------------
// Inputs: sliders + parameters
// ---------------------------------------------------------------------------

/** One interactive control. On release (debounced) the client re-runs the sim. */
export interface SliderDef {
  /** Stable key — also the ParamSet key. e.g. 'sigma' */
  id: string;
  /** Human label. e.g. 'Volatility (σ)' */
  label: string;
  min: number;
  max: number;
  step: number;
  /** Current / default value. */
  value: number;
  /** Display suffix. e.g. '%' */
  unit?: string;
}

/** Flat parameter bag keyed by SliderDef.id — the only input to TemplateModule.run(). */
export type ParamSet = Record<string, number>;

// ---------------------------------------------------------------------------
// Outputs: the deterministic, client-side simulation result
// ---------------------------------------------------------------------------

/** One headline metric. e.g. { id:'p_ruin', label:'P(ruin)', value:'2.3%' } */
export interface Metric {
  id: string;
  label: string;
  /** Pre-formatted for display (units + precision already baked in). */
  value: string;
}

/** A named 2D series for line / curve charts. */
export interface Series {
  name: string;
  x: number[];
  y: number[];
}

/**
 * Deterministic numerical output — ALWAYS computed client-side by TemplateModule.run().
 * Gemma never fabricates these numbers; it only interprets them.
 */
export interface SimResult {
  /** Ensemble of sample paths (Monte Carlo). paths[i] is one trajectory over time. */
  paths?: number[][];
  /** Named curves (e.g. percentile cones, survival curve). */
  series?: Series[];
  /** Headline numbers (P(ruin), 95% VaR, …). */
  metrics: Metric[];
  /** Template-specific extras (terminal distribution, barrier, time axis, …). */
  raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The dashboard spec — drives the whole UI for one model
// ---------------------------------------------------------------------------

/** Two-depth narrative produced by the Explainer agent (or a template default). */
export interface Explainer {
  /** Plain-English, entry-level. */
  entry: string;
  /** Technical, expert-level. */
  expert: string;
}

/** Produced by the Visualizer agent, or supplied as a template default. */
export interface DashboardSpec {
  templateId: string;
  title: string;
  subtitle?: string;
  sliders: SliderDef[];
  /** ['2d','3d'] | ['3d'] | ['2d'] — the 2D/3D switch shows only when length > 1. */
  views: ViewKind[];
  defaultView: ViewKind;
  explainer?: Explainer;
}

// ---------------------------------------------------------------------------
// Rendering: imperative handles over Plotly / Three.js canvases
// ---------------------------------------------------------------------------

/** Per-render options. */
export interface RenderOpts {
  animate: boolean;
  theme: Theme;
}

/**
 * Imperative handle over a mounted chart. Returned by render2D / render3D.
 * `update()` repaints with fresh numbers WITHOUT recreating the canvas;
 * `destroy()` tears everything down (canvas, listeners, animation frames).
 */
export interface Renderer {
  update(sim: SimResult, animate: boolean): void;
  destroy(): void;
}

/** Factory that mounts a Renderer into an element. */
export type RenderFn = (el: HTMLElement, sim: SimResult, opts: RenderOpts) => Renderer;

/**
 * A model. One per file in /templates. Pure + client-side except the declarative spec.
 * Adding a model = adding one of these (or generating one live via the generative path).
 */
export interface TemplateModule {
  id: string;
  spec: DashboardSpec;
  run(params: ParamSet): SimResult;
  render2D?: RenderFn;
  render3D?: RenderFn;
}

// ---------------------------------------------------------------------------
// Agent streaming — render-on-resolve
// ---------------------------------------------------------------------------

export type AgentId =
  | 'orchestrator'
  | 'modeler'
  | 'visualizer'
  | 'sensitivity'
  | 'risk'
  | 'explainer';

export type AgentStatus = 'start' | 'token' | 'done' | 'error';

/** Speed telemetry surfaced from each Cerebras response (shown on the SpeedHud). */
export interface TimeInfo {
  /** Time to first token (ms). */
  ttftMs?: number;
  tokensPerSec?: number;
  totalTokens?: number;
  /** Wall-clock for the whole call (ms). */
  totalMs?: number;
}

/**
 * One event in the streaming cascade. The pipeline emits these as each agent resolves —
 * the UI paints the matching panel the instant the event lands (it never awaits all agents).
 */
export interface AgentEvent {
  agent: AgentId;
  status: AgentStatus;
  /** Streamed token text (status:'token'). */
  delta?: string;
  /** Final structured result (status:'done'); narrow with AgentResultMap at the call site. */
  result?: unknown;
  timeInfo?: TimeInfo;
  /** Error message (status:'error'). */
  error?: string;
}

export type OnEvent = (e: AgentEvent) => void;

// ---------------------------------------------------------------------------
// Per-agent typed results (what AgentEvent.result holds when status === 'done')
// ---------------------------------------------------------------------------

/** A governance / risk flag (Solvency II SCR, IFRS-17, tail risk, …). */
export interface RiskFlag {
  level: 'ok' | 'warning' | 'danger';
  text: string;
  /** Citation, assumption, or governance reference. */
  ref?: string;
}

export interface OrchestratorResult {
  templateId: string;
  intent: string;
  notes?: string;
}

export interface ModelerResult {
  templateId: string;
  params: ParamSet;
  sliders: SliderDef[];
  /** Optional notes on how raw input mapped to params (field → meaning). */
  mapping?: Record<string, string>;
}

export type VisualizerResult = DashboardSpec;

export interface RiskResult {
  flags: RiskFlag[];
}

/** Streamed-prose agents (sensitivity, explainer) carry their final text here on 'done'. */
export interface ProseResult {
  text: string;
}

/** Maps each AgentId to the shape of its `done` result — narrow AgentEvent.result with this. */
export interface AgentResultMap {
  orchestrator: OrchestratorResult;
  modeler: ModelerResult;
  visualizer: VisualizerResult;
  sensitivity: ProseResult;
  risk: RiskResult;
  explainer: ProseResult;
}
