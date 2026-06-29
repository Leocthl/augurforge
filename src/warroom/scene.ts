/**
 * scene.ts — the office "situation room" geometry + pixel-art paint. [OWNER: B / warroom]
 *
 * World coords == CSS pixels of the canvas (the room is built to fill the viewport). Six desk zones
 * ring a central situation board. Drawn in a muted, professional palette (cool-gray carpet, graphite
 * desks, slate screens) — pixel-art like simfrancisco's baked map, but NOT a neon cockpit (CLAUDE.md).
 * The renderer (draw.ts) supplies a world->screen function so the same scene zooms with the camera.
 */
import type { AgentId } from '../core/contract';
import { AGENT_ORDER, AGENT_LABEL } from './agents';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Vec { x: number; y: number }

export interface DeskZone {
  id: AgentId;
  index: number;
  label: string;
  color: string;
  home: Vec; // cluster centre (workers mill around here)
  radius: number; // soft roam radius
  desk: Rect; // the furniture they gather at
}

export interface SceneLayout {
  width: number;
  height: number;
  board: Rect;
  zones: DeskZone[];
}

export interface BoardContext {
  title: string;
  phase: string;
  summary: string;
  details: string[];
  metric: { label: string; value: string } | null;
}

export type W2S = (wx: number, wy: number) => Vec;

// Six desk islands in the generated situation-room background (fractions of the room).
const SPOTS: Array<[number, number]> = [
  [0.22, 0.34], // orchestrator  top-left
  [0.78, 0.34], // modeler       top-right
  [0.20, 0.58], // visualizer    mid-left
  [0.80, 0.58], // sensitivity   mid-right
  [0.24, 0.83], // risk          bottom-left
  [0.76, 0.83], // explainer     bottom-right
];

const PALETTE = {
  floorA: '#c9ccd2',
  floorB: '#c2c5cd',
  baseboard: '#b0b4bc',
  deskTop: '#8b8f99',
  deskEdge: '#6f747e',
  monitorFrame: '#2b303a',
  monitorScreen: '#39414f',
  boardFrame: '#2b303a',
  boardScreen: '#222a37',
  boardInk: '#eef2f7',
  boardDim: '#9aa6b6',
  blue: '#5a86c4',
};
const TILE = 40;

export function buildScene(width: number, height: number, roleColor: Record<AgentId, string>): SceneLayout {
  const board: Rect = {
    w: Math.min(width * 0.36, 520),
    h: Math.min(height * 0.34, 300),
    x: 0,
    y: 0,
  };
  board.x = width / 2 - board.w / 2;
  board.y = height / 2 - board.h / 2;

  const radius = Math.max(54, Math.min(120, Math.min(width, height) * 0.13));
  const deskW = Math.max(56, radius * 1.1);
  const deskH = Math.max(20, radius * 0.34);

  const zones: DeskZone[] = AGENT_ORDER.map((id, i) => {
    const [fx, fy] = SPOTS[i];
    const home: Vec = { x: width * fx, y: height * fy };
    // Desk sits just "behind" the cluster (toward the nearer vertical edge band).
    const deskY = fy < 0.5 ? home.y - radius * 0.7 : home.y - radius * 0.55;
    return {
      id,
      index: i,
      label: AGENT_LABEL[id],
      color: roleColor[id],
      home,
      radius,
      desk: { x: home.x - deskW / 2, y: deskY - deskH / 2, w: deskW, h: deskH },
    };
  });

  return { width, height, board, zones };
}

function inflated(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
}
function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** True if a world point is occupied by furniture (board/desk) — workers bounce off it. */
export function isBlocked(scene: SceneLayout, x: number, y: number): boolean {
  if (inside(inflated(scene.board, 8), x, y)) return true;
  for (const z of scene.zones) {
    if (inside(inflated(z.desk, 5), x, y)) return true;
  }
  return false;
}

export function pointInRect(r: Rect, x: number, y: number): boolean {
  return inside(r, x, y);
}

export function hitTestDesk(scene: SceneLayout, x: number, y: number): DeskZone | null {
  const desk = scene.zones.find((zone) => inside(inflated(zone.desk, 18), x, y));
  if (desk) return desk;
  return scene.zones.find((zone) => Math.hypot(zone.home.x - x, zone.home.y - y) <= zone.radius * 0.8) ?? null;
}

// --- paint -------------------------------------------------------------------

function fillRectS(ctx: CanvasRenderingContext2D, w2s: W2S, zoom: number, r: Rect, color: string): void {
  const p = w2s(r.x, r.y);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(r.w * zoom), Math.ceil(r.h * zoom));
}

function drawBackdrop(ctx: CanvasRenderingContext2D, scene: SceneLayout, w2s: W2S, zoom: number, img: HTMLImageElement): void {
  const p = w2s(0, 0);
  const sourceAspect = img.naturalWidth / img.naturalHeight;
  const targetAspect = scene.width / scene.height;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (sourceAspect > targetAspect) {
    sw = img.naturalHeight * targetAspect;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / targetAspect;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    Math.round(p.x),
    Math.round(p.y),
    Math.ceil(scene.width * zoom),
    Math.ceil(scene.height * zoom),
  );
}

/** Paint floor + desks + the central board (with title + latest metric). */
export function drawOffice(
  ctx: CanvasRenderingContext2D,
  scene: SceneLayout,
  w2s: W2S,
  zoom: number,
  cssW: number,
  cssH: number,
  board: BoardContext,
  backdrop: HTMLImageElement | null,
): void {
  ctx.imageSmoothingEnabled = false;
  const hasBackdrop = !!backdrop?.complete && backdrop.naturalWidth > 0;

  if (hasBackdrop) {
    drawBackdrop(ctx, scene, w2s, zoom, backdrop);
  } else {
    // Checkerboard carpet (culled to the visible viewport).
    for (let wy = 0; wy < scene.height; wy += TILE) {
      for (let wx = 0; wx < scene.width; wx += TILE) {
        const p = w2s(wx, wy);
        const sz = Math.ceil(TILE * zoom);
        if (p.x + sz < 0 || p.x > cssW || p.y + sz < 0 || p.y > cssH) continue;
        const odd = ((wx / TILE) ^ (wy / TILE)) & 1;
        ctx.fillStyle = odd ? PALETTE.floorB : PALETTE.floorA;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
      }
    }

    // Desks + a monitor glowing faintly in the group's colour.
    for (const z of scene.zones) {
      fillRectS(ctx, w2s, zoom, { x: z.desk.x, y: z.desk.y + z.desk.h - 3, w: z.desk.w, h: 3 }, PALETTE.deskEdge);
      fillRectS(ctx, w2s, zoom, z.desk, PALETTE.deskTop);
      const mw = Math.max(14, z.desk.w * 0.32);
      const mon: Rect = { x: z.desk.x + z.desk.w / 2 - mw / 2, y: z.desk.y - z.desk.h * 0.7, w: mw, h: z.desk.h * 0.7 };
      fillRectS(ctx, w2s, zoom, inflated(mon, 2), PALETTE.monitorFrame);
      fillRectS(ctx, w2s, zoom, mon, PALETTE.monitorScreen);
      const screen = w2s(mon.x + 1, mon.y + 1);
      ctx.fillStyle = z.color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(screen.x), Math.round(screen.y), Math.ceil((mon.w - 2) * zoom), Math.ceil((mon.h - 2) * zoom * 0.55));
      ctx.globalAlpha = 1;
    }
  }

  // Central situation board.
  const bf = inflated(scene.board, 6);
  ctx.globalAlpha = hasBackdrop ? 0.9 : 1;
  fillRectS(ctx, w2s, zoom, bf, PALETTE.boardFrame);
  ctx.globalAlpha = hasBackdrop ? 0.92 : 1;
  fillRectS(ctx, w2s, zoom, scene.board, PALETTE.boardScreen);
  ctx.globalAlpha = 1;

  const tl = w2s(scene.board.x, scene.board.y);
  const bw = scene.board.w * zoom;
  const bh = scene.board.h * zoom;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tl.x, tl.y, bw, bh);
  ctx.clip();
  ctx.textBaseline = 'top';
  const pad = Math.max(8, 12 * zoom);
  ctx.fillStyle = PALETTE.boardDim;
  ctx.font = `600 ${Math.max(9, Math.round(11 * zoom))}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText('LIVE MARKET CONTEXT', tl.x + pad, tl.y + pad);
  ctx.fillStyle = PALETTE.boardInk;
  const titleSize = Math.max(12, Math.round(16 * zoom));
  ctx.font = `600 ${titleSize}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
  wrapText(ctx, board.title, tl.x + pad, tl.y + pad + titleSize + 2, bw - pad * 2, titleSize + 3, 2);

  const phaseY = tl.y + pad + titleSize * 2 + 12 * zoom;
  ctx.fillStyle = PALETTE.blue;
  ctx.font = `700 ${Math.max(9, Math.round(11 * zoom))}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(board.phase.toUpperCase(), tl.x + pad, phaseY);

  const summaryY = phaseY + Math.max(14, 16 * zoom);
  ctx.fillStyle = PALETTE.boardInk;
  ctx.font = `500 ${Math.max(10, Math.round(12 * zoom))}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
  wrapText(ctx, board.summary, tl.x + pad, summaryY, bw - pad * 2, Math.max(14, 16 * zoom), 2);

  const detailY = summaryY + Math.max(34, 38 * zoom);
  ctx.fillStyle = PALETTE.boardDim;
  ctx.font = `500 ${Math.max(9, Math.round(10 * zoom))}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
  board.details.slice(0, 3).forEach((line, i) => {
    ctx.fillText(`- ${line}`, tl.x + pad, detailY + i * Math.max(13, 15 * zoom));
  });

  if (board.metric) {
    const my = tl.y + bh - pad - Math.max(20, 24 * zoom);
    ctx.fillStyle = PALETTE.boardDim;
    ctx.font = `500 ${Math.max(9, Math.round(10 * zoom))}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(board.metric.label.toUpperCase(), tl.x + pad, my);
    ctx.fillStyle = PALETTE.blue;
    ctx.font = `700 ${Math.max(13, Math.round(17 * zoom))}px 'Geist Variable', ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(board.metric.value, tl.x + pad, my + Math.max(11, 13 * zoom));
  }
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length && lines < maxLines; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + lines * lh);
      lines++;
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lh);
}
