/** agents.ts — the fixed six-agent identity, shared by crowd/scene/traits. [OWNER: B / warroom] */
import type { AgentId } from '../core/contract';

export const AGENT_ORDER: AgentId[] = [
  'orchestrator',
  'modeler',
  'visualizer',
  'sensitivity',
  'risk',
  'explainer',
];

export const AGENT_LABEL: Record<AgentId, string> = {
  orchestrator: 'Orchestrator',
  modeler: 'Modeler',
  visualizer: 'Visualizer',
  sensitivity: 'Sensitivity',
  risk: 'Risk',
  explainer: 'Explainer',
};