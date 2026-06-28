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
import { getTemplate } from '../templates';
import { USE_LIVE } from '../core/cerebras';
import { Renderer } from './Renderer';
import { Uploader } from './Uploader';
import { SpeedHud } from './SpeedHud';

const THEME = 'dark' as const;

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'orchestrator', label: 'Orchestrator' },
  { id: 'modeler', label: 'Modeler 👁' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'risk', label: 'Risk' },
  { id: 'explainer', label: 'Explainer' },
];

function paramsFromSpec(spec: DashboardSpec): ParamSet {
  return Object.fromEntries(spec.sliders.map((s) => [s.id, s.value]));
}

function formatVal(v: number, s: SliderDef): string {
  return `${v}${s.unit ?? ''}`;
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
  const [sim, setSim] = useState<SimResult>(() => initial.run(paramsFromSpec(initial.spec)));
  const [view, setView] = useState<ViewKind>(initial.spec.defaultView);
  const [animate, setAnimate] = useState(false);
  const [depth, setDepth] = useState<'entry' | 'expert'>('entry');

  const [agents, setAgents] = useState<Partial<Record<AgentId, AgentStatus>>>({});
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

  const dragTimer = useRef<number | undefined>(undefined);
  const dragStart = useRef<{ id: string; from: number } | null>(null);

  // --- the single event sink for the streaming cascade ---
  const onEvent = useCallback((e: AgentEvent) => {
    if (e.timeInfo) setLatestTime(e.timeInfo);
    setAgents((prev) => ({ ...prev, [e.agent]: e.status === 'token' ? 'start' : e.status }));

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

  const recompute = useCallback((p: ParamSet): SimResult => {
    const s = templateRef.current.run(p);
    setSim(s);
    return s;
  }, []);

  // Full build cascade: orchestrator → modeler → visualizer, then the interpretive trio.
  const runCascade = useCallback(
    async (input: PipelineInput) => {
      setBuilding(true);
      setExplainer({ text: '' });
      setSensitivity({ text: '' });
      setRisk({ flags: [] });
      setAgents({});
      try {
        const res = await runPipeline(input, onEvent);
        const tmpl = getTemplate(res.spec.templateId);
        const p = paramsFromSpec(res.spec);
        templateRef.current = tmpl;
        paramsRef.current = p;
        setTemplate(tmpl);
        setSpec(res.spec);
        setParams(p);
        setView(res.spec.defaultView);
        const s = tmpl.run(p);
        setSim(s);
        await runTweak(
          { templateId: res.spec.templateId, params: p, metrics: s.metrics, depth: depthRef.current },
          onEvent,
        );
      } finally {
        setBuilding(false);
      }
    },
    [onEvent],
  );

  // Initial cascade on mount.
  useEffect(() => {
    void runCascade({ intent: 'Explore portfolio ruin risk under volatility' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- slider loop: free client-side math on drag, rate-limited agents on release ---
  const onSliderPointerDown = (id: string) => {
    dragStart.current = { id, from: paramsRef.current[id] };
  };

  const onSliderInput = (id: string, value: number) => {
    const next = { ...paramsRef.current, [id]: value };
    paramsRef.current = next;
    setParams(next);
    window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => recompute(next), 110);
  };

  const onSliderRelease = (id: string) => {
    window.clearTimeout(dragTimer.current);
    const p = paramsRef.current;
    const s = recompute(p);
    const slider = spec.sliders.find((x) => x.id === id);
    const changed = dragStart.current
      ? { id, label: slider?.label, from: dragStart.current.from, to: p[id] }
      : undefined;
    dragStart.current = null;
    void runTweak(
      { templateId: spec.templateId, params: p, metrics: s.metrics, depth: depthRef.current, changed },
      onEvent,
    );
  };

  const onDepth = (d: 'entry' | 'expert') => {
    setDepth(d);
    depthRef.current = d;
    void runTweak(
      { templateId: spec.templateId, params: paramsRef.current, metrics: sim.metrics, depth: d },
      onEvent,
    );
  };

  const showViewToggle = spec.views.length > 1;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <h1>
              AugurForge
              <span className="tag-advice">decision-support · not advice</span>
            </h1>
            <div className="sub">Instant model sandbox for actuaries &amp; quants · Gemma-4-31b on Cerebras</div>
          </div>
        </div>
        <span className="agent-chip">
          <span className="led" style={{ background: USE_LIVE ? 'var(--ok)' : 'var(--accent-2)' }} />
          {USE_LIVE ? 'LIVE · gemma-4-31b' : 'MOCK MODE'}
        </span>
      </header>

      <main className="main">
        <section className="stage">
          <Uploader onRun={(input) => void runCascade(input)} disabled={building} />

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
                  onChange={(e) => onSliderInput(s.id, Number(e.target.value))}
                  onPointerUp={() => onSliderRelease(s.id)}
                  onKeyUp={() => onSliderRelease(s.id)}
                />
              </div>
            ))}

            <div className="spacer" />

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

          <div className="chart-wrap">
            <div className="chart-title">
              <h2>{spec.title}</h2>
              {spec.subtitle && <span>{spec.subtitle}</span>}
            </div>
            <Renderer template={template} sim={sim} view={view} animate={animate} theme={THEME} />
          </div>
        </section>

        <aside className="sidebar">
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
                    {f.text} {f.ref && <span className="ref">· {f.ref}</span>}
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

          <SpeedHud latest={latestTime} />

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Agent cascade</span>
            </div>
            <div className="cascade">
              {AGENTS.map((a) => (
                <span key={a.id} className={`agent-chip ${agents[a.id] ?? ''}`}>
                  <span className="led" />
                  {a.label}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}