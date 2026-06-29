/**
 * types.ts — shapes for the live "thinking graph". [OWNER: B / explainer]
 * Reuses the frozen AgentEvent contract; never redefines it.
 */
import type { AgentEvent, AgentId, OnEvent } from '../core/contract';
export type { AgentEvent, AgentId, OnEvent };

export type NodeRole =
  | AgentId
  | 'input'
  | 'param'
  | 'model'
  | 'risk-flag'
  | 'insight';

/** A node react-force-graph mutates with x/y/z as it simulates — kept optional. */
export interface GNode {
  id: string;
  label: string;
  role: NodeRole;
  color: string;
  size: number;
  bornAt: number;
  pulse: boolean;
  x?: number;
  y?: number;
  z?: number;
}

export interface GLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GNode[];
  links: GLink[];
}

/** One disciplined accent per role — galaxy palette over a near-black canvas. */
export const ROLE_COLOR: Record<NodeRole, string> = {
  input: '#e6edf6',
  orchestrator: '#38bdf8',
  modeler: '#a78bfa',
  visualizer: '#22d3ee',
  sensitivity: '#fbbf24',
  risk: '#fb7185',
  explainer: '#4ade80',
  param: '#7dd3fc',
  model: '#818cf8',
  'risk-flag': '#fb7185',
  insight: '#86efac',
};

/** Visual intensity tier for the graph: restrained embed vs cinematic showcase. */
export type GraphVariant = 'embed' | 'showcase';

/** One agent's reasoning beat in the ordered cascade transcript. */
export interface ReasoningBeat {
  agent: AgentId;
  text: string;
  status: 'streaming' | 'done' | 'error';
}

/** Restrained, design-token-aligned palette for the embedded mini-graph (hex approximations of
 *  the OKLCH tokens in src/index.css: --blue family / --amber / --green / --red). Three.Color
 *  cannot parse oklch(), so concrete hex values are used. */
export const EMBED_ROLE_COLOR: Record<NodeRole, string> = {
  input: '#dbe6f5',
  orchestrator: '#6aa3f5',
  modeler: '#4f8ff0',
  visualizer: '#3f7fe0',
  sensitivity: '#e0a34d',
  risk: '#e06857',
  explainer: '#46c08a',
  param: '#8fbdf7',
  model: '#5f97ef',
  'risk-flag': '#e06857',
  insight: '#46c08a',
};