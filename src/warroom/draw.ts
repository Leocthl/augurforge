/**
 * draw.ts — per-frame renderer for the situation room. [OWNER: B / warroom]
 *
 * Follows simfrancisco's layer order: scene image -> sprites (foot-anchored, nearest-neighbour,
 * y-sorted) -> bubbles, all positioned through a world->screen camera transform (cam/zoom) computed
 * the repo's way (no ctx.scale; sprite size = SPRITE_PX * zoom). The active group glows and the camera
 * pushes in on it; an activation arrow links it to its upstream group (the reasoning topology).
 */
import type { AgentId } from '../core/contract';
import { drawOffice, type BoardContext, type SceneLayout, type W2S, type Vec } from './scene';
import type { Crowd, GroupStatus } from './crowd';
import { blockIndex, frameRect } from './sheet';
import { drawBubble } from './bubbles';

const SPRITE_PX = 26; // world footprint of a worker (~one desk-height)
const LOD_PX = 10; // below this on-screen size, draw a colored square instead of the sprite

/** Reasoning topology — who each active group descends from (matches reasoningGraph.UPSTREAM). */
const UPSTREAM: Record<AgentId, AgentId | null> = {
  orchestrator: null,
  modeler: 'orchestrator',
  visualizer: 'modeler',
  sensitivity: 'visualizer',
  risk: 'visualizer',
  explainer: 'visualizer',
};

export interface CameraView {
  x: number;
  y: number;
  zoom: number;
}

/** A rotating idle-worker murmur: which (group, worker) and what it says. */
export interface AmbientBubble {
  gi: number;
  wi: number;
  text: string;
}

export interface SceneState {
  scene: SceneLayout;
  crowd: Crowd;
  atlas: HTMLCanvasElement | null;
  statuses: Record<string, GroupStatus>;
  captions: Record<string, string>;
  activeId: AgentId | null;
  cam: CameraView;
  cssW: number;
  cssH: number;
  t: number; // seconds since start (for caret blink + arrow dash)
  board: BoardContext;
  backdrop: HTMLImageElement | null;
  ambient: AmbientBubble[];
}

function makeW2S(cam: CameraView, cssW: number, cssH: number): W2S {
  return (wx: number, wy: number): Vec => ({
    x: (wx - cam.x) * cam.zoom + cssW / 2,
    y: (wy - cam.y) * cam.zoom + cssH / 2,
  });
}

export function drawScene(ctx: CanvasRenderingContext2D, s: SceneState): void {
  const w2s = makeW2S(s.cam, s.cssW, s.cssH);

  ctx.fillStyle = '#b9bdc6'; // letterbox behind the floor
  ctx.fillRect(0, 0, s.cssW, s.cssH);

  drawOffice(ctx, s.scene, w2s, s.cam.zoom, s.cssW, s.cssH, s.board, s.backdrop);

  drawArrow(ctx, s, w2s);
  drawSprites(ctx, s, w2s);
  drawBubbles(ctx, s, w2s);
}

function drawArrow(ctx: CanvasRenderingContext2D, s: SceneState, w2s: W2S): void {
  if (!s.activeId) return;
  const up = UPSTREAM[s.activeId];
  if (!up) return;
  const from = s.crowd.groups.find((g) => g.id === up);
  const to = s.crowd.groups.find((g) => g.id === s.activeId);
  if (!from || !to) return;
  const a = w2s(from.home.x, from.home.y);
  const b = w2s(to.home.x, to.home.y);
  ctx.save();
  ctx.strokeStyle = to.color;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -((s.t * 30) % 12);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawSprites(ctx: CanvasRenderingContext2D, s: SceneState, w2s: W2S): void {
  const drawPx = Math.max(3, SPRITE_PX * s.cam.zoom);

  interface Item {
    x: number;
    y: number;
    group: number;
    variant: number;
    frame: number;
    dir: number;
    color: string;
    active: boolean;
  }
  const list: Item[] = [];
  for (const g of s.crowd.groups) {
    const st = s.statuses[g.id];
    const active = !!st && (st.thinking || s.activeId === g.id);
    for (const w of g.workers) {
      list.push({ x: w.x, y: w.y, group: w.group, variant: w.variant, frame: w.frame, dir: w.dir, color: g.color, active });
    }
  }
  list.sort((a, b) => a.y - b.y); // painter's order by depth

  ctx.imageSmoothingEnabled = false;
  for (const it of list) {
    const foot = w2s(it.x, it.y);
    if (foot.x < -drawPx || foot.x > s.cssW + drawPx || foot.y < -drawPx || foot.y > s.cssH + drawPx * 2) continue;

    if (it.active) {
      ctx.fillStyle = it.color;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.ellipse(foot.x, foot.y, drawPx * 0.45, drawPx * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (drawPx < LOD_PX || !s.atlas) {
      const sz = Math.max(2, Math.round(drawPx * 0.6));
      ctx.fillStyle = it.color;
      ctx.fillRect(Math.round(foot.x - sz / 2), Math.round(foot.y - sz), sz, sz);
      continue;
    }

    const r = frameRect(blockIndex(it.group, it.variant), it.frame, it.dir);
    ctx.drawImage(s.atlas, r.sx, r.sy, r.sw, r.sh, foot.x - drawPx / 2, foot.y - drawPx, drawPx, drawPx);
  }
}

function drawBubbles(ctx: CanvasRenderingContext2D, s: SceneState, w2s: W2S): void {
  const drawPx = Math.max(3, SPRITE_PX * s.cam.zoom);

  // Ambient idle murmurs.
  for (const ab of s.ambient) {
    const g = s.crowd.groups[ab.gi];
    if (!g) continue;
    const w = g.workers[ab.wi];
    if (!w) continue;
    const head = w2s(w.x, w.y);
    drawBubble(ctx, head.x, head.y - drawPx, ab.text, { cssW: s.cssW, stripe: g.color });
  }

  // Active group's live streamed caption (drawn last, on top).
  if (s.activeId) {
    const g = s.crowd.groups.find((x) => x.id === s.activeId);
    const cap = s.captions[s.activeId] ?? '';
    if (g && cap) {
      const p = w2s(g.home.x, g.home.y);
      const thinking = s.statuses[s.activeId]?.thinking;
      const caret = !!thinking && Math.floor(s.t * 2) % 2 === 0;
      drawBubble(ctx, p.x, p.y - drawPx, cap, { cssW: s.cssW, stripe: g.color, caret });
    }
  }
}
