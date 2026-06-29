/**
 * generative.ts — safe runtime-generated models. [OWNER: A]
 *
 * Gemma may describe a new model, but the browser never evaluates LLM-written JS.
 * We validate a small declarative spec and compile it into known deterministic
 * math. v1 ships a pre-tested Black-Scholes compiler as the demo fallback.
 */
import type {
  DashboardSpec,
  Explainer,
  Metric,
  ModelerResult,
  ParamSet,
  RenderOpts,
  Renderer,
  SimResult,
  SliderDef,
  TemplateModule,
  VizShape,
} from './contract';
import { blackScholes, impliedVolatility } from './math/black-scholes';

export const GENERATED_BLACK_SCHOLES_ID = 'generated:black-scholes';
export const GENERATED_SIR_ID = 'generated:sir';

type GeneratedModelKind = 'black-scholes' | 'sir';

export interface GeneratedTemplateSpec {
  id?: string;
  modelKind?: GeneratedModelKind;
  title?: string;
  subtitle?: string;
  sliders?: SliderDef[];
  explainer?: Explainer;
  mapping?: Record<string, string>;
}

export interface GeneratedModelerResult extends ModelerResult {
  generatedSpec?: GeneratedTemplateSpec;
}

export interface GeneratedTemplateBuild {
  template: TemplateModule;
  generatedSpec: GeneratedTemplateSpec;
  fallbackUsed: boolean;
  note: string;
}

const BLACK_SCHOLES_SLIDERS: SliderDef[] = [
  { id: 'spot', label: 'Spot price', min: 50, max: 160, step: 1, value: 100, unit: '' },
  { id: 'strike', label: 'Strike price', min: 50, max: 160, step: 1, value: 105, unit: '' },
  { id: 'volatility', label: 'Volatility', min: 5, max: 80, step: 1, value: 24, unit: '%' },
  { id: 'rate', label: 'Risk-free rate', min: 0, max: 12, step: 0.25, value: 4.5, unit: '%' },
  { id: 'dividendYield', label: 'Dividend yield', min: 0, max: 8, step: 0.25, value: 0, unit: '%' },
  { id: 'maturity', label: 'Maturity', min: 0.1, max: 5, step: 0.1, value: 1, unit: 'yr' },
];

const SIR_SLIDERS: SliderDef[] = [
  { id: 'population', label: 'Population', min: 1000, max: 1000000, step: 1000, value: 100000, unit: '' },
  { id: 'initialInfected', label: 'Initial infected', min: 1, max: 5000, step: 10, value: 100, unit: '' },
  { id: 'reproductionNumber', label: 'R0', min: 0.5, max: 5, step: 0.1, value: 2.1, unit: '' },
  { id: 'recoveryDays', label: 'Recovery time', min: 2, max: 30, step: 1, value: 9, unit: 'd' },
  { id: 'horizonDays', label: 'Horizon', min: 30, max: 240, step: 5, value: 120, unit: 'd' },
];

const BLACK_SCHOLES_EXPLAINER: Explainer = {
  entry:
    'This generated sandbox prices a European option from spot, strike, volatility, rates, dividend yield, and maturity. The curves show how call and put values move as the underlying price changes.',
  expert:
    'Black-Scholes assumes lognormal returns, constant volatility, continuous compounding, continuous dividend yield, and European exercise. The dashboard shows closed-form call/put prices, Greeks, parity residual, and an implied-volatility round trip.',
};

const SIR_EXPLAINER: Explainer = {
  entry:
    'This generated non-finance sandbox follows a simple epidemic curve: susceptible people become infected, then recover. Move R0 or recovery time to see the peak shift.',
  expert:
    'The SIR compiler uses a deterministic daily Euler integration with beta = R0 / recoveryDays and gamma = 1 / recoveryDays. It is a transparent teaching model, not a medical forecast.',
};

export function wantsGeneratedModel(intent?: string, mode?: string): boolean {
  const text = (intent ?? '').toLowerCase();
  return (
    mode === 'generate' ||
    /\b(generate|generated|new model|not in the library|write .*model|black[-\s]?scholes|option|greeks?|sir|epidemic|infection|non[-\s]?finance)\b/.test(text)
  );
}

export function isGeneratedTemplateId(id?: string): boolean {
  return Boolean(id && id.startsWith('generated:'));
}

export function fallbackGeneratedSpec(intent?: string): GeneratedTemplateSpec {
  const kind = inferGeneratedKind(intent);
  return {
    id: generatedIdForKind(kind),
    modelKind: kind,
    title:
      kind === 'sir'
        ? 'Generated SIR Epidemic Sandbox'
        : /\b(option|black[-\s]?scholes|greeks?)\b/i.test(intent ?? '')
          ? 'Generated Black-Scholes Option Sandbox'
          : 'Generated Option Pricing Sandbox',
    subtitle:
      kind === 'sir'
        ? 'Gemma-authored model spec, deterministic SIR math'
        : 'Gemma-authored model spec, deterministic Black-Scholes math',
    sliders: slidersForKind(kind),
    explainer: explainerForKind(kind),
    mapping: {
      generated: 'Compiled from a validated declarative model spec, not arbitrary generated code.',
      model: kind === 'sir' ? 'Susceptible-infected-recovered compartment model.' : 'European call and put pricing with Greeks.',
    },
  };
}

export function createGeneratedTemplate(
  raw: unknown,
  intent?: string,
  visualizerSpec?: DashboardSpec,
): GeneratedTemplateBuild {
  const fallback = fallbackGeneratedSpec(intent);
  const parsed = sanitizeGeneratedSpec(raw, fallback);
  const fallbackUsed = parsed.fallbackUsed;
  const generatedSpec = parsed.spec;
  const dashboard = mergeDashboardSpec(generatedSpec, visualizerSpec);
  const modelKind = generatedSpec.modelKind ?? 'black-scholes';

  const template: TemplateModule = {
    id: generatedSpec.id ?? generatedIdForKind(modelKind),
    spec: dashboard,
    run: modelKind === 'sir' ? runSir : runBlackScholes,
    render2D: modelKind === 'sir' ? renderSir2D : renderBlackScholes2D,
  };

  return {
    template,
    generatedSpec,
    fallbackUsed,
    note: fallbackUsed
      ? `Used the pre-tested ${modelKind === 'sir' ? 'SIR' : 'Black-Scholes'} fallback after validation rejected the generated spec.`
      : `Compiled a validated generated model spec into the deterministic ${modelKind === 'sir' ? 'SIR' : 'Black-Scholes'} runtime.`,
  };
}

function sanitizeGeneratedSpec(
  raw: unknown,
  fallback: GeneratedTemplateSpec,
): { spec: GeneratedTemplateSpec; fallbackUsed: boolean } {
  if (!isRecord(raw)) return { spec: fallback, fallbackUsed: true };
  const modelKind = isGeneratedModelKind(raw.modelKind) ? raw.modelKind : undefined;
  if (!modelKind) return { spec: fallback, fallbackUsed: true };

  const sliders = sanitizeSliders(raw.sliders, slidersForKind(modelKind));
  const title = cleanText(raw.title, fallback.title ?? defaultTitleForKind(modelKind), 72);
  const subtitle = cleanText(
    raw.subtitle,
    fallback.subtitle ?? 'Gemma-authored model spec, deterministic math',
    120,
  );
  const explainer = sanitizeExplainer(raw.explainer, fallback.explainer ?? explainerForKind(modelKind));
  const mapping = isRecord(raw.mapping) ? cleanMapping(raw.mapping) : fallback.mapping;

  return {
    spec: {
      id: generatedIdForKind(modelKind),
      modelKind,
      title,
      subtitle,
      sliders,
      explainer,
      mapping,
    },
    fallbackUsed: false,
  };
}

function mergeDashboardSpec(spec: GeneratedTemplateSpec, visualizerSpec?: DashboardSpec): DashboardSpec {
  const modelKind = spec.modelKind ?? 'black-scholes';
  return {
    templateId: spec.id ?? generatedIdForKind(modelKind),
    title: visualizerSpec?.title || spec.title || defaultTitleForKind(modelKind),
    subtitle: visualizerSpec?.subtitle || spec.subtitle,
    sliders: sanitizeSliders(visualizerSpec?.sliders ?? spec.sliders, slidersForKind(modelKind)),
    views: ['2d'],
    defaultView: '2d',
    explainer: visualizerSpec?.explainer ?? spec.explainer ?? explainerForKind(modelKind),
  };
}

function sanitizeSliders(raw: unknown, fallback: SliderDef[]): SliderDef[] {
  if (!Array.isArray(raw)) return fallback.map((s) => ({ ...s }));
  const byId = new Map(fallback.map((s) => [s.id, s]));
  const cleaned: SliderDef[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    const base = byId.get(item.id);
    if (!base) continue;
    const min = finiteNumber(item.min, base.min);
    const max = Math.max(min + base.step, finiteNumber(item.max, base.max));
    const value = clamp(finiteNumber(item.value, base.value), min, max);
    cleaned.push({
      id: base.id,
      label: cleanText(item.label, base.label, 36),
      min,
      max,
      step: finiteNumber(item.step, base.step),
      value,
      unit: typeof item.unit === 'string' ? item.unit.slice(0, 6) : base.unit,
    });
  }
  return cleaned.length === fallback.length ? cleaned : fallback.map((s) => ({ ...s }));
}

function sanitizeExplainer(raw: unknown, fallback: Explainer): Explainer {
  if (!isRecord(raw)) return fallback;
  return {
    entry: cleanText(raw.entry, fallback.entry, 360),
    expert: cleanText(raw.expert, fallback.expert, 520),
  };
}

function cleanMapping(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw).slice(0, 8)) {
    if (typeof value !== 'string') continue;
    const cleanKey = key.replace(/[^\w.-]/g, '').slice(0, 32);
    if (cleanKey) out[cleanKey] = value.slice(0, 160);
  }
  return out;
}

function cleanText(raw: unknown, fallback: string, max: number): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

function finiteNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isGeneratedModelKind(value: unknown): value is GeneratedModelKind {
  return value === 'black-scholes' || value === 'sir';
}

function inferGeneratedKind(intent?: string): GeneratedModelKind {
  return /\b(sir|epidemic|infection|infectious|disease|non[-\s]?finance)\b/i.test(intent ?? '')
    ? 'sir'
    : 'black-scholes';
}

function generatedIdForKind(kind: GeneratedModelKind): string {
  return kind === 'sir' ? GENERATED_SIR_ID : GENERATED_BLACK_SCHOLES_ID;
}

function slidersForKind(kind: GeneratedModelKind): SliderDef[] {
  return (kind === 'sir' ? SIR_SLIDERS : BLACK_SCHOLES_SLIDERS).map((s) => ({ ...s }));
}

function explainerForKind(kind: GeneratedModelKind): Explainer {
  return kind === 'sir' ? SIR_EXPLAINER : BLACK_SCHOLES_EXPLAINER;
}

function defaultTitleForKind(kind: GeneratedModelKind): string {
  return kind === 'sir' ? 'Generated SIR Epidemic Sandbox' : 'Generated Option Pricing Sandbox';
}

function runBlackScholes(params: ParamSet): SimResult {
  const spot = Math.max(0.01, params.spot ?? 100);
  const strike = Math.max(0.01, params.strike ?? 105);
  const volatility = clamp(params.volatility ?? 24, 1, 200);
  const rate = clamp(params.rate ?? 4.5, -20, 30);
  const dividendYield = clamp(params.dividendYield ?? 0, 0, 30);
  const maturity = clamp(params.maturity ?? 1, 0.01, 30);
  const current = blackScholes({
    spot,
    strike,
    volatility: volatility / 100,
    rate: rate / 100,
    dividendYield: dividendYield / 100,
    maturity,
  });
  const impliedVol = impliedVolatility({
    optionType: 'call',
    targetPrice: current.call,
    spot,
    strike,
    rate: rate / 100,
    dividendYield: dividendYield / 100,
    maturity,
  });

  const xMin = Math.max(0.01, spot * 0.45);
  const xMax = Math.max(xMin + 1, spot * 1.65);
  const steps = 80;
  const x: number[] = [];
  const call: number[] = [];
  const put: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = xMin + ((xMax - xMin) * i) / steps;
    const p = blackScholes({
      spot: s,
      strike,
      volatility: volatility / 100,
      rate: rate / 100,
      dividendYield: dividendYield / 100,
      maturity,
    });
    x.push(s);
    call.push(p.call);
    put.push(p.put);
  }

  const metrics: Metric[] = [
    { id: 'call_price', label: 'Call price', value: money(current.call) },
    { id: 'put_price', label: 'Put price', value: money(current.put) },
    { id: 'call_delta', label: 'Call delta', value: current.callDelta.toFixed(2) },
    { id: 'put_delta', label: 'Put delta', value: current.putDelta.toFixed(2) },
    { id: 'gamma', label: 'Gamma', value: current.gamma.toFixed(4) },
    { id: 'vega', label: 'Vega / vol pt', value: money(current.vega / 100) },
    { id: 'theta', label: 'Call theta / yr', value: money(current.callTheta) },
    { id: 'rho', label: 'Call rho / rate pt', value: money(current.callRho / 100) },
  ];
  const shapes: VizShape[] = [
    {
      kind: 'curve',
      series: [
        { name: 'call', x, y: call },
        { name: 'put', x, y: put },
      ],
    },
    {
      kind: 'distribution',
      values: [current.call, current.put],
      markers: [
        { label: 'call', value: current.call },
        { label: 'put', value: current.put },
      ],
    },
  ];

  return {
    series: [
      { name: 'call', x, y: call },
      { name: 'put', x, y: put },
    ],
    metrics,
    raw: {
      modelKind: 'black-scholes',
      generated: true,
      shapes,
      spot,
      strike,
      volatility,
      rate,
      dividendYield,
      maturity,
      call: current.call,
      put: current.put,
      callDelta: current.callDelta,
      putDelta: current.putDelta,
      gamma: current.gamma,
      vega: current.vega,
      callTheta: current.callTheta,
      putTheta: current.putTheta,
      callRho: current.callRho,
      putRho: current.putRho,
      d1: current.d1,
      d2: current.d2,
      parityResidual: current.parityResidual,
      impliedVolatilityFromCall: impliedVol,
      warnings: current.warnings,
      assumptions: [
        'European exercise with no early-exercise premium.',
        'Lognormal underlying returns with constant volatility and continuously compounded rates.',
        'Dividend yield is continuous and deterministic.',
      ],
      xMin,
      xMax,
      yMax: Math.max(...call, ...put, 1),
    },
  };
}

function runSir(params: ParamSet): SimResult {
  const population = Math.round(clamp(params.population ?? 100000, 1000, 1000000));
  const initialInfected = Math.round(clamp(params.initialInfected ?? 100, 1, Math.min(5000, population - 1)));
  const reproductionNumber = clamp(params.reproductionNumber ?? 2.1, 0.5, 5);
  const recoveryDays = clamp(params.recoveryDays ?? 9, 2, 30);
  const horizonDays = Math.round(clamp(params.horizonDays ?? 120, 30, 240));
  const gamma = 1 / recoveryDays;
  const beta = reproductionNumber * gamma;

  const x: number[] = [];
  const susceptible: number[] = [];
  const infected: number[] = [];
  const recovered: number[] = [];
  let s = population - initialInfected;
  let i = initialInfected;
  let r = 0;
  let peakInfected = i;
  let peakDay = 0;

  for (let day = 0; day <= horizonDays; day++) {
    x.push(day);
    susceptible.push(s);
    infected.push(i);
    recovered.push(r);
    if (i > peakInfected) {
      peakInfected = i;
      peakDay = day;
    }
    const newInfections = beta * s * i / population;
    const newRecoveries = gamma * i;
    s = clamp(s - newInfections, 0, population);
    i = clamp(i + newInfections - newRecoveries, 0, population);
    r = clamp(population - s - i, 0, population);
  }

  const finalRecovered = recovered[recovered.length - 1] ?? 0;
  const attackRate = finalRecovered / population;
  const metrics: Metric[] = [
    { id: 'peak_infected', label: 'Peak infected', value: Math.round(peakInfected).toLocaleString() },
    { id: 'peak_day', label: 'Peak day', value: `${peakDay} d` },
    { id: 'attack_rate', label: 'Attack rate', value: `${(attackRate * 100).toFixed(1)}%` },
    { id: 'final_recovered', label: 'Final recovered', value: Math.round(finalRecovered).toLocaleString() },
  ];
  const series = [
    { name: 'susceptible', x, y: susceptible },
    { name: 'infected', x, y: infected },
    { name: 'recovered', x, y: recovered },
  ];
  const shapes: VizShape[] = [
    { kind: 'curve', series },
    {
      kind: 'distribution',
      values: infected,
      markers: [{ label: 'peak infected', value: peakInfected }],
    },
  ];

  return {
    series,
    metrics,
    raw: {
      modelKind: 'sir',
      modelFamily: 'SIR',
      generated: true,
      shapes,
      population,
      initialInfected,
      reproductionNumber,
      recoveryDays,
      horizonDays,
      beta,
      gamma,
      peakInfected,
      peakDay,
      finalRecovered,
      attackRate,
      assumptions: [
        'Closed population with no births, deaths, or interventions.',
        'Homogeneous mixing; every susceptible person has the same average contact risk.',
        'Deterministic daily Euler integration; this is not a medical forecast.',
      ],
      warnings: ['SIR is a teaching model; real outbreaks need calibration, reporting delay, and intervention data.'],
      xMin: 0,
      xMax: horizonDays,
      yMax: Math.max(population, peakInfected, 1),
    },
  };
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function renderBlackScholes2D(el: HTMLElement, sim: SimResult, opts: RenderOpts): Renderer {
  const paint = (next: SimResult, animate: boolean) => {
    const call = next.series?.find((s) => s.name === 'call');
    const put = next.series?.find((s) => s.name === 'put');
    if (!call || !put) return;
    const width = Math.max(640, el.clientWidth || 900);
    const height = Math.max(360, el.clientHeight || 520);
    const pad = { left: 58, right: 26, top: 44, bottom: 54 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const xMin = finiteNumber(next.raw?.xMin, call.x[0] ?? 1);
    const xMax = Math.max(xMin + 1e-6, finiteNumber(next.raw?.xMax, call.x[call.x.length - 1] ?? 160));
    const yMax = Math.max(1e-6, finiteNumber(next.raw?.yMax, 40) * 1.1);
    const spot = finiteNumber(next.raw?.spot, 100);
    const strike = finiteNumber(next.raw?.strike, 105);
    const themeInk = opts.theme === 'dark' ? '#d9e7f5' : '#172033';
    const dim = opts.theme === 'dark' ? '#7d8da3' : '#5a6575';
    const grid = opts.theme === 'dark' ? 'rgba(125,141,163,0.22)' : 'rgba(90,101,117,0.24)';

    const xSpan = Math.max(1e-6, xMax - xMin);
    const sx = (x: number) => pad.left + ((x - xMin) / xSpan) * plotW;
    const sy = (y: number) => pad.top + plotH - (y / yMax) * plotH;
    const line = (xs: number[], ys: number[]) =>
      xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
    const callPath = line(call.x, call.y);
    const putPath = line(put.x, put.y);
    const spotX = sx(spot);
    const strikeX = sx(strike);
    const dashOffset = animate ? 'dashoffset' : 'none';

    el.innerHTML = `
      <svg class="generated-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Generated Black-Scholes option price curves">
        <defs>
          <linearGradient id="generatedCall" x1="0" x2="1">
            <stop offset="0%" stop-color="#2dd4bf" />
            <stop offset="100%" stop-color="#38bdf8" />
          </linearGradient>
          <linearGradient id="generatedPut" x1="0" x2="1">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#f472b6" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
        ${[0, 0.25, 0.5, 0.75, 1]
          .map((t) => {
            const y = pad.top + plotH * t;
            const value = yMax * (1 - t);
            return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" stroke="${grid}" />
              <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${dim}" font-size="11">$${value.toFixed(0)}</text>`;
          })
          .join('')}
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top + plotH}" y2="${pad.top + plotH}" stroke="${grid}" />
        <line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + plotH}" stroke="${grid}" />
        <line x1="${strikeX}" x2="${strikeX}" y1="${pad.top}" y2="${pad.top + plotH}" stroke="rgba(251,191,36,0.62)" stroke-dasharray="5 6" />
        <line x1="${spotX}" x2="${spotX}" y1="${pad.top}" y2="${pad.top + plotH}" stroke="rgba(56,189,248,0.72)" stroke-dasharray="2 6" />
        <path class="generated-path ${dashOffset}" d="${putPath}" fill="none" stroke="url(#generatedPut)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path class="generated-path ${dashOffset}" d="${callPath}" fill="none" stroke="url(#generatedCall)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <text x="${spotX + 7}" y="${pad.top + 16}" fill="#38bdf8" font-size="11">spot ${spot.toFixed(0)}</text>
        <text x="${strikeX + 7}" y="${pad.top + 34}" fill="#fbbf24" font-size="11">strike ${strike.toFixed(0)}</text>
        <text x="${pad.left}" y="${height - 18}" fill="${dim}" font-size="12">Underlying price</text>
        <text x="${pad.left}" y="${pad.top - 14}" fill="${themeInk}" font-size="13" font-weight="700">Option value vs underlying price</text>
        <g transform="translate(${width - 178},${pad.top - 24})">
          <circle cx="0" cy="0" r="4" fill="#38bdf8" /><text x="10" y="4" fill="${themeInk}" font-size="12">Call</text>
          <circle cx="62" cy="0" r="4" fill="#f59e0b" /><text x="72" y="4" fill="${themeInk}" font-size="12">Put</text>
        </g>
      </svg>
    `;
  };

  paint(sim, opts.animate);
  return {
    update: (next, animate) => paint(next, animate),
    destroy: () => {
      el.innerHTML = '';
    },
  };
}

function renderSir2D(el: HTMLElement, sim: SimResult, opts: RenderOpts): Renderer {
  const paint = (next: SimResult, animate: boolean) => {
    const series = next.series ?? [];
    const susceptible = series.find((s) => s.name === 'susceptible');
    const infected = series.find((s) => s.name === 'infected');
    const recovered = series.find((s) => s.name === 'recovered');
    if (!susceptible || !infected || !recovered) return;
    const width = Math.max(640, el.clientWidth || 900);
    const height = Math.max(360, el.clientHeight || 520);
    const pad = { left: 64, right: 28, top: 48, bottom: 54 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const xMin = 0;
    const xMax = Math.max(1, finiteNumber(next.raw?.xMax, susceptible.x[susceptible.x.length - 1] ?? 120));
    const yMax = Math.max(1, finiteNumber(next.raw?.yMax, 100000) * 1.04);
    const themeInk = opts.theme === 'dark' ? '#d9e7f5' : '#172033';
    const dim = opts.theme === 'dark' ? '#7d8da3' : '#5a6575';
    const grid = opts.theme === 'dark' ? 'rgba(125,141,163,0.22)' : 'rgba(90,101,117,0.24)';
    const sx = (x: number) => pad.left + ((x - xMin) / Math.max(1e-6, xMax - xMin)) * plotW;
    const sy = (y: number) => pad.top + plotH - (y / yMax) * plotH;
    const line = (xs: number[], ys: number[]) =>
      xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
    const dashOffset = animate ? 'dashoffset' : 'none';
    const peakDay = finiteNumber(next.raw?.peakDay, 0);
    const peakInfected = finiteNumber(next.raw?.peakInfected, 0);
    const peakX = sx(peakDay);
    const peakY = sy(peakInfected);

    el.innerHTML = `
      <svg class="generated-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Generated SIR epidemic curves">
        <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
        ${[0, 0.25, 0.5, 0.75, 1]
          .map((t) => {
            const y = pad.top + plotH * t;
            const value = yMax * (1 - t);
            return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" stroke="${grid}" />
              <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${dim}" font-size="11">${Math.round(value).toLocaleString()}</text>`;
          })
          .join('')}
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top + plotH}" y2="${pad.top + plotH}" stroke="${grid}" />
        <line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + plotH}" stroke="${grid}" />
        <path class="generated-path ${dashOffset}" d="${line(susceptible.x, susceptible.y)}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path class="generated-path ${dashOffset}" d="${line(infected.x, infected.y)}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path class="generated-path ${dashOffset}" d="${line(recovered.x, recovered.y)}" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${peakX}" cy="${peakY}" r="4.5" fill="#fbbf24" stroke="rgba(255,255,255,0.7)" />
        <text x="${Math.min(width - 150, peakX + 8)}" y="${Math.max(pad.top + 16, peakY - 8)}" fill="#fbbf24" font-size="11">peak day ${peakDay.toFixed(0)}</text>
        <text x="${pad.left}" y="${height - 18}" fill="${dim}" font-size="12">Days</text>
        <text x="${pad.left}" y="${pad.top - 14}" fill="${themeInk}" font-size="13" font-weight="700">SIR compartments over time</text>
        <g transform="translate(${width - 250},${pad.top - 24})">
          <circle cx="0" cy="0" r="4" fill="#38bdf8" /><text x="10" y="4" fill="${themeInk}" font-size="12">S</text>
          <circle cx="50" cy="0" r="4" fill="#f59e0b" /><text x="60" y="4" fill="${themeInk}" font-size="12">I</text>
          <circle cx="100" cy="0" r="4" fill="#4ade80" /><text x="110" y="4" fill="${themeInk}" font-size="12">R</text>
        </g>
      </svg>
    `;
  };

  paint(sim, opts.animate);
  return {
    update: (next, animate) => paint(next, animate),
    destroy: () => {
      el.innerHTML = '';
    },
  };
}
