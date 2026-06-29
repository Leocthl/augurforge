import { useEffect, useRef, useState } from 'react';
import type { TimeInfo } from '../core/contract';
import { chat, USE_LIVE, type Provider } from '../core/cerebras';

interface Props {
  latest?: TimeInfo;
}

/** One provider's measured run: end-to-end wall clock plus the streamed telemetry. */
interface Lap {
  totalMs: number;
  ttftMs?: number;
  tokensPerSec?: number;
  /** True when this lap used mock timing (offline, or a live call that fell back). */
  simulated: boolean;
}

interface RaceState {
  running: boolean;
  cerebras?: Lap;
  baseline?: Lap;
  error?: string;
}

const RACE_PROMPT =
  'Read this model request and image summary. Pick the model path, propose sliders, identify two risk flags, and write the first explanation sentence. Request: explore portfolio ruin risk from a loss triangle screenshot. Image summary: cumulative paid triangle, AY rows, development periods, missing future cells.';
const RACE_MOCK =
  'Route to Monte Carlo GBM, use volatility/drift/horizon sliders, flag calibration and tail risk, and explain that higher volatility widens the ruin-risk cone.';
const DEFAULT_BASELINE_LABEL = 'OpenRouter · Gemma 4';

const fmtMs = (ms?: number) => (ms != null ? `${Math.round(ms)} ms` : '—');
const fmtRate = (n?: number) => (n != null ? Math.round(n).toLocaleString() : '—');

export function SpeedHud({ latest }: Props) {
  const [race, setRace] = useState<RaceState>({ running: false });
  const [baselineLive, setBaselineLive] = useState(false);
  const [baselineLabel, setBaselineLabel] = useState(DEFAULT_BASELINE_LABEL);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!USE_LIVE) return;
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBaselineLive(Boolean(data?.baselineConfigured));
        if (typeof data?.baselineLabel === 'string' && data.baselineLabel) {
          setBaselineLabel(data.baselineLabel);
        }
      })
      .catch(() => {
        if (!cancelled) setBaselineLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runRace = async () => {
    setRace({ running: true });
    const fire = async (provider: Provider): Promise<Lap> => {
      const start = performance.now();
      const { timeInfo, simulated } = await chat({
        messages: [{ role: 'user', content: RACE_PROMPT }],
        stream: true,
        provider,
        maxTokens: 80,
        fallbackToMock: provider === 'baseline',
        mock: { text: RACE_MOCK },
      });
      return {
        totalMs: Math.round(performance.now() - start),
        ttftMs: timeInfo.ttftMs,
        tokensPerSec: timeInfo.tokensPerSec,
        simulated: Boolean(simulated),
      };
    };
    try {
      // Same prompt, same Gemma 4, same instant — fired in parallel at both backends.
      const [cerebras, baseline] = await Promise.all([fire('cerebras'), fire('baseline')]);
      if (!mounted.current) return;
      setRace({ running: false, cerebras, baseline });
    } catch (err) {
      if (!mounted.current) return;
      setRace({
        running: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const cMs = race.cerebras?.totalMs;
  const bMs = race.baseline?.totalMs;
  const maxMs = Math.max(cMs ?? 1, bMs ?? 1);
  const pctOf = (ms?: number) => (ms ? Math.max(6, (ms / maxMs) * 100) : 0);
  const speedup = cMs && bMs ? (bMs / cMs).toFixed(1) : null;
  // `(sim)` reflects what ACTUALLY happened on the last run: a side is simulated in offline
  // mode, or when a live call fell back to mock (no key, bad slug, rate limit, network).
  // Falls back to config before the first race. Keeps the proof honest about what's real.
  const baselineSim = race.baseline?.simulated ?? (!USE_LIVE || !baselineLive);
  const cerebrasSim = race.cerebras?.simulated ?? !USE_LIVE;
  const baselineName = baselineSim ? `${baselineLabel} (sim)` : baselineLabel;
  const cerebrasName = cerebrasSim ? 'Cerebras (sim)' : 'Cerebras';
  const hasResult = Boolean(race.cerebras || race.baseline);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Cerebras vs OpenRouter</span>
        {speedup && <span className="panel-time">{speedup}× faster</span>}
      </div>
      <div className="hud">
        <div className="hud-stat">
          <div className="k">TTFT</div>
          <div className="v">{latest?.ttftMs != null ? `${latest.ttftMs} ms` : 'ready'}</div>
        </div>
        <div className="hud-stat">
          <div className="k">tokens/s</div>
          <div className="v">{latest?.tokensPerSec != null ? Math.round(latest.tokensPerSec) : 'standby'}</div>
        </div>
      </div>

      {hasResult && (
        <div className="race-compare">
          <div className="rc-head">
            <span />
            <span className="rc-col cerebras">{cerebrasName}</span>
            <span className="rc-col">{baselineName}</span>
          </div>
          <div className="rc-row">
            <span className="rc-k">TTFT</span>
            <b className="cerebras">{fmtMs(race.cerebras?.ttftMs)}</b>
            <b>{fmtMs(race.baseline?.ttftMs)}</b>
          </div>
          <div className="rc-row">
            <span className="rc-k">tokens/s</span>
            <b className="cerebras">{fmtRate(race.cerebras?.tokensPerSec)}</b>
            <b>{fmtRate(race.baseline?.tokensPerSec)}</b>
          </div>
        </div>
      )}

      <div className="race">
        <div className="race-row">
          <span className="who">Cerebras</span>
          <div className="race-track"><div className="race-fill cerebras" style={{ width: `${pctOf(cMs)}%` }} /></div>
          <span className="ms">{cMs ? `${cMs} ms` : 'ready'}</span>
        </div>
        <div className="race-row">
          <span className="who">OpenRouter</span>
          <div className="race-track"><div className="race-fill baseline" style={{ width: `${pctOf(bMs)}%` }} /></div>
          <span className="ms">{bMs ? `${bMs} ms` : 'standby'}</span>
        </div>
      </div>
      {race.error && <p className="hud-error">{race.error}</p>}

      <button className="btn speed-race-button" onClick={runRace} disabled={race.running}>
        {race.running ? 'Racing Gemma 4...' : 'Race Gemma 4: Cerebras vs OpenRouter'}
      </button>
    </div>
  );
}
