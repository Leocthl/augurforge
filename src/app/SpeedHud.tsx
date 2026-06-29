import { useEffect, useState } from 'react';
import type { TimeInfo } from '../core/contract';
import { chat, USE_LIVE, type Provider } from '../core/cerebras';

interface Props {
  latest?: TimeInfo;
}

interface RaceState {
  running: boolean;
  cerebras?: number;
  baseline?: number;
  error?: string;
}

const RACE_PROMPT = 'In one sentence, summarize the portfolio ruin risk for a board audience.';
const RACE_MOCK = 'Ruin risk is moderate at current volatility, but the tail grows quickly as σ rises.';

export function SpeedHud({ latest }: Props) {
  const [race, setRace] = useState<RaceState>({ running: false });
  const [baselineLive, setBaselineLive] = useState(false);

  useEffect(() => {
    if (!USE_LIVE) return;
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setBaselineLive(Boolean(data?.baselineConfigured));
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
    const fire = async (provider: Provider) => {
      const start = performance.now();
      await chat({
        messages: [{ role: 'user', content: RACE_PROMPT }],
        stream: true,
        provider,
        maxTokens: 80,
        fallbackToMock: provider === 'baseline',
        mock: { text: RACE_MOCK },
      });
      return Math.round(performance.now() - start);
    };
    try {
      const [cerebras, baseline] = await Promise.all([fire('cerebras'), fire('baseline')]);
      setRace({ running: false, cerebras, baseline });
    } catch (err) {
      setRace({
        running: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const maxMs = Math.max(race.cerebras ?? 1, race.baseline ?? 1);
  const pctOf = (ms?: number) => (ms ? Math.max(6, (ms / maxMs) * 100) : 0);
  const speedup =
    race.cerebras && race.baseline ? (race.baseline / race.cerebras).toFixed(1) : null;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Cerebras speed</span>
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

      <div className="race">
        <div className="race-row">
          <span className="who">Cerebras</span>
          <div className="race-track"><div className="race-fill cerebras" style={{ width: `${pctOf(race.cerebras)}%` }} /></div>
          <span className="ms">{race.cerebras ? `${race.cerebras} ms` : 'ready'}</span>
        </div>
        <div className="race-row">
          <span className="who">{baselineLive ? 'GPU baseline' : 'GPU baseline sim'}</span>
          <div className="race-track"><div className="race-fill baseline" style={{ width: `${pctOf(race.baseline)}%` }} /></div>
          <span className="ms">{race.baseline ? `${race.baseline} ms` : 'standby'}</span>
        </div>
      </div>
      {race.error && <p className="hud-error">{race.error}</p>}

      <button className="btn speed-race-button" onClick={runRace} disabled={race.running}>
        {race.running ? 'Racing…' : 'Run speed race'}
      </button>
    </div>
  );
}
