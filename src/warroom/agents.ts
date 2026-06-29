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

/**
 * Muted, professional desk accents — one per group, harmonized with each group's sprite uniform.
 * Deliberately NOT the explainer's neon ROLE_COLOR: the situation room stays on the restrained light
 * register (CLAUDE.md forbids neon / cyber-cockpit). Tints desk monitors, the active-group glow,
 * activation arrows and bubble stripes.
 */
export const GROUP_COLOR: Record<AgentId, string> = {
  orchestrator: '#4f7fae', // steel blue
  modeler: '#4f8a86', // slate teal
  visualizer: '#b5894a', // muted ochre
  sensitivity: '#7d6f9c', // muted violet
  risk: '#b06a63', // clay red
  explainer: '#5f9166', // sage green
};