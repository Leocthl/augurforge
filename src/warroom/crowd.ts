/**
 * crowd.ts — the situation-room crowd (sprite workers). [OWNER: B / warroom]
 *
 * Six agent GROUPS, each a cluster of pixel office workers that WANDER around their desk like
 * simfrancisco's residents: constant-speed heading with periodic jitter, softly leashed to a home
 * anchor, bouncing off furniture. No React, no canvas — just data + a per-worker integrator.
 * Positions seed DETERMINISTICALLY (mulberry32) so a resize rebuild lands workers consistently.
 */
import type { AgentId } from '../core/contract';
import { GROUP_COUNT, VARIANTS_PER_GROUP, walkFrame, dirFromVelocity, type Dir } from './sheet';
import { isBlocked, type SceneLayout } from './scene';

/** One wandering worker. Coords are in world (== CSS) pixels; feet-anchored at (x,y). */
export interface Worker {
  group: number;
  variant: number;
  x: number;
  y: number;
  hx: number; // home anchor
  hy: number;
  radius: number;
  ang: number;
  baseSpeed: number;
  turnClock: number;
  frame: number;
  frameClock: number;
  dir: Dir;
}

export interface CrowdGroup {
  id: AgentId;
  index: number;
  label: string;
  color: string;
  home: { x: number; y: number };
  workers: Worker[];
}

export interface Crowd {
  groups: CrowdGroup[];
  total: number;
}

/** Live, derived status for one group — fed in each frame from the reasoning reducer. */
export interface GroupStatus {
  started: boolean;
  thinking: boolean;
  done: boolean;
  caption: string;
}

export interface WorkerMotion {
  mode: 'idle' | 'active' | 'panic';
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

// --- sizing ------------------------------------------------------------------

const MIN_PER_GROUP = 18;
const MAX_PER_GROUP = 34;
const MAX_TOTAL = 200;

/** Per-group crowd count that scales with canvas area but stays crowded + smooth. */
export function crowdPerGroup(width: number, height: number): number {
  const byArea = Math.round((width * height) / 11000 / GROUP_COUNT);
  const capped = Math.min(byArea, Math.floor(MAX_TOTAL / GROUP_COUNT));
  return Math.max(MIN_PER_GROUP, Math.min(MAX_PER_GROUP, capped));
}

// --- build -------------------------------------------------------------------

/** Build the full crowd for a scene. Deterministic per (group, size). */
export function buildCrowd(scene: SceneLayout): Crowd {
  const per = crowdPerGroup(scene.width, scene.height);
  let total = 0;
  const groups: CrowdGroup[] = scene.zones.map((z) => {
    const rng = mulberry32(hashSeed(`${z.id}:${per}:${Math.round(scene.width)}x${Math.round(scene.height)}`));
    const workers: Worker[] = [];
    for (let i = 0; i < per; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * z.radius;
      workers.push({
        group: z.index,
        variant: Math.floor(rng() * VARIANTS_PER_GROUP),
        x: z.home.x + Math.cos(a) * r,
        y: z.home.y + Math.sin(a) * r,
        hx: z.home.x,
        hy: z.home.y,
        radius: z.radius,
        ang: rng() * Math.PI * 2,
        baseSpeed: 7 + rng() * 10,
        turnClock: rng() * 2,
        frame: 1,
        frameClock: rng() * 1000,
        dir: Math.floor(rng() * 4) as Dir,
      });
    }
    total += workers.length;
    return { id: z.id, index: z.index, label: z.label, color: z.color, home: z.home, workers };
  });
  return { groups, total };
}

export function totalFigures(crowd: Crowd): number {
  return crowd.total;
}

// --- per-worker integration --------------------------------------------------

/** Shortest-arc angle interpolation. */
function angLerp(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

/**
 * Advance one worker by dt seconds. Energetic (active group) workers move faster; everyone is
 * softly leashed to home and bounces off furniture (board/desk) and the room edges.
 */
export function stepWorker(w: Worker, scene: SceneLayout, motion: WorkerMotion, dt: number): void {
  const panic = motion.mode === 'panic';
  const energetic = motion.mode === 'active' || panic;
  w.turnClock -= dt * (panic ? 1.8 : 1);
  if (w.turnClock <= 0) {
    const dx = w.hx - w.x;
    const dy = w.hy - w.y;
    const dist = Math.hypot(dx, dy);
    const toHome = Math.atan2(dy, dx);
    const wander = w.ang + (Math.random() - 0.5) * (panic ? 2.5 : 1.6);
    const pull = Math.min(1, dist / w.radius) * (panic ? 0.45 : 0.7);
    w.ang = angLerp(wander, toHome, pull);
    w.turnClock = panic ? 0.18 + Math.random() * 0.45 : 0.8 + Math.random() * 2.0;
  }

  const speed = w.baseSpeed * (panic ? 2.65 : energetic ? 1.7 : 1);
  const vx = Math.cos(w.ang) * speed;
  const vy = Math.sin(w.ang) * speed;
  let nx = w.x + vx * dt;
  let ny = w.y + vy * dt;

  // Hard leash so clusters never disperse across the room.
  if (Math.hypot(nx - w.hx, ny - w.hy) > w.radius * (panic ? 1.75 : 1.3)) {
    w.ang = Math.atan2(w.hy - w.y, w.hx - w.x) + (Math.random() - 0.5) * (panic ? 1.1 : 0.6);
    w.turnClock = panic ? 0.12 : 0.3;
    nx = w.x;
    ny = w.y;
  }

  if (isBlocked(scene, nx, ny)) {
    w.ang += Math.PI * 0.65 + (Math.random() - 0.5) * (panic ? 1.3 : 0.8);
    w.turnClock = panic ? 0.1 : 0.25;
  } else {
    w.x = nx;
    w.y = ny;
  }

  w.x = Math.max(6, Math.min(scene.width - 6, w.x));
  w.y = Math.max(24, Math.min(scene.height - 6, w.y));

  w.frameClock += dt * 1000 * (panic ? 1.7 : 1);
  w.frame = walkFrame(w.frameClock);
  w.dir = dirFromVelocity(vx, vy, w.dir);
}
