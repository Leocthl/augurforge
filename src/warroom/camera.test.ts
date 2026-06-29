import { describe, expect, it } from 'vitest';
import { clampCamera, focusCamera, panCamera, screenToWorld, worldToScreen, zoomAt } from './camera';
import { GROUP_COLOR } from './agents';
import { buildCrowd, stepWorker } from './crowd';
import { buildScene } from './scene';

const bounds = { width: 1200, height: 800, viewW: 600, viewH: 400 };

describe('camera helpers', () => {
  it('keeps world point stable when zooming around the cursor', () => {
    const cam = { x: 600, y: 400, zoom: 1 };
    const before = screenToWorld(cam, 450, 220, bounds.viewW, bounds.viewH);
    const next = zoomAt(cam, 450, 220, 1.6, bounds);
    const after = screenToWorld(next, 450, 220, bounds.viewW, bounds.viewH);

    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('pans in screen space and clamps to room bounds', () => {
    const cam = panCamera({ x: 600, y: 400, zoom: 2 }, -100, 50, bounds);

    expect(cam.x).toBe(650);
    expect(cam.y).toBe(375);
    expect(clampCamera({ x: -999, y: 999, zoom: 1 }, bounds).x).toBeGreaterThan(0);
  });

  it('focuses a desk and converts world back to screen', () => {
    const cam = focusCamera({ x: 900, y: 300 }, 1.45, bounds);
    const point = worldToScreen(cam, 900, 300, bounds.viewW, bounds.viewH);

    expect(point.x).toBeCloseTo(300, 3);
    expect(point.y).toBeCloseTo(200, 3);
  });
});

describe('panic movement', () => {
  it('moves panic workers farther than idle workers over the same frame', () => {
    const scene = buildScene(1200, 800, GROUP_COLOR);
    const idle = {
      ...buildCrowd(scene).groups[0].workers[0],
      x: 100,
      y: 100,
      hx: 100,
      hy: 100,
      ang: 0,
      radius: 200,
      baseSpeed: 10,
      turnClock: 1,
    };
    const panic = { ...idle };
    const idleStart = { x: idle.x, y: idle.y };
    const panicStart = { x: panic.x, y: panic.y };

    stepWorker(idle, scene, { mode: 'idle' }, 0.25);
    stepWorker(panic, scene, { mode: 'panic' }, 0.25);

    const idleDist = Math.hypot(idle.x - idleStart.x, idle.y - idleStart.y);
    const panicDist = Math.hypot(panic.x - panicStart.x, panic.y - panicStart.y);
    expect(panicDist).toBeGreaterThan(idleDist);
  });
});
