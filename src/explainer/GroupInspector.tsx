import { nodeIdsForSentence, type NodeInspection } from './graphModel';
import type { GraphData, SentenceRef } from './types';

interface Props {
  inspection: NodeInspection | null;
  sentence: SentenceRef | null;
  data: GraphData;
}

export function GroupInspector({ inspection, sentence, data }: Props) {
  if (sentence) {
    const relatedIds = new Set(nodeIdsForSentence(data, sentence));
    const related = data.nodes.filter((node) => relatedIds.has(node.id));

    return (
      <aside className="explainer-inspector" aria-label="Sentence evidence">
        <div className="inspector-eyebrow">Sentence evidence</div>
        <h2>{sentence.text}</h2>
        <p>This sentence is grounded in the highlighted graph nodes and deterministic browser math.</p>
        <div className="inspector-meta">
          <span>Agent</span>
          <strong>{formatRole(sentence.agent)}</strong>
        </div>
        {related.length > 0 ? (
          <section className="inspector-section" aria-label="Related graph nodes">
            <h3>Grounded nodes</h3>
            <div className="inspector-list">
              {related.slice(0, 10).map((node) => (
                <div key={node.id} className="inspector-row">
                  <span>{formatRole(node.role)}</span>
                  <strong>{node.label}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="inspector-empty">No linked graph evidence has resolved for this sentence yet.</p>
        )}
      </aside>
    );
  }

  if (!inspection) {
    return (
      <aside className="explainer-inspector" aria-label="Graph inspector">
        <div className="inspector-eyebrow">Graph inspector</div>
        <h2>Select a node</h2>
        <p>
          Click a graph node to inspect its color group, connected evidence, and related generated
          sentences.
        </p>
        <div className="inspector-empty">Gemma 4 reasoning details will appear here.</div>
      </aside>
    );
  }

  return (
    <aside className="explainer-inspector" aria-label="Graph inspector">
      <div className="inspector-eyebrow">Color group</div>
      <div className="inspector-title-row">
        <span
          className="inspector-swatch"
          style={{ backgroundColor: inspection.group.color }}
          aria-hidden="true"
        />
        <h2>{inspection.group.label}</h2>
      </div>
      <p>{inspection.group.summary}</p>

      <section className="inspector-section" aria-label="Selected graph node">
        <h3>Selected node</h3>
        <div className="inspector-focus">
          <span>{formatRole(inspection.selected.role)}</span>
          <strong>{inspection.selected.label}</strong>
        </div>
      </section>

      <section className="inspector-section" aria-label="Nodes in this color group">
        <h3>Group nodes</h3>
        <div className="inspector-list">
          {inspection.groupNodes.slice(0, 10).map((node) => (
            <div key={node.id} className="inspector-row">
              <span>{formatRole(node.role)}</span>
              <strong>{node.label}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-section" aria-label="Related graph nodes">
        <h3>Related nodes</h3>
        {inspection.related.length > 0 ? (
          <div className="inspector-list">
            {inspection.related.slice(0, 8).map((node) => (
              <div key={`${node.relation}:${node.id}`} className="inspector-row">
                <span>{formatRelation(node.relation)}</span>
                <strong>{node.label}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="inspector-empty">No upstream or downstream links have resolved yet.</p>
        )}
      </section>

      {inspection.sentences.length > 0 && (
        <section className="inspector-section" aria-label="Generated sentences referencing this node">
          <h3>Referenced by</h3>
          <div className="inspector-list">
            {inspection.sentences.slice(0, 3).map((item) => (
              <div key={item.id} className="inspector-row">
                <span>{formatRole(item.agent)}</span>
                <strong>{item.text}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

function formatRole(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRelation(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
