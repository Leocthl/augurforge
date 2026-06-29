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

export const AGENT_RESPONSIBILITY: Record<AgentId, string> = {
  orchestrator: 'Routes the request, selects the modeling path, and keeps the Gemma cascade moving.',
  modeler: 'Maps messy inputs into deterministic browser parameters without inventing simulation math.',
  visualizer: 'Turns the model output into a readable 2D or 3D workbench view with industry-standard framing.',
  sensitivity: 'Stress-tests the important assumptions and identifies which controls move the outcome.',
  risk: 'Flags tail risk, governance caveats, and decision-support boundaries before anyone over-trusts the result.',
  explainer: 'Translates the live model, evidence, and caveats into plain-English and expert-readable narrative.',
};

export const AGENT_PANIC_LINES: Record<AgentId, string[]> = {
  orchestrator: [
    'Routing year-two chaos. Please keep receipts.',
    'Opening a clean incident channel for one question.',
  ],
  modeler: [
    'Reopening assumptions with a fresh pen.',
    'Checking whether the math is being dramatic or useful.',
  ],
  visualizer: [
    'If this becomes a waterfall chart, I am blaming variance.',
    'Clearing screen space for the suspicious curve.',
  ],
  sensitivity: [
    'Stress knobs unlocked. Nobody touch drift yet.',
    'Perturbing the input and pretending this is calm.',
  ],
  risk: [
    'Year-two loss? Fine, reopening the tail cabinet.',
    'Putting a highlighter on the ugly percentile.',
  ],
  explainer: [
    'Converting panic into plain English.',
    'Removing jargon before it gets into the minutes.',
  ],
};
