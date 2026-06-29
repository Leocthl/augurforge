/**
 * draw.ts — canvas-2D renderer for the situation room. [OWNER: B / warroom]
 *
 * All painting lives here so WarRoom.tsx only owns React + the rAF loop. Draws (in order):
 *   1. office backdrop: dark floor + subtle perspective grid
 *   2. central situation board (scenario title + latest metric)
 *   3. six group zones: glow halo for the active group, the wandering stick-figure crowd,
 *      a group label under each cluster, and a thought bubble for active / recently-done groups.
 *
 * Stick figures are simple line drawings (cheap). Glow is applied at GROUP level (one shadowBlur
 * pass around the active cluster) rather than per-character, to keep the loop fast.
 */
import type { Character, CrowdLayout, Group, GroupStatus } from './crowd';

export interface Scene {
  layout: CrowdLayout;
  statuses: Record<string, GroupStatus>;
  activeId: string | null;
  scenarioTitle: string;
  latestMetric: { label: string; value: string } | null;
  /** Seconds since mount — drives bob, typing pulse, glow breathing. */
  t: number;
  /** CSS-pixel canvas size (for clamping bubbles to the viewport). */
  cssWidth: number;
}

const FONT_STACK = '"Inter", system-ui, sans-serif';

// --- public entry ------------------------------------------------------------

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { layout } = scene;
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawBackdrop(ctx, layout);
  drawBoard(ctx, scene);
  for (const group of layout.groups) {
    const status = scene.statuses[group.id] ?? blankStatus();
    drawGroup(ctx, group, status, scene.activeId === group.id, scene.t, scene.cssWidth);
  }
}

function blankStatus(): GroupStatus {
  return { started: false, thinking: false, done: false, caption: '' };
}

// --- backdrop ----------------------------------------------------------------

function drawBackdrop(ctx: CanvasRenderingContext2D, layout: CrowdLayout): void {
  const { width: w, height: h } = layout;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a1018');
  bg.addColorStop(0.7, '#06090f');
  bg.addColorStop(1, '#04060a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Cool top glow.
  const glow = ctx.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, w * 0.7);
  glow.addColorStop(0, 'rgba(56,189,248,0.10)');
  glow.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  drawPerspectiveGrid(ctx, w, h);
}

/** A simple one-point-perspective floor grid: verticals fanning from a vanishing point + horizontals. */
function drawPerspectiveGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const horizonY = h * 0.34;
  const vpX = w / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(56,189,248,0.07)';
  ctx.lineWidth = 1;

  // Converging verticals.
  const cols = 16;
  for (let i = 0; i <= cols; i++) {
    const fx = (i / cols) * w;
    ctx.beginPath();
    ctx.moveTo(fx, h);
    ctx.lineTo(vpX + (fx - vpX) * 0.18, horizonY);
    ctx.stroke();
  }

  // Receding horizontals (denser toward the horizon).
  const rows = 12;
  for (let i = 1; i <= rows; i++) {
    const f = i / rows;
    const y = horizonY + (h - horizonY) * (f * f);
    ctx.globalAlpha = 0.5 + f * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- situation board ---------------------------------------------------------

function drawBoard(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { board } = scene.layout;
  ctx.save();
  roundRect(ctx, board.x, board.y, board.w, board.h, 12);
  const grad = ctx.createLinearGradient(board.x, board.y, board.x, board.y + board.h);
  grad.addColorStop(0, 'rgba(17,28,48,0.92)');
  grad.addColorStop(1, 'rgba(9,15,28,0.92)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,190,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const padX = Math.min(20, board.w * 0.08);

  // Header strip.
  ctx.fillStyle = '#8aa0bd';
  const headSize = clamp(board.w * 0.045, 10, 13);
  ctx.font = `600 ${headSize}px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('SITUATION BOARD', board.x + padX, board.y + 12);

  // Scenario title (wrapped).
  ctx.fillStyle = '#e6edf6';
  const titleSize = clamp(board.w * 0.072, 14, 22);
  ctx.font = `700 ${titleSize}px ${FONT_STACK}`;
  const titleLines = wrapText(ctx, scene.scenarioTitle, board.w - padX * 2);
  let ty = board.y + 12 + headSize + 12;
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, board.x + padX, ty);
    ty += titleSize * 1.18;
  }

  // Latest metric pinned near the bottom.
  if (scene.latestMetric) {
    const m = scene.latestMetric;
    const valSize = clamp(board.w * 0.12, 20, 40);
    const labSize = clamp(board.w * 0.045, 10, 13);
    const by = board.y + board.h - 16;
    ctx.textBaseline = 'bottom';
    ctx.font = `700 ${valSize}px ${FONT_STACK}`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(m.value, board.x + padX, by);
    ctx.font = `600 ${labSize}px ${FONT_STACK}`;
    ctx.fillStyle = '#8aa0bd';
    ctx.fillText(m.label, board.x + padX, by - valSize * 1.02);
  }
  ctx.restore();
}

// --- one group ---------------------------------------------------------------

function drawGroup(
  ctx: CanvasRenderingContext2D,
  group: Group,
  status: GroupStatus,
  isActive: boolean,
  t: number,
  cssWidth: number,
): void {
  const dim = !status.started ? 0.34 : status.thinking ? 1 : 0.82;

  // Active glow halo around the cluster centre (one pass, not per character).
  if (isActive) {
    const z = group.zone;
    const r = Math.min(z.w, z.h) * 0.62;
    const breathe = 0.5 + 0.5 * Math.sin(t * 3);
    const halo = ctx.createRadialGradient(z.cx, z.cy, 0, z.cx, z.cy, r);
    halo.addColorStop(0, withAlpha(group.color, 0.22 + breathe * 0.12));
    halo.addColorStop(1, withAlpha(group.color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(z.x - 20, z.y - 20, z.w + 40, z.h + 40);
  }

  // Crowd.
  ctx.save();
  ctx.globalAlpha = dim;
  ctx.strokeStyle = group.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const c of group.chars) drawFigure(ctx, c, status.thinking);
  ctx.restore();

  // Label under the cluster.
  drawLabel(ctx, group, dim);

  // Thought bubble for active / recently-done groups with a caption.
  if (status.started && status.caption) {
    drawThoughtBubble(ctx, group, status, t, cssWidth);
  }
}

/** A minimal 5-line stick figure (head circle + body + arms + legs). Cheap to draw en masse. */
function drawFigure(ctx: CanvasRenderingContext2D, c: Character, thinking: boolean): void {
  const s = c.scale;
  const bob = Math.sin(c.bobPhase) * (thinking ? 3 : 1.4);
  const x = c.x;
  const y = c.y + bob;

  const headR = 3.6 * s;
  const bodyLen = 11 * s;
  const armY = 3.5 * s;
  const armSpread = 5.5 * s;
  const legSpread = 4.5 * s;
  const legLen = 9 * s;

  ctx.lineWidth = 1.6 * s;
  // Head
  ctx.beginPath();
  ctx.arc(x, y - bodyLen - headR, headR, 0, Math.PI * 2);
  ctx.stroke();
  // Body + arms + legs in one path.
  ctx.beginPath();
  ctx.moveTo(x, y - bodyLen);
  ctx.lineTo(x, y);
  ctx.moveTo(x, y - bodyLen + armY);
  ctx.lineTo(x - armSpread, y - bodyLen + armY + 3.5 * s);
  ctx.moveTo(x, y - bodyLen + armY);
  ctx.lineTo(x + armSpread, y - bodyLen + armY + 3.5 * s);
  ctx.moveTo(x, y);
  ctx.lineTo(x - legSpread, y + legLen);
  ctx.moveTo(x, y);
  ctx.lineTo(x + legSpread, y + legLen);
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, group: Group, dim: number): void {
  const z = group.zone;
  ctx.save();
  ctx.font = `600 12px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const labelY = z.y + z.h - 2;
  const tw = ctx.measureText(group.label).width;
  // Subtle plate behind the label for legibility over the crowd.
  ctx.globalAlpha = Math.max(0.4, dim) * 0.6;
  ctx.fillStyle = 'rgba(6,9,15,0.7)';
  roundRect(ctx, z.cx - tw / 2 - 8, labelY - 16, tw + 16, 16, 6);
  ctx.fill();
  ctx.globalAlpha = Math.max(0.7, dim);
  ctx.fillStyle = group.color;
  ctx.fillText(group.label, z.cx, labelY - 2);
  ctx.restore();
}

// --- thought bubble ----------------------------------------------------------

function drawThoughtBubble(
  ctx: CanvasRenderingContext2D,
  group: Group,
  status: GroupStatus,
  t: number,
  cssWidth: number,
): void {
  const z = group.zone;
  const maxW = Math.min(240, z.w * 1.05);
  const padX = 12;
  const padY = 9;
  const fontSize = 12.5;
  const lineH = fontSize * 1.32;

  ctx.font = `${fontSize}px ${FONT_STACK}`;
  // Cap to the last ~3 lines so the bubble stays compact while streaming.
  const lines = wrapText(ctx, status.caption, maxW - padX * 2).slice(-3);
  const typing = status.thinking;

  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width), 24);
  const bw = textW + padX * 2 + (typing ? 12 : 0);
  const bh = lines.length * lineH + padY * 2;

  // Anchor above the cluster, clamped to canvas.
  let bx = z.cx - bw / 2;
  let by = z.y - bh - 14;
  bx = clamp(bx, 6, cssWidth - bw - 6);
  if (by < 6) by = z.y + 6;

  ctx.save();
  // Bubble body.
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fillStyle = 'rgba(233,237,246,0.97)';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Accent left edge in the group color.
  ctx.fillStyle = withAlpha(group.color, 0.9);
  roundRect(ctx, bx, by, 4, bh, 2);
  ctx.fill();

  // Tail toward the cluster (small triangle).
  const tailX = clamp(z.cx, bx + 16, bx + bw - 16);
  ctx.beginPath();
  ctx.moveTo(tailX - 7, by + bh);
  ctx.lineTo(tailX + 7, by + bh);
  ctx.lineTo(tailX, by + bh + 9);
  ctx.closePath();
  ctx.fillStyle = 'rgba(233,237,246,0.97)';
  ctx.fill();

  // Text.
  ctx.fillStyle = '#0b1322';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let ly = by + padY;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    ctx.fillText(line, bx + padX, ly);
    // Typing caret on the last line while thinking.
    if (typing && i === lines.length - 1) {
      const caretOn = Math.floor(t * 2) % 2 === 0;
      if (caretOn) {
        const lw = ctx.measureText(line).width;
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(bx + padX + lw + 2, ly + 1, 6, fontSize);
        ctx.fillStyle = '#0b1322';
      }
    }
    ly += lineH;
  }
  ctx.restore();
}

// --- helpers -----------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Add an alpha channel to a #rrggbb color string. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
