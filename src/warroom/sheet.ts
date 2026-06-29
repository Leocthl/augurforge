/**
 * sheet.ts — sprite-atlas geometry, ported from simfrancisco's SHEET. [OWNER: B / warroom]
 *
 * The baked atlas (bakeAtlas.ts) packs GROUP_COUNT x VARIANTS_PER_GROUP character "blocks".
 * Each block is a 3-frame x 4-facing grid of 16x16 cells — exactly simfrancisco's layout
 * (frontend/src/map.js: cell 16; cols stepA/idle/stepB; rows down/left/right/up).
 */
export const CELL = 16; // source cell px (16x16), nearest-neighbour upscaled at blit
export const FRAMES = 3; // columns per block: stepA(0) idle(1) stepB(2)
export const DIRS = 4; // rows per block: down(0) left(1) right(2) up(3)
export const BLOCK_W = FRAMES * CELL; // 48
export const BLOCK_H = DIRS * CELL; // 64

export const GROUP_COUNT = 6;
export const VARIANTS_PER_GROUP = 4;
export const BLOCK_COUNT = GROUP_COUNT * VARIANTS_PER_GROUP; // 24
export const PER_ROW = VARIANTS_PER_GROUP; // one group per atlas row (4 variant columns)

export const ATLAS_W = PER_ROW * BLOCK_W; // 192
export const ATLAS_H = Math.ceil(BLOCK_COUNT / PER_ROW) * BLOCK_H; // 384

/** simfrancisco's walk cycle: contact-pass-contact-pass at 8fps (125ms/frame, 500ms loop). */
export const WALK: readonly number[] = [1, 0, 1, 2];
export const WALK_FPS = 8;

export type Dir = 0 | 1 | 2 | 3; // down, left, right, up

/** Block index for a (group, variant) pair — one group per atlas row. */
export function blockIndex(group: number, variant: number): number {
  return group * VARIANTS_PER_GROUP + variant;
}

export interface SrcRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Source rect inside the atlas for a (block, frame, dir) — simfrancisco's slicing math. */
export function frameRect(block: number, frame: number, dir: number): SrcRect {
  const bx = (block % PER_ROW) * BLOCK_W;
  const by = Math.floor(block / PER_ROW) * BLOCK_H;
  return { sx: bx + frame * CELL, sy: by + dir * CELL, sw: CELL, sh: CELL };
}

/** Walk frame (0..2) from a per-character time accumulator (ms) — speed-independent like the repo. */
export function walkFrame(frameClockMs: number): number {
  const fi = Math.floor(frameClockMs / (1000 / WALK_FPS)) % WALK.length;
  return WALK[fi];
}

/** 4-direction facing from velocity (dominant axis) — simfrancisco's exact rule. */
export function dirFromVelocity(vx: number, vy: number, fallback: Dir = 0): Dir {
  if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) return fallback;
  return (Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0)) as Dir;
}