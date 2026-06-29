import { ROLE_DEFS } from './roleAnalysis';
import type { RoleImpactResult, RoleImpactStatus, StakeholderRoleId } from './types';

interface Props {
  activeRole: StakeholderRoleId;
  statuses: Record<StakeholderRoleId, RoleImpactStatus>;
  results: Partial<Record<StakeholderRoleId, RoleImpactResult>>;
  onSelectRole: (roleId: StakeholderRoleId) => void;
}

export function RoleImpactPanel({ activeRole, statuses, results, onSelectRole }: Props) {
  const result = results[activeRole];
  const status = statuses[activeRole] ?? 'idle';
  const activeLabel = ROLE_DEFS.find((role) => role.id === activeRole)?.label ?? 'Stakeholder';
  const panelId = `role-panel-${activeRole}`;

  return (
    <section className="role-panel" aria-label="Stakeholder impact analysis">
      <div className="inspector-eyebrow">Stakeholder impact</div>
      <div className="role-tabs" role="tablist" aria-label="Stakeholder perspectives">
        {ROLE_DEFS.map((role) => {
          const selected = activeRole === role.id;
          return (
            <button
              key={role.id}
              id={`role-tab-${role.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`role-panel-${role.id}`}
              tabIndex={selected ? 0 : -1}
              className={`role-tab${selected ? ' is-active' : ''}`}
              onClick={() => onSelectRole(role.id)}
            >
              {role.label}
              <span className={`role-status is-${statuses[role.id] ?? 'idle'}`}>
                {statusLabel(statuses[role.id] ?? 'idle')}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        className="role-panel-body"
        role="tabpanel"
        aria-labelledby={`role-tab-${activeRole}`}
      >
        {!result ? (
          <div className="role-empty" aria-live={status === 'loading' ? 'polite' : 'off'}>
            {emptyText(status, activeLabel)}
          </div>
        ) : (
          <RoleImpactCard result={result} />
        )}
      </div>
    </section>
  );
}

function RoleImpactCard({ result }: { result: RoleImpactResult }) {
  return (
    <div className="role-impact-card">
      <div className="role-score">
        <strong>{Math.round(result.impactScore)}</strong>
        <div>
          <span className={`role-risk is-${result.riskLevel}`}>{result.riskLevel}</span>
          {result.simulated && <span className="role-simulated">Mock</span>}
        </div>
      </div>
      <p>{result.brief}</p>
      {result.error && <p className="role-error">Fallback generated after role analysis error: {result.error}</p>}
      <div className="role-metrics" aria-label={`${result.title} impact metrics`}>
        {result.metrics.map((metric) => {
          const percent = Math.round(clamp(metric.weight, 0, 1) * 100);
          return (
            <div key={`${metric.label}:${metric.value}`} className="role-metric">
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
              <span
                className="role-metric-track"
                role="meter"
                aria-label={`${metric.label} weight`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span className="role-metric-bar" style={{ width: `${percent}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function statusLabel(status: RoleImpactStatus): string {
  switch (status) {
    case 'loading':
      return 'Running';
    case 'done':
      return 'Ready';
    case 'error':
      return 'Fallback';
    case 'idle':
      return 'Queued';
  }
}

function emptyText(status: RoleImpactStatus, roleLabel: string): string {
  switch (status) {
    case 'loading':
      return `Gemma 4 is preparing the ${roleLabel} view.`;
    case 'error':
      return `The ${roleLabel} view needs another pass. The graph remains available.`;
    case 'done':
      return `No ${roleLabel} result was returned for this run.`;
    case 'idle':
      return `Run the cascade to preload the ${roleLabel} view.`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
