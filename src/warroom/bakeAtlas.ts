/**
 * bakeAtlas.ts — deterministic pixel-sprite baker. [OWNER: B / warroom]
 *
 * Gemma 4 is text-only, so it authors character DESIGN (traits.ts); this pure baker turns those
 * traits into a sprite atlas in the SAME format simfrancisco blits from a PNG: GROUP_COUNT rows x
 * VARIANTS_PER_GROUP columns of 48x64 blocks, each a 3-frame x 4-facing grid of 16x16 cells.
 * Each (group, variant) is a 16px office-worker drawn from the group's palette; left mirrors right;
 * a leg/arm offset per stride frame yields the contact-pass walk. Output is an offscreen canvas the
 * renderer draws exactly like a sprite sheet.
 */
import { ATLAS_W, ATLAS_H, BLOCK_W, BLOCK_H, CELL, PER_ROW, VARIANTS_PER_GROUP, blockIndex } from './sheet';
import type { GroupTraits, Build, Headgear } from './traits';

interface CharColors {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  accent: string;
  build: Build;
  headgear: Headgear;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function bodyDims(build: Build): { hl: number; hr: number; bl: number; br: number } {
  if (build === 'slim') return { hl: 6, hr: 9, bl: 5, br: 10 };
  if (build === 'broad') return { hl: 5, hr: 10, bl: 3, br: 12 };
  return { hl: 5, hr: 10, bl: 4, br: 11 };
}

/** Draw one 16x16 worker into the cell at (ox, oy) for a facing dir + walk frame. */
function drawWorker(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  dir: number,
  frame: number,
  c: CharColors,
): void {
  const flip = dir === 1; // left = mirror of right
  const side = dir === 1 || dir === 2;
  const back = dir === 3;
  const stride = frame === 0 ? 1 : frame === 2 ? -1 : 0;
  const { hl, hr, bl, br } = bodyDims(c.build);
  const center = Math.floor((bl + br) / 2);
  const shoe = shade(c.bottom, 0.6);
  const hairLo = shade(c.hair, 0.85);
  const eye = '#20232a';

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    const dx = flip ? CELL - x - w : x;
    ctx.fillStyle = color;
    ctx.fillRect(ox + dx, oy + y, w, h);
  };

  if (side) {
    // ---- profile (facing right; mirrored for left) ----
    // legs (front leg leads/trails by stride)
    const frontUp = stride > 0;
    const backUp = stride < 0;
    px(6, 12, 2, backUp ? 3 : 4, shade(c.bottom, 0.85)); // back leg
    px(6, backUp ? 14 : 15, 2, 1, shoe);
    px(9, 12, 2, frontUp ? 3 : 4, c.bottom); // front leg
    px(9, frontUp ? 14 : 15, 2, 1, shoe);
    // torso
    px(6, 7, 5, 5, c.top);
    px(6, 7, 5, 1, shade(c.top, 0.8)); // collar shade
    // front arm (swings with stride)
    const armY = 8 + (stride > 0 ? 0 : 1);
    px(9, armY, 2, 3, shade(c.top, 0.9));
    px(9, armY + 3, 2, 1, c.skin); // hand
    // head + hair
    px(6, 2, 5, 5, c.skin); // head
    px(5, 1, 5, 3, c.hair); // hair back/top
    px(5, 4, 2, 2, hairLo); // back hair lower
    px(10, 4, 1, 1, eye); // eye (front)
  } else {
    // ---- front (down) / back (up) ----
    const hw = hr - hl + 1;
    // legs
    const leftX = center - 2 + (stride < 0 ? -1 : 0);
    const rightX = center + 1 + (stride > 0 ? 1 : 0);
    px(leftX, 12, 2, 4, c.bottom);
    px(leftX, 15, 2, 1, shoe);
    px(rightX, 12, 2, 4, c.bottom);
    px(rightX, 15, 2, 1, shoe);
    // torso
    px(bl, 7, br - bl + 1, 5, c.top);
    px(center - 1, 7, 3, 1, c.accent); // collar
    // arms
    px(bl - 1, 8, 1, 3, shade(c.top, 0.9));
    px(br + 1, 8, 1, 3, shade(c.top, 0.9));
    px(bl - 1, 11, 1, 1, c.skin);
    px(br + 1, 11, 1, 1, c.skin);
    // head
    px(hl, 2, hw, 5, c.skin);
    // hair
    if (back) {
      px(hl, 1, hw, 5, c.hair); // back of head: hair covers more, no face
    } else {
      px(hl, 1, hw, 3, c.hair); // forehead
      px(hl, 4, 1, 2, hairLo); // sideburns
      px(hr, 4, 1, 2, hairLo);
      px(hl + 1, 4, 1, 1, eye); // eyes
      px(hr - 1, 4, 1, 1, eye);
    }
  }

  // ---- headgear (over hair) ----
  if (c.headgear !== 'none') {
    const a = c.accent;
    if (c.headgear === 'beanie') {
      if (side) px(5, 0, 6, 3, a);
      else px(hl - 1, 0, hr - hl + 3, 3, a);
    } else if (c.headgear === 'cap') {
      if (side) { px(5, 1, 6, 1, a); px(10, 2, 3, 1, a); } // crown + forward brim
      else { px(hl - 1, 1, hr - hl + 3, 1, a); px(hr, 2, 2, 1, a); }
    } else if (c.headgear === 'visor') {
      if (side) px(7, 3, 4, 1, a);
      else px(hl, 3, hr - hl + 1, 1, a);
    } else if (c.headgear === 'headset') {
      if (side) { px(6, 0, 5, 1, a); px(6, 3, 1, 2, a); px(10, 5, 1, 1, a); } // arch + earcup + mic
      else { px(hl, 0, hr - hl + 1, 1, a); px(hl - 1, 3, 1, 2, a); px(hr + 1, 3, 1, 2, a); }
    }
  }
}

/** Bake the full atlas from the six groups' traits. Pure + deterministic (no RNG). */
export function bakeAtlas(traits: GroupTraits[]): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  traits.forEach((g, gi) => {
    for (let v = 0; v < VARIANTS_PER_GROUP; v++) {
      const colors: CharColors = {
        skin: g.palette.skin[v % g.palette.skin.length],
        hair: g.palette.hair[v % g.palette.hair.length],
        top: g.palette.top,
        bottom: g.palette.bottom,
        accent: g.palette.accent,
        build: g.build,
        headgear: g.headgear,
      };
      const block = blockIndex(gi, v);
      const bx = (block % PER_ROW) * BLOCK_W;
      const by = Math.floor(block / PER_ROW) * BLOCK_H;
      for (let dir = 0; dir < 4; dir++) {
        for (let frame = 0; frame < 3; frame++) {
          drawWorker(ctx, bx + frame * CELL, by + dir * CELL, dir, frame, colors);
        }
      }
    }
  });

  return canvas;
}