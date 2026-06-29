/**
 * traits.ts — Gemma-authored character design + loader. [OWNER: B / warroom]
 *
 * `characters.json` holds the per-group design Gemma 4 (on Cerebras) generated: palette, build,
 * headgear. bakeAtlas.ts turns these into a pixel sprite sheet. This module validates the JSON and
 * falls back to a built-in muted palette if it is missing/malformed, so the scene always renders.
 */
import type { AgentId } from '../core/contract';
import { AGENT_ORDER } from './agents';
import charactersJson from './characters.json';

export type Build = 'slim' | 'avg' | 'broad';
export type Headgear = 'none' | 'cap' | 'headset' | 'visor' | 'beanie';

export interface GroupPalette {
  skin: string[];
  hair: string[];
  top: string;
  bottom: string;
  accent: string;
}

export interface GroupTraits {
  agentId: AgentId;
  title: string;
  concept: string;
  build: Build;
  headgear: Headgear;
  palette: GroupPalette;
}

const BUILDS: Build[] = ['slim', 'avg', 'broad'];
const HEADGEARS: Headgear[] = ['none', 'cap', 'headset', 'visor', 'beanie'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Deterministic fallback so the scene renders even without/with bad characters.json. */
const FALLBACK: Record<AgentId, GroupTraits> = {
  orchestrator: { agentId: 'orchestrator', title: 'Routing Desk', concept: 'Dispatchers in steel blue', build: 'avg', headgear: 'headset',
    palette: { skin: ['#f5d1b0', '#c68642', '#8d5524'], hair: ['#4a3728', '#7b5e4f', '#a68b7c'], top: '#5a7d9a', bottom: '#3c3c3c', accent: '#d1d1d1' } },
  modeler: { agentId: 'modeler', title: 'Quant Desk', concept: 'Analysts in slate teal', build: 'slim', headgear: 'none',
    palette: { skin: ['#ffdbac', '#e0ac69', '#8d5524'], hair: ['#2d2926', '#5c4033', '#b8a99a'], top: '#4a6d75', bottom: '#2f2f2f', accent: '#89a8ad' } },
  visualizer: { agentId: 'visualizer', title: 'Design Desk', concept: 'Architects in muted ochre', build: 'slim', headgear: 'beanie',
    palette: { skin: ['#f1c27d', '#c68642', '#5c3836'], hair: ['#634e34', '#a0522d', '#d2b48c'], top: '#b08d57', bottom: '#403d39', accent: '#8b7355' } },
  sensitivity: { agentId: 'sensitivity', title: 'Analysis Desk', concept: 'Testers in muted violet', build: 'avg', headgear: 'visor',
    palette: { skin: ['#fce2c4', '#d2b48c', '#8d5524'], hair: ['#3a3a3a', '#704214', '#c0c0c0'], top: '#7a6f8a', bottom: '#353535', accent: '#5e5469' } },
  risk: { agentId: 'risk', title: 'Audit Desk', concept: 'Auditors in clay red', build: 'broad', headgear: 'none',
    palette: { skin: ['#f5d1b0', '#b08d57', '#5c3836'], hair: ['#1a1a1a', '#4b3621', '#8b7355'], top: '#965a5a', bottom: '#2b2b2b', accent: '#734545' } },
  explainer: { agentId: 'explainer', title: 'Comms Desk', concept: 'Writers in muted green', build: 'avg', headgear: 'cap',
    palette: { skin: ['#ffdbac', '#c68642', '#8d5524'], hair: ['#2c1e1e', '#5e4b3f', '#a68b7c'], top: '#6b8e6b', bottom: '#3a3a3a', accent: '#4d664d' } },
};

function hexArr(a: unknown, fb: string[]): string[] {
  const arr = Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string' && HEX.test(s)) : [];
  return arr.length ? arr.slice(0, 4) : fb;
}
function hex(s: unknown, fb: string): string {
  return typeof s === 'string' && HEX.test(s) ? s : fb;
}
function oneOf<T extends string>(s: unknown, allowed: T[], fb: T): T {
  return typeof s === 'string' && (allowed as string[]).includes(s) ? (s as T) : fb;
}

function validate(id: AgentId, raw: unknown): GroupTraits {
  const fb = FALLBACK[id];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = (r.palette && typeof r.palette === 'object' ? r.palette : {}) as Record<string, unknown>;
  return {
    agentId: id,
    title: typeof r.title === 'string' ? r.title : fb.title,
    concept: typeof r.concept === 'string' ? r.concept : fb.concept,
    build: oneOf(r.build, BUILDS, fb.build),
    headgear: oneOf(r.headgear, HEADGEARS, fb.headgear),
    palette: {
      skin: hexArr(p.skin, fb.palette.skin),
      hair: hexArr(p.hair, fb.palette.hair),
      top: hex(p.top, fb.palette.top),
      bottom: hex(p.bottom, fb.palette.bottom),
      accent: hex(p.accent, fb.palette.accent),
    },
  };
}

/** Validated traits for the six groups, in AGENT_ORDER. Always returns 6 entries. */
export function loadGroupTraits(): GroupTraits[] {
  const groups = (charactersJson as { groups?: unknown }).groups;
  const byId = new Map<string, unknown>();
  if (Array.isArray(groups)) {
    for (const g of groups) {
      const id = (g as { agentId?: unknown })?.agentId;
      if (typeof id === 'string') byId.set(id, g);
    }
  }
  return AGENT_ORDER.map((id) => validate(id, byId.get(id)));
}