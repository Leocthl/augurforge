/**
 * crowd.ts — the situation-room crowd model. [OWNER: B / warroom]
 *
 * Pure(ish) simulation layer for the canvas-2D war room: six agent GROUPS, each a CLUSTER of many
 * simple stick figures that WANDER continuously inside their zone (random-walk velocity + a subtle
 * vertical bob). No React, no canvas — just data + a per-frame integrator so the renderer stays dumb.
 *
 * Positions are seeded DETERMINISTICALLY from a tiny hashed PRNG so a React re-render that rebuilds
 * the crowd lands the figures in the same places (no thrash).
 */
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

/** One wandering stick figure. All coords are in CSS pixels (DPR handled at draw time). */
export interface Character {
  /** Home anchor inside the zone — the wander drifts around this point. */
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Per-character phase + speed for the vertical bob, so the crowd is not in lockstep. */
  bobPhase: number;
  bobSpeed: number;
  /** Slight per-figure scale so the cluster reads as a crowd, not a stamp. */
  scale: number;
}

/** A rectangular zone the cluster is clamped to (CSS pixels). */
export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Cluster centre + label anchor. */
  cx: number;
  cy: number;
}

export interface Group {
  id: AgentId;
  label: string;
  color: string;
  zone: Zone;
  chars: Character[];
}

/** Live, derived status for one group — fed in each frame from the reasoning reducer. */
export interface GroupStatus {
  started: boolean;
  thinking: boolean;
  done: boolean;
  caption: string;
}

/** Layout + crowd geometry the renderer also needs (board rect, sizing). */
export interface CrowdLayout {
  width: number;
  height: number;
  board: { x: number; y: number; w: number; h: number };
  groups: Group[];
}

// --- deterministic PRNG (mulberry32) ----------------------------------------

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- crowd sizing ------------------------------------------------------------

const MIN_PER_GROUP = 18;
const MAX_PER_GROUP = 34;
/** Hard cap on total figures so the rAF loop stays smooth on weak hardware. */
const MAX_TOTAL = 200;

/** Pick a per-group crowd count that scales with canvas area but stays in the crowded band. */
export function crowdPerGroup(width: number, height: number): number {
  const area = width * height;
  // ~one figure per 9k px², spread across six groups, clamped to the crowded band + smoothness cap.
  const byArea = Math.round(area / 9000 / AGENT_ORDER.length);
  const capped = Math.min(byArea, Math.floor(MAX_TOTAL / AGENT_ORDER.length));
  return Math.max(MIN_PER_GROUP, Math.min(MAX_PER_GROUP, capped));
}

// --- layout ------------------------------------------------------------------

/**
 * Lay the six zones out as 2 rows × 3 columns around a central situation board.
 * The board sits in the middle band; zones fill the left/right of the top row and the whole
 * bottom row, so the crowd visually surrounds the board.
 */
export function computeLayout(width: number, height: number): {
  board: { x: number; y: number; w: number; h: number };
  zones: Zone[];
} {
  const padX = Math.max(24, width * 0.03);
  const padY = Math.max(24, height * 0.04);
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const colW = innerW / 3;
  const rowH = innerH / 2;

  // Central board occupies the middle column of the TOP row.
  const board = {
    x: padX + colW,
    y: padY + rowH * 0.12,
    w: colW,
    h: rowH * 0.76,
  };

  const zoneFor = (col: number, row: number): Zone => {
    const zx = padX + col * colW + colW * 0.06;
    const zy = padY + row * rowH + rowH * 0.06;
    const zw = colW * 0.88;
    const zh = rowH * 0.88;
    return { x: zx, y: zy, w: zw, h: zh, cx: zx + zw / 2, cy: zy + zh / 2 };
  };

  // Top row: left + right columns (centre is the board). Bottom row: all three columns.
  const zones: Zone[] = [
    zoneFor(0, 0), // orchestrator (top-left)
    zoneFor(2, 0), // modeler (top-right)
    zoneFor(0, 1), // visualizer (bottom-left)
    zoneFor(1, 1), // sensitivity (bottom-centre)
    zoneFor(2, 1), // risk (bottom-right)
    zoneFor(1, 0), // explainer — slim band under the board (top-centre, below board)
  ];
  // Explainer reuses the top-centre column but sits below the board.
  const explainerZone = zones[5];
  explainerZone.y = board.y + board.h + Math.min(18, rowH * 0.05);
  explainerZone.h = padY + rowH - explainerZone.y;
  explainerZone.cy = explainerZone.y + explainerZone.h / 2;

  return { board, zones };
}

// --- build + seed ------------------------------------------------------------

function seedCharacters(zone: Zone, count: number, rng: () => number): Character[] {
  const chars: Character[] = [];
  // Keep figures off the zone edges so they never clip when wandering.
  const m = 14;
  const ax = zone.x + m;
  const ay = zone.y + m;
  const aw = Math.max(1, zone.w - m * 2);
  const ah = Math.max(1, zone.h - m * 2);
  for (let i = 0; i < count; i++) {
    const hx = ax + rng() * aw;
    const hy = ay + rng() * ah;
    chars.push({
      homeX: hx,
      homeY: hy,
      x: hx,
      y: hy,
      vx: (rng() - 0.5) * 8,
      vy: (rng() - 0.5) * 8,
      bobPhase: rng() * Math.PI * 2,
      bobSpeed: 1.4 + rng() * 1.6,
      scale: 0.82 + rng() * 0.4,
    });
  }
  return chars;
}

/** Build the full crowd for a canvas size. Deterministic per (id,index) so re-renders don't thrash. */
export function buildCrowd(
  width: number,
  height: number,
  roleColor: Record<AgentId, string>,
): CrowdLayout {
  const { board, zones } = computeLayout(width, height);
  const perGroup = crowdPerGroup(width, height);
  const groups: Group[] = AGENT_ORDER.map((id, i) => {
    const rng = mulberry32(hashSeed(`${id}:${perGroup}`));
    return {
      id,
      label: AGENT_LABEL[id],
      color: roleColor[id],
      zone: zones[i],
      chars: seedCharacters(zones[i], perGroup, rng),
    };
  });
  return { width, height, board, groups };
}

/** Total figure count — surfaced for the HUD / reporting. */
export function totalFigures(layout: CrowdLayout): number {
  return layout.groups.reduce((n, g) => n + g.chars.length, 0);
}

// --- per-frame integration ---------------------------------------------------

const IDLE_SPEED = 6; // px/s drift target for dim groups
const ACTIVE_SPEED = 22; // px/s drift target for the thinking group
const JITTER = 26; // random-walk acceleration (px/s²) scale

/**
 * Advance one group's crowd by dt seconds. Active (thinking) groups wander more energetically;
 * everyone is softly pulled back toward their home anchor and clamped to the zone.
 */
export function stepGroup(group: Group, status: GroupStatus, dt: number): void {
  const energetic = status.thinking;
  const targetSpeed = energetic ? ACTIVE_SPEED : IDLE_SPEED;
  const jitter = energetic ? JITTER : JITTER * 0.4;
  const z = group.zone;
  const m = 12;

  for (const c of group.chars) {
    // Random-walk acceleration.
    c.vx += (Math.random() - 0.5) * jitter * dt;
    c.vy += (Math.random() - 0.5) * jitter * dt;
    // Gentle spring back to home so clusters stay coherent.
    c.vx += (c.homeX - c.x) * 0.6 * dt;
    c.vy += (c.homeY - c.y) * 0.6 * dt;

    // Nudge speed toward the group's target (smooth, not hard).
    const sp = Math.hypot(c.vx, c.vy) || 1;
    const k = (targetSpeed - sp) * 0.9 * dt;
    c.vx += (c.vx / sp) * k;
    c.vy += (c.vy / sp) * k;

    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Vertical bob phase advances over time.
    c.bobPhase += c.bobSpeed * dt;

    // Clamp to zone; bounce velocity softly at the walls.
    if (c.x < z.x + m) { c.x = z.x + m; c.vx = Math.abs(c.vx) * 0.5; }
    if (c.x > z.x + z.w - m) { c.x = z.x + z.w - m; c.vx = -Math.abs(c.vx) * 0.5; }
    if (c.y < z.y + m) { c.y = z.y + m; c.vy = Math.abs(c.vy) * 0.5; }
    if (c.y > z.y + z.h - m) { c.y = z.y + z.h - m; c.vy = -Math.abs(c.vy) * 0.5; }
  }
}
