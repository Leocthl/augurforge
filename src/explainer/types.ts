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