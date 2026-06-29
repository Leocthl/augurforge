/**
 * three3d.ts — shared 3D render helpers (scene · ribbon field · density surface · barrier). [A scaffolds, B extends]
 *
 * Generic Three.js building blocks; a template''s render3D() composes them and owns the
 * Renderer it returns. Axes are shared with the 2D view: world X = time, world Y = value,
 * world Z = probability density — so head-on the scene reads like the 2D fan, and orbiting
 * lifts the probability mass into a "mountain".
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Theme } from '../core/contract';

/** World-space box the field is drawn into. */
export const BOX = { x: 6, y: 3.4, z: 2.6 } as const;

export interface FieldRanges {
  tMax: number;
  vMin: number;
  vMax: number;
  barrier: number;
  s0: number;
}

export interface SceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  setAutoRotate(on: boolean): void;
  setViewPreset(preset: 'iso' | 'front' | 'top' | 'side'): void;
  exportPng(): Promise<string>;
  /** Per-frame hook; receives elapsed seconds. */
  onFrame(cb: (elapsed: number) => void): void;
  dispose(): void;
}

// --- coordinate mapping -----------------------------------------------------

const mapT = (t: number, r: FieldRanges) => (t / r.tMax - 0.5) * BOX.x;
const mapV = (v: number, r: FieldRanges) =>
  (clamp01((v - r.vMin) / (r.vMax - r.vMin)) - 0.5) * BOX.y;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// --- color helpers ----------------------------------------------------------

/** Density ramp: deep blue → cyan → amber as probability mass rises. */
function densityColor(d: number, out: THREE.Color): void {
  const t = clamp01(d);
  const cold = new THREE.Color(0x0b2a4a);
  const mid = new THREE.Color(0x38bdf8);
  const hot = new THREE.Color(0xfbbf24);
  if (t < 0.5) out.copy(cold).lerp(mid, t / 0.5);
  else out.copy(mid).lerp(hot, (t - 0.5) / 0.5);
}

/** Outcome color: green above start, cyan neutral, red below the ruin barrier. */
function outcomeColor(terminal: number, r: FieldRanges, out: THREE.Color): void {
  if (terminal < r.barrier) out.set(0xfb7185);
  else if (terminal >= r.s0) out.set(0x4ade80);
  else out.set(0x38bdf8);
}

// --- scene scaffolding ------------------------------------------------------

export function createScene(el: HTMLElement, theme: Theme): SceneHandle {
  const scene = new THREE.Scene();
  const width = el.clientWidth || 640;
  const height = el.clientHeight || 420;
  const target = new THREE.Vector3(0, 0, 0);
  const presets = {
    iso: { position: new THREE.Vector3(5.5, 3.2, 6.5), up: new THREE.Vector3(0, 1, 0) },
    front: { position: new THREE.Vector3(0, 0.25, 8.6), up: new THREE.Vector3(0, 1, 0) },
    top: { position: new THREE.Vector3(0, 8.2, 0.01), up: new THREE.Vector3(0, 0, -1) },
    side: { position: new THREE.Vector3(8.2, 2.2, 0.01), up: new THREE.Vector3(0, 1, 0) },
  } as const;

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.copy(presets.iso.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  el.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.72;
  controls.panSpeed = 0.82;
  controls.zoomSpeed = 0.9;
  controls.minDistance = 2.7;
  controls.maxDistance = 14;
  controls.autoRotateSpeed = 0.9;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.target.copy(target);

  const setViewPreset = (preset: keyof typeof presets) => {
    const next = presets[preset];
    controls.autoRotate = false;
    camera.up.copy(next.up);
    camera.position.copy(next.position);
    controls.target.copy(target);
    camera.lookAt(target);
    controls.update();
  };

  const hemi = new THREE.HemisphereLight(0xbfdbfe, theme === 'light' ? 0xe2e8f0 : 0x0a1626, 1.4);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(4, 8, 6);
  scene.add(hemi, dir);

  // Subtle floor grid for spatial reference.
  const grid = new THREE.GridHelper(BOX.x, 12, 0x1e3a5f, 0x12243b);
  grid.position.y = -BOX.y / 2 - 0.02;
  (grid.material as THREE.Material).opacity = 0.5;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  const frameCbs: ((e: number) => void)[] = [];
  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;

  const loop = () => {
    if (disposed) return;
    const elapsed = clock.getElapsedTime();
    for (const cb of frameCbs) cb(elapsed);
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const resize = () => {
    const w = el.clientWidth || width;
    const h = el.clientHeight || height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  return {
    scene,
    camera,
    renderer,
    controls,
    setAutoRotate: (on) => {
      controls.autoRotate = on;
    },
    setViewPreset,
    exportPng: async () => {
      controls.update();
      renderer.render(scene, camera);
      const source = renderer.domElement;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create PNG export canvas');
      ctx.fillStyle = theme === 'light' ? '#f8fafc' : '#101826';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
      return canvas.toDataURL('image/png');
    },
    onFrame: (cb) => frameCbs.push(cb),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    },
  };
}

// --- field builders ---------------------------------------------------------

/** Probability-density surface: bulges in +Z where many paths sit at (time, value). */
export function densitySurface(
  paths: number[][],
  time: number[],
  ranges: FieldRanges,
  cols = 48,
  rows = 40,
): THREE.Mesh {
  const grid = densityGrid(paths, time, ranges, cols, rows);
  const geom = new THREE.PlaneGeometry(BOX.x, BOX.y, cols - 1, rows - 1);
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const d = grid[i][j];
      pos.setZ(idx, d * BOX.z);
      densityColor(d, c);
      colors[idx * 3] = c.r;
      colors[idx * 3 + 1] = c.g;
      colors[idx * 3 + 2] = c.b;
    }
  }
  pos.needsUpdate = true;
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    flatShading: false,
  });
  return new THREE.Mesh(geom, mat);
}

/** Per-column normalized density grid[cols][rows] in [0,1]. */
function densityGrid(
  paths: number[][],
  time: number[],
  ranges: FieldRanges,
  cols: number,
  rows: number,
): number[][] {
  const grid: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  if (!paths.length) return grid;
  const tLen = time.length;
  let max = 0;
  for (let i = 0; i < cols; i++) {
    const tIdx = Math.min(tLen - 1, Math.round((i / (cols - 1)) * (tLen - 1)));
    for (const p of paths) {
      const v = p[tIdx];
      const frac = clamp01((v - ranges.vMin) / (ranges.vMax - ranges.vMin));
      const row = Math.min(rows - 1, Math.floor(frac * rows));
      grid[i][row] += 1;
    }
    for (let j = 0; j < rows; j++) if (grid[i][j] > max) max = grid[i][j];
  }
  if (max > 0) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) grid[i][j] /= max;
  return grid;
}

/** Ribbon field: a subset of trajectories as colored line segments, fanned slightly in Z. */
export function ribbonLines(
  paths: number[][],
  time: number[],
  ranges: FieldRanges,
  n = 56,
): THREE.LineSegments {
  const step = Math.max(1, Math.floor(paths.length / n));
  const chosen: number[][] = [];
  for (let i = 0; i < paths.length && chosen.length < n; i += step) chosen.push(paths[i]);

  const segPerPath = time.length - 1;
  const vertexCount = chosen.length * segPerPath * 2;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const c = new THREE.Color();
  let v = 0;

  chosen.forEach((path, pi) => {
    const zOff = chosen.length > 1 ? ((pi / (chosen.length - 1)) - 0.5) * 0.5 : 0;
    outcomeColor(path[path.length - 1], ranges, c);
    for (let t = 0; t < segPerPath; t++) {
      const ax = mapT(time[t], ranges);
      const ay = mapV(path[t], ranges);
      const bx = mapT(time[t + 1], ranges);
      const by = mapV(path[t + 1], ranges);
      positions[v * 3] = ax; positions[v * 3 + 1] = ay; positions[v * 3 + 2] = zOff;
      colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b; v++;
      positions[v * 3] = bx; positions[v * 3 + 1] = by; positions[v * 3 + 2] = zOff;
      colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b; v++;
    }
  });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
  return new THREE.LineSegments(geom, mat);
}

/** Translucent ruin barrier plane at y = barrier, spanning time × density. */
export function barrierPlane(ranges: FieldRanges): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(BOX.x, BOX.z);
  geom.rotateX(-Math.PI / 2); // lie flat in x-z
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  );
  mesh.position.set(0, mapV(ranges.barrier, ranges), BOX.z / 2);
  return mesh;
}

// --- disposal ---------------------------------------------------------------

/** Recursively dispose geometries + materials under an object (but keep the object tree). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

/** Remove + dispose every child of a group (used on update before rebuilding). */
export function clearGroup(group: THREE.Group): void {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    disposeObject(child);
    group.remove(child);
  }
}
