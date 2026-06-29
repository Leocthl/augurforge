/**
 * App.tsx — the UI shell + orchestration root. [OWNER: A]
 *
 * Owns app state (template, params, sim, view, animate, depth) and the streaming-cascade
 * subscription. Numbers come from the client-side template.run(); the agent panels (risk,
 * explainer, sensitivity) stream in via render-on-resolve as each agent resolves.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentEvent,
  AgentId,
  AgentStatus,
  DashboardSpec,
  ExplainPayload,
  OnEvent,
  ParamSet,
  ProseResult,
  RiskFlag,
  RiskResult,
  SimResult,
  SliderDef,
  TemplateModule,
  TimeInfo,
  ViewKind,
} from '../core/contract';
import { runPipeline, runTweak, type PipelineInput } from '../core/pipeline';
import type { GeneratedTemplateBuild } from '../core/generative';
import { getTemplate } from '../templates';
import { USE_LIVE } from '../core/cerebras';
import { Renderer, type RendererApi } from './Renderer';
import { Uploader } from './Uploader';
import { SpeedHud } from './SpeedHud';

const THEME = 'dark' as const;

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'orchestrator', label: 'Gemma Orchestrator' },
  { id: 'modeler', label: 'Gemma Vision Modeler' },
  { id: 'visualizer', label: 'Gemma Visualizer' },
  { id: 'sensitivity', label: 'Gemma Sensitivity' },
  { id: 'risk', label: 'Gemma Risk' },
  { id: 'explainer', label: 'Gemma Explainer' },
];

declare global {
  interface Window {
    __AUGURFORGE_EXPLAIN_PAYLOAD__?: ExplainPayload;
  }
}

function paramsFromSpec(spec: DashboardSpec): ParamSet {
  return Object.fromEntries(spec.sliders.map((s) => [s.id, s.value]));
}

function formatVal(v: number, s: SliderDef): string {
  return `${v}${s.unit ?? ''}`;
}

function clampSliderValue(value: number, slider: SliderDef): number {
  return Math.min(slider.max, Math.max(slider.min, value));
}

function draftsFromParams(spec: DashboardSpec, params: ParamSet): Record<string, string> {
  return Object.fromEntries(spec.sliders.map((s) => [s.id, String(params[s.id] ?? s.value)]));
}

function parseDraftValue(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || 'augurforge-chart';
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

interface AuditItem {
  label: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function rawNumber(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rawString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value ? value : undefined;
}

function rawStrings(raw: Record<string, unknown>, key: string): string[] {
  const value = raw[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function intLabel(value: number | undefined): string | undefined {
  return value == null ? undefined : Math.round(value).toLocaleString();
}

function pctInterval(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const lower = rawNumber(value, 'lower');
  const upper = rawNumber(value, 'upper');
  if (lower == null || upper == null) return undefined;
  return `${(lower * 100).toFixed(1)}% - ${(upper * 100).toFixed(1)}%`;
}

function modelAuditItems(sim: SimResult): AuditItem[] {
  const raw = sim.raw ?? {};
  const calibration = isRecord(raw.calibration) ? raw.calibration : undefined;
  const calibrationSource = calibration?.source === 'manual-sliders' ? 'Manual sliders' : rawString(raw, 'calibrationSource');
  const renderPathCount = rawNumber(raw, 'renderPathCount');
  const conePathCount = rawNumber(raw, 'conePathCount');
  const items: Array<AuditItem | undefined> = [
    valueItem('Model', rawString(raw, 'modelFamily') ?? rawString(raw, 'modelKind')),
    valueItem('Metric paths', intLabel(rawNumber(raw, 'nPaths'))),
    valueItem(
      'Rendered sample',
      renderPathCount == null
        ? undefined
        : `${renderPathCount.toLocaleString()} paths${conePathCount ? `, ${conePathCount.toLocaleString()} cone` : ''}`,
    ),
    valueItem('Time step', rawNumber(raw, 'stepsPerYear') ? `${rawNumber(raw, 'stepsPerYear')} / yr` : undefined),
    valueItem('Seed', intLabel(rawNumber(raw, 'seed'))),
    valueItem('Calibration', calibrationSource),
    valueItem('Monitoring', rawString(raw, 'monitoring')),
  ];
  return items.filter((item): item is AuditItem => Boolean(item));
}

function uncertaintyItems(sim: SimResult): AuditItem[] {
  const uncertainty = isRecord(sim.raw?.uncertainty) ? sim.raw.uncertainty : undefined;
  if (!uncertainty) return [];
  return [
    valueItem('P(ruin) 95% CI', pctInterval(uncertainty.ruinProbability)),
    valueItem('VaR 95% CI', pctInterval(uncertainty.var95)),
    valueItem('ES 95% CI', pctInterval(uncertainty.es95)),
  ].filter((item): item is AuditItem => Boolean(item));
}

function valueItem(label: string, value: string | undefined): AuditItem | undefined {
  return value ? { label, value } : undefined;
}

function buildExplainPayload(
  spec: DashboardSpec,
  params: ParamSet,
  sim: SimResult,
  sensitivityText: string,
  riskFlags: RiskFlag[],
): ExplainPayload {
  return {
    templateId: spec.templateId,
    title: spec.title,
    params,
    sim: { metrics: sim.metrics, raw: sim.raw },
    narrative: {
      sensitivity: sensitivityText || undefined,
      explainer: spec.explainer,
      risk: riskFlags,
    },
  };
}

interface Prose {
  text: string;
  time?: TimeInfo;
}

export function App() {
  const initial = useMemo(() => getTemplate('monte-carlo'), []);
  const [template, setTemplate] = useState<TemplateModule>(initial);
  const [spec, setSpec] = useState<DashboardSpec>(initial.spec);
  const [params, setParams] = useState<ParamSet>(() => paramsFromSpec(initial.spec));
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>(() =>
    draftsFromParams(initial.spec, paramsFromSpec(initial.spec)),
  );
  const [sim, setSim] = useState<SimResult>(() => initial.run(paramsFromSpec(initial.spec)));
  const [view, setView] = useState<ViewKind>(initial.spec.defaultView);
  const [animate, setAnimate] = useState(false);
  const [depth, setDepth] = useState<'entry' | 'expert'>('entry');
  const [generatedBuild, setGeneratedBuild] = useState<GeneratedTemplateBuild | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [chartActionError, setChartActionError] = useState<string | null>(null);

  const [agents, setAgents] = useState<Partial<Record<AgentId, AgentStatus>>>({});
  const [agentErrors, setAgentErrors] = useState<Partial<Record<AgentId, string>>>({});
  const [explainer, setExplainer] = useState<Prose>({ text: '' });
  const [sensitivity, setSensitivity] = useState<Prose>({ text: '' });
  const [risk, setRisk] = useState<{ flags: RiskFlag[]; time?: TimeInfo }>({ flags: [] });
  const [latestTime, setLatestTime] = useState<TimeInfo | undefined>(undefined);
  const [building, setBuilding] = useState(false);

  // Refs so async streaming callbacks never read stale state.
  const templateRef = useRef(template);
  const paramsRef = useRef(params);
  const depthRef = useRef(depth);
  templateRef.current = template;
  paramsRef.current = params;
  depthRef.current = depth;

  const dragStart = useRef<{ id: string; from: number } | null>(null);
  const cascadeAbortRef = useRef<AbortController | null>(null);
  const tweakAbortRef = useRef<AbortController | null>(null);
  const chartWrapRef = useRef<HTMLElement>(null);
  const rendererRef = useRef<RendererApi>(null);

  // --- the single event sink for the streaming cascade ---
  const onEvent = useCallback((e: AgentEvent) => {
    if (e.timeInfo) setLatestTime(e.timeInfo);
    setAgents((prev) => ({ ...prev, [e.agent]: e.status === 'token' ? 'start' : e.status }));
    if (e.status === 'start') setAgentErrors((prev) => ({ ...prev, [e.agent]: undefined }));
    if (e.status === 'error') setAgentErrors((prev) => ({ ...prev, [e.agent]: e.error ?? 'Agent failed' }));

    if (e.agent === 'explainer') {
      if (e.status === 'start') setExplainer({ text: '' });
      else if (e.status === 'token') setExplainer((p) => ({ ...p, text: p.text + (e.delta ?? '') }));
      else if (e.status === 'done')
        setExplainer({ text: (e.result as ProseResult)?.text ?? '', time: e.timeInfo });
    } else if (e.agent === 'sensitivity') {
      if (e.status === 'start') setSensitivity({ text: '' });
      else if (e.status === 'token') setSensitivity((p) => ({ ...p, text: p.text + (e.delta ?? '') }));
      else if (e.status === 'done')
        setSensitivity({ text: (e.result as ProseResult)?.text ?? '', time: e.timeInfo });
    } else if (e.agent === 'risk' && e.status === 'done') {
      setRisk({ flags: (e.result as RiskResult)?.flags ?? [], time: e.timeInfo });
    }
  }, []);

  // Generation guard: events from a superseded interaction are dropped, so concurrent
  // runTweak/runCascade calls cannot interleave streamed prose.
  const tweakGenRef = useRef(0);
  const sinkFor = useCallback(
    (gen: number): OnEvent =>
      (e) => {
        if (gen === tweakGenRef.current) onEvent(e);
      },
    [onEvent],
  );

  const recompute = useCallback((p: ParamSet): SimResult => {
    const s = templateRef.current.run(p);
    setSim(s);
    return s;
  }, []);

  const runTweakWithAbort = useCallback(
    (ctx: Parameters<typeof runTweak>[0]) => {
      tweakAbortRef.current?.abort();
      const controller = new AbortController();
      tweakAbortRef.current = controller;
      const gen = ++tweakGenRef.current;
      void runTweak({ ...ctx, signal: controller.signal }, sinkFor(gen));
    },
    [sinkFor],
  );

  // Full build cascade: orchestrator → modeler → visualizer, then the interpretive trio.
  const runCascade = useCallback(
    async (input: PipelineInput) => {
      cascadeAbortRef.current?.abort();
      tweakAbortRef.current?.abort();
      const controller = new AbortController();
      cascadeAbortRef.current = controller;
      const gen = ++tweakGenRef.current;
      const sink = sinkFor(gen);
      setBuilding(true);
      setExplainer({ text: '' });
      setSensitivity({ text: '' });
      setRisk({ flags: [] });
      setAgents({});
      setAgentErrors({});
      setGeneratedBuild(null);
      try {
        const res = await runPipeline({ ...input, signal: controller.signal }, sink);
        if (controller.signal.aborted || gen !== tweakGenRef.current) return;
        const tmpl = res.generatedTemplate?.template ?? getTemplate(res.spec.templateId);
        const p = paramsFromSpec(res.spec);
        templateRef.current = tmpl;
        paramsRef.current = p;
        setTemplate(tmpl);
        setSpec(res.spec);
        setParams(p);
        setParamDrafts(draftsFromParams(res.spec, p));
        setView(res.spec.defaultView);
        setGeneratedBuild(res.generatedTemplate ?? null);
        const s = tmpl.run(p);
        setSim(s);
        await runTweak(
          {
            templateId: res.spec.templateId,
            params: p,
            metrics: s.metrics,
            raw: s.raw,
            depth: depthRef.current,
            signal: controller.signal,
          },
          sink,
        );
      } finally {
        if (gen === tweakGenRef.current) setBuilding(false);
      }
    },
    [onEvent, sinkFor],
  );

  // Initial cascade on mount.
  useEffect(() => {
    void runCascade({ intent: 'Explore portfolio ruin risk under volatility' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any pending debounced recompute on unmount.
  useEffect(
    () => () => {
      cascadeAbortRef.current?.abort();
      tweakAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === chartWrapRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  // --- slider loop: free client-side math on drag, rate-limited agents on release ---
  const onSliderPointerDown = (id: string) => {
    dragStart.current = { id, from: paramsRef.current[id] };
  };

  const onSliderInput = (id: string, value: number) => {
    const next = { ...paramsRef.current, [id]: value };
    paramsRef.current = next;
    setParams(next);
    setParamDrafts((prev) => ({ ...prev, [id]: String(value) }));
  };

  const commitParamValue = (id: string, raw: string | number) => {
    const slider = spec.sliders.find((x) => x.id === id);
    if (!slider) return;
    const previous = paramsRef.current[id] ?? slider.value;
    const parsed = parseDraftValue(raw);
    if (parsed === null) {
      setParamDrafts((prev) => ({ ...prev, [id]: String(previous) }));
      dragStart.current = null;
      return;
    }
    const value = clampSliderValue(parsed, slider);
    const next = { ...paramsRef.current, [id]: value };
    paramsRef.current = next;
    setParams(next);
    setParamDrafts((prev) => ({ ...prev, [id]: String(value) }));
    const from = dragStart.current?.id === id ? dragStart.current.from : previous;
    if (value === previous && from === previous) {
      dragStart.current = null;
      return;
    }
    const s = recompute(next);
    const changed = from !== value
      ? { id, label: slider.label, from, to: value }
      : undefined;
    dragStart.current = null;
    runTweakWithAbort({ templateId: spec.templateId, params: next, metrics: s.metrics, raw: s.raw, depth: depthRef.current, changed });
  };

  const onSliderRelease = (id: string) => {
    commitParamValue(id, paramsRef.current[id]);
  };

  const onDepth = (d: 'entry' | 'expert') => {
    setDepth(d);
    depthRef.current = d;
    runTweakWithAbort({ templateId: spec.templateId, params: paramsRef.current, metrics: sim.metrics, raw: sim.raw, depth: d });
  };

  const onExportPng = useCallback(async () => {
    setChartActionError(null);
    setExportingPng(true);
    try {
      const dataUrl = await rendererRef.current?.exportPng();
      if (!dataUrl) throw new Error('No chart renderer is mounted');
      downloadDataUrl(dataUrl, `${slugifyFilename(spec.title)}-${view}.png`);
    } catch (err) {
      console.error('[chart export]', err);
      setChartActionError('PNG export failed');
    } finally {
      setExportingPng(false);
    }
  }, [spec.title, view]);

  const onToggleFullscreen = useCallback(async () => {
    const el = chartWrapRef.current;
    if (!el) return;
    setChartActionError(null);
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.error('[chart fullscreen]', err);
      setChartActionError('Fullscreen unavailable');
    }
  }, []);

  const showViewToggle = spec.views.length > 1;
  const stackMode = USE_LIVE ? 'Live Cerebras' : 'Mock rehearsal';
  const auditItems = modelAuditItems(sim);
  const uncertainty = uncertaintyItems(sim);
  const assumptions = rawStrings(sim.raw ?? {}, 'assumptions').slice(0, 4);
  const warnings = rawStrings(sim.raw ?? {}, 'warnings').slice(0, 3);

  useEffect(() => {
    window.__AUGURFORGE_EXPLAIN_PAYLOAD__ = buildExplainPayload(
      spec,
      params,
      sim,
      sensitivity.text,
      risk.flags,
    );
  }, [params, risk.flags, sensitivity.text, sim, spec]);

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="eyebrow">Cerebras x Gemma 4</div>
            <h1>AugurForge</h1>
          </div>
        </div>

        <div className="rail-section">
          <span className="rail-label">Stack proof</span>
          <div className="stack-card">
            <span className="status-dot" data-live={USE_LIVE} />
            <div>
              <b>{stackMode}</b>
              <span>gemma-4-31b pinned</span>
            </div>
          </div>
          <div className="stack-list">
            <span>6 Gemma agents</span>
            <span>Vision input</span>
            <span>Generated runtime</span>
            <span>Deterministic math</span>
          </div>
        </div>

        <div className="rail-section">
          <span className="rail-label">Demo moves</span>
          <button
            className="rail-action primary"
            onClick={() =>
              void runCascade({
                mode: 'generate',
                intent: 'Build a Black-Scholes option pricing sandbox with Greeks and a pricing curve',
              })
            }
            disabled={building}
          >
            Generate model
          </button>
          <button
            className="rail-action"
            onClick={() =>
              void runCascade({
                mode: 'generate',
                intent: 'Build a non-finance SIR epidemic curve sandbox with susceptible infected recovered sliders',
              })
            }
            disabled={building}
          >
            SIR demo
          </button>
          <button
            className="rail-action"
            onClick={() => void runCascade({ intent: 'Explore portfolio ruin risk under volatility', mode: 'library' })}
            disabled={building}
          >
            Monte Carlo base
          </button>
        </div>

        <div className="rail-footer">
          <span>Decision-support, not advice</span>
          <span>Local demo, no deploy required</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-copy">
            <div className="eyebrow">Live execution bench</div>
            <h2>Gemma 4 shapes the model while Cerebras keeps every answer visibly fast.</h2>
            <div className="proof-row" aria-label="demo proof points">
              <span>6 Gemma agents</span>
              <span>Cerebras timing</span>
              <span>Browser math</span>
            </div>
          </div>
          <div className="topbar-metrics" aria-label="latest Cerebras timing">
            <div>
              <span>TTFT</span>
              <b>{latestTime?.ttftMs != null ? `${latestTime.ttftMs} ms` : 'ready'}</b>
            </div>
            <div>
              <span>tokens/s</span>
              <b>{latestTime?.tokensPerSec != null ? Math.round(latestTime.tokensPerSec) : 'standby'}</b>
            </div>
          </div>
        </header>

        <section className="composer-panel">
          <div className="composer-copy">
            <span>Model request</span>
            <b>Ask, attach, generate, tune.</b>
          </div>
          <Uploader onRun={(input) => void runCascade(input)} disabled={building} />
        </section>

        <section className="workbench">
          <div className="stage-column">
            <section className="parameter-strip">
              <div className="strip-head">
                <span>Model parameters</span>
                {building && <b>Gemma cascade running</b>}
              </div>
              <div className="controls">
                {spec.sliders.map((s) => (
                  <div className="slider-row" key={s.id}>
                    <label>
                      {s.label}
                      <b>{formatVal(params[s.id] ?? s.value, s)}</b>
                    </label>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={params[s.id] ?? s.value}
                      onPointerDown={() => onSliderPointerDown(s.id)}
                      onKeyDown={() => onSliderPointerDown(s.id)}
                      onChange={(e) => onSliderInput(s.id, Number(e.target.value))}
                      onPointerUp={() => onSliderRelease(s.id)}
                      onKeyUp={() => onSliderRelease(s.id)}
                    />
                    <div className="slider-input-row">
                      <input
                        className="param-number"
                        type="number"
                        aria-label={`${s.label} exact value`}
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={paramDrafts[s.id] ?? String(params[s.id] ?? s.value)}
                        disabled={building}
                        onFocus={() => onSliderPointerDown(s.id)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setParamDrafts((prev) => ({ ...prev, [s.id]: raw }));
                          const parsed = parseDraftValue(raw);
                          if (parsed !== null) {
                            const nextValue = clampSliderValue(parsed, s);
                            const next = { ...paramsRef.current, [s.id]: nextValue };
                            paramsRef.current = next;
                            setParams(next);
                          }
                        }}
                        onBlur={(e) => commitParamValue(s.id, e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitParamValue(s.id, e.currentTarget.value);
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            setParamDrafts((prev) => ({ ...prev, [s.id]: String(paramsRef.current[s.id] ?? s.value) }));
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      {s.unit && <span>{s.unit}</span>}
                    </div>
                  </div>
                ))}

                <div className="control-cluster">
                  {showViewToggle && (
                    <div className="seg" role="tablist" aria-label="view">
                      {spec.views.map((v) => (
                        <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                          {v.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="toggle">
                    <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
                    Animate
                  </label>
                </div>
              </div>
            </section>

            <section className="chart-wrap" ref={chartWrapRef}>
              <div className="chart-title">
                <div className="title-line">
                  <h2>{spec.title}</h2>
                  {generatedBuild && <span className="generated-badge">Generated by Gemma 4</span>}
                </div>
                {spec.subtitle && <span>{spec.subtitle}</span>}
                {generatedBuild && <span className="generated-note">{generatedBuild.note}</span>}
              </div>
              <div className="chart-actions" aria-label="Chart actions">
                <button
                  type="button"
                  className="chart-action png"
                  onClick={() => void onExportPng()}
                  disabled={exportingPng}
                  title="Export PNG"
                  aria-label="Export chart as PNG"
                >
                  PNG
                </button>
                <button
                  type="button"
                  className={`chart-action icon ${isFullscreen ? 'active' : ''}`}
                  onClick={() => void onToggleFullscreen()}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  aria-label={isFullscreen ? 'Exit fullscreen chart view' : 'Open fullscreen chart view'}
                >
                  <span className={`fullscreen-glyph ${isFullscreen ? 'exit' : 'enter'}`} aria-hidden="true" />
                </button>
              </div>
              {chartActionError && <div className="chart-action-note" role="status">{chartActionError}</div>}
              <Renderer ref={rendererRef} template={template} sim={sim} view={view} animate={animate} theme={THEME} />
            </section>
          </div>

          <aside className="insight-rail">
            <SpeedHud latest={latestTime} />

            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Metrics</span>
              </div>
              <div className="metrics">
                {sim.metrics.map((m) => (
                  <div className="metric" key={m.id}>
                    <div className="label">{m.label}</div>
                    <div className="value">{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {(auditItems.length > 0 || uncertainty.length > 0 || assumptions.length > 0 || warnings.length > 0) && (
              <div className="panel audit-panel">
                <div className="panel-head">
                  <span className="panel-title">Model audit</span>
                </div>
                {auditItems.length > 0 && (
                  <div className="audit-grid">
                    {auditItems.map((item) => (
                      <div className="audit-item" key={item.label}>
                        <span>{item.label}</span>
                        <b>{item.value}</b>
                      </div>
                    ))}
                  </div>
                )}
                {uncertainty.length > 0 && (
                  <div className="audit-lines">
                    {uncertainty.map((item) => (
                      <div className="audit-line" key={item.label}>
                        <span>{item.label}</span>
                        <b>{item.value}</b>
                      </div>
                    ))}
                  </div>
                )}
                {(assumptions.length > 0 || warnings.length > 0) && (
                  <div className="assumption-list">
                    {[...assumptions, ...warnings].map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {generatedBuild && (
              <div className="panel generated-panel">
                <div className="panel-head">
                  <span className="panel-title">Generated model</span>
                  {generatedBuild.fallbackUsed && <span className="panel-time warn">fallback</span>}
                </div>
                <p className="prose compact">
                  {generatedBuild.generatedSpec.title ?? spec.title}. Compiled from a validated Gemma 4 model spec
                  into deterministic browser math.
                </p>
              </div>
            )}

            <div className="panel agent-panel">
              <div className="panel-head">
                <span className="panel-title">Gemma agent cascade</span>
                {building && <span className="panel-time">streaming</span>}
              </div>
              <div className="cascade">
                {AGENTS.map((a) => (
                  <span key={a.id} className={`agent-chip ${agents[a.id] ?? ''}`}>
                    <span className="led" />
                    {a.label}
                  </span>
                ))}
              </div>
              {Object.entries(agentErrors).some(([, message]) => message) && (
                <div className="agent-errors">
                  {Object.entries(agentErrors).map(([agent, message]) =>
                    message ? (
                      <div className="agent-error" key={agent}>
                        <b>{agent}</b>
                        <span>{message}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>

            {(risk.flags.length > 0 || agents.risk) && (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Risk flags</span>
                  {risk.time?.totalMs != null && <span className="panel-time">{risk.time.totalMs} ms</span>}
                </div>
                {risk.flags.map((f, i) => (
                  <div className={`risk-flag ${f.level}`} key={i}>
                    <span className="dot" />
                    <div>
                      {f.text} {f.ref && <span className="ref">/ {f.ref}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(explainer.text || agents.explainer) && (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Explainer</span>
                  <div className="seg depth-seg">
                    <button className={depth === 'entry' ? 'active' : ''} onClick={() => onDepth('entry')}>
                      Entry
                    </button>
                    <button className={depth === 'expert' ? 'active' : ''} onClick={() => onDepth('expert')}>
                      Expert
                    </button>
                  </div>
                </div>
                <p className="prose">
                  {explainer.text}
                  {agents.explainer === 'start' && <span className="stream-caret" />}
                </p>
              </div>
            )}

            {(sensitivity.text || agents.sensitivity) && (
              <div className="panel">
                <div className="panel-head">
                  <span className="panel-title">Sensitivity</span>
                </div>
                <p className="prose">
                  {sensitivity.text}
                  {agents.sensitivity === 'start' && <span className="stream-caret" />}
                </p>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
