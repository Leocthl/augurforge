/**
 * bubbles.ts — canvas thought bubbles, ported from simfrancisco's _drawBubble. [OWNER: B / warroom]
 *
 * Word-wraps to a max width, hard-caps at 3 lines, draws a rounded box with a downward tail whose
 * apex is clamped inside the box, and clamps the box to the viewport — exactly the repo's technique,
 * restyled for AugurForge's light register (white panel, hairline border, group-colour left stripe).
 * Plus the ambient office one-liners idle workers murmur, so the room feels alive like the repo.
 */
const FONT = "600 12px 'Geist Variable', ui-sans-serif, system-ui, sans-serif";
const PAD = 7;
const LH = 15;
const MAXW = 168;
const TAIL = 7;
const RADIUS = 8;
const FILL = 'rgba(255,255,255,0.97)';
const BORDER = 'rgba(20,24,33,0.18)';
const INK = '#1d2330';

export interface BubbleOpts {
  cssW: number;
  stripe?: string; // group accent
  caret?: boolean; // show a (pre-blinked) caret after the text
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > MAXW && line) {
      lines.push(line);
      line = words[i];
      if (lines.length >= 3) break;
    } else {
      line = test;
    }
  }
  if (lines.length < 3 && line) {
    lines.push(line);
  } else if (lines.length === 3 && line) {
    // A word was left uncommitted past the 3-line cap -> content dropped; mark truncation.
    lines[2] = `${lines[2].replace(/\s*…?$/, '')}…`;
  }
  return lines;
}

/**
 * Draw a thought bubble whose tail points at (anchorX, anchorY) — the figure's head in screen space.
 */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  text: string,
  opts: BubbleOpts,
): void {
  if (!text) return;
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, text);
  if (lines.length === 0) return;

  const stripeW = opts.stripe ? 4 : 0;
  const caretExtra = opts.caret ? 7 : 0;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + caretExtra;
  const bw = Math.ceil(textW + PAD * 2 + stripeW);
  const bh = lines.length * LH + PAD * 2;

  const tipY = anchorY - 4;
  let by = tipY - TAIL - bh;
  let bx = anchorX - bw / 2;
  const maxX = Math.max(6, opts.cssW - bw - 6);
  bx = Math.min(maxX, Math.max(6, bx));
  if (by < 4) by = 4;

  // Box
  roundRectPath(ctx, bx, by, bw, bh, RADIUS);
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = BORDER;
  ctx.stroke();

  // Tail (downward triangle, apex clamped inside the box).
  const tcx = Math.max(bx + 10, Math.min(bx + bw - 10, anchorX));
  ctx.beginPath();
  ctx.moveTo(tcx - 6, by + bh - 0.5);
  ctx.lineTo(tcx, by + bh + TAIL);
  ctx.lineTo(tcx + 6, by + bh - 0.5);
  ctx.closePath();
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tcx - 6, by + bh);
  ctx.lineTo(tcx, by + bh + TAIL);
  ctx.lineTo(tcx + 6, by + bh);
  ctx.strokeStyle = BORDER;
  ctx.stroke();

  // Left accent stripe (clipped to the rounded box).
  if (opts.stripe) {
    ctx.save();
    roundRectPath(ctx, bx, by, bw, bh, RADIUS);
    ctx.clip();
    ctx.fillStyle = opts.stripe;
    ctx.fillRect(bx, by, stripeW, bh);
    ctx.restore();
  }

  // Text
  ctx.fillStyle = INK;
  const tx = bx + PAD + stripeW;
  lines.forEach((l, i) => ctx.fillText(l, tx, by + PAD + i * LH));
  if (opts.caret) {
    const last = lines[lines.length - 1];
    const cx = tx + ctx.measureText(last).width + 2;
    const cy = by + PAD + (lines.length - 1) * LH;
    ctx.fillStyle = '#3b6fb0';
    ctx.fillRect(cx, cy, 2, 12);
  }
}

/** Ambient office murmurs idle workers show on rotation (deterministic per seed). */
export const AMBIENT: string[] = [
  'rerunning the seed',
  'CI looks a bit wide',
  'checking the tail risk',
  'waiting on the modeler',
  'that path converged',
  'drift vs vol again',
  'is the horizon right?',
  'eyeballing the fan chart',
  'soft warning here',
  'tightening the wording',
  'ready after review',
  'who owns this metric?',
  'antithetic paths look clean',
  'P(ruin) within buffer',
];

export function ambientFor(seed: number): string {
  return AMBIENT[Math.abs(Math.floor(seed)) % AMBIENT.length];
}