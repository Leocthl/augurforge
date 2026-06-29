import type { AugurForgeSessionSnapshot, SessionAttachment } from '../core/sessionContext';

interface Props {
  session: AugurForgeSessionSnapshot | null;
  mode: 'mock' | 'real';
  onReplaceInput: () => void;
}

export function SourceReceiptPanel({ session, mode, onReplaceInput }: Props) {
  const attachments = session?.input?.attachments ?? [];
  const metrics = session?.metrics ?? [];
  const title = session?.title ?? (mode === 'real' ? 'Live session' : 'Mock cascade');
  const summary =
    session?.latestSummary ??
    'No live main-app session is attached. The standalone explainer can run from its mock cascade.';

  return (
    <aside className="source-receipt" aria-label="Explainer source receipt">
      <div className="source-receipt-head">
        <div>
          <div className="inspector-eyebrow">Source</div>
          <h2>{title}</h2>
        </div>
        <span className={`source-mode is-${mode}`}>{mode === 'real' ? 'Real' : 'Mock'}</span>
      </div>
      <p>{summary}</p>

      {session?.input?.intent && (
        <div className="source-intent">
          <span>Input intent</span>
          <strong>{session.input.intent}</strong>
        </div>
      )}

      {attachments.length > 0 ? (
        <section className="source-section" aria-label="Attached source files">
          <h3>Attachments</h3>
          <div className="source-chips">
            {attachments.slice(0, 4).map((attachment) => (
              <span key={attachment.id} title={attachment.name}>
                {attachment.name}
                <small>{attachmentMeta(attachment)}</small>
              </span>
            ))}
            {attachments.length > 4 && <span>+{attachments.length - 4} more</span>}
          </div>
        </section>
      ) : (
        <div className="source-empty">No attachments in this receipt.</div>
      )}

      {metrics.length > 0 && (
        <section className="source-section" aria-label="Session metrics">
          <h3>Session metrics</h3>
          <div className="source-metrics">
            {metrics.slice(0, 3).map((metric) => (
              <div key={`${metric.label}:${metric.value}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="source-footer">
        <span>{session ? `Updated ${formatUpdatedAt(session.updatedAt)}` : 'Decision-support, not advice'}</span>
        <button type="button" className="source-replace" onClick={onReplaceInput}>
          Replace input
        </button>
      </div>
    </aside>
  );
}

function attachmentMeta(attachment: SessionAttachment): string {
  const parts = [attachment.kind, formatBytes(attachment.size)].filter(Boolean);
  return parts.join(' · ');
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value)) return 'recently';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
