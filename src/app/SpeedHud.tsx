/**
 * SpeedHud.tsx — Cerebras time_info HUD + the Cerebras-vs-baseline race. [OWNER: A]
 * Works fully offline: the mock client gives Cerebras a tiny TTFT + high tok/s and the
 * baseline a slow GPU profile, so the race is demo-able with no key.
 * TODO(branch: feat/speed-harness): wire a real baseline provider for the live race.
 */
import { useState } from 'react';
import type { TimeInfo } from '../core/contract';
import { chat, type Provider } from '../core/cerebras';

interface Props {
  latest?: TimeInfo;
}

interface RaceState {
  running: boolean;
  cerebras?: number;
  baseline?: number;
}

const RACE_PROMPT = 'In one sentence, summarize the portfolio ruin risk for a board audience.';
const RACE_MOCK = 'Ruin risk is moderate at current volatility, but the tail grows quickly as σ rises.';

export function SpeedHud({ latest }: Props) {
  const [race, setRace] = useState<RaceState>({ running: false });

  const runRace = async () => {
    setRace({ running: true });
    const fire = async (provider: Provider) => {
      const start = performance.now();
      await chat({
        messages: [{ role: 'user', content: RACE_PROMPT }],
        stream: true,
        provider,
        mock: { text: RACE_MOCK },
      });
      return Math.round(performance.now() - start);
    };
    const [cerebras, baseline] = await Promise.all([fire('cerebras'), fire('baseline')]);
    setRace({ running: false, cerebras, baseline });
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
      <div className="hud" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
        <div className="hud-stat" style={{ textAlign: 'left' }}>
          <div className="k">TTFT</div>
          <div className="v">{latest?.ttftMs != null ? `${latest.ttftMs} ms` : '—'}</div>
        </div>
        <div className="hud-stat" style={{ textAlign: 'left' }}>
          <div className="k">tokens/s</div>
          <div className="v">{latest?.tokensPerSec != null ? Math.round(latest.tokensPerSec) : '—'}</div>
        </div>
      </div>

      <div className="race">
        <div className="race-row">
          <span className="who">Cerebras</span>
          <div className="race-track"><div className="race-fill cerebras" style={{ width: `${pctOf(race.cerebras)}%` }} /></div>
          <span className="ms">{race.cerebras ? `${race.cerebras} ms` : '—'}</span>
        </div>
        <div className="race-row">
          <span className="who">GPU baseline</span>
          <div className="race-track"><div className="race-fill baseline" style={{ width: `${pctOf(race.baseline)}%` }} /></div>
          <span className="ms">{race.baseline ? `${race.baseline} ms` : '—'}</span>
        </div>
      </div>

      <button className="btn" style={{ marginTop: 12, width: '100%' }} onClick={runRace} disabled={race.running}>
        {race.running ? 'Racing…' : 'Run speed race'}
      </button>
    </div>
  );
}