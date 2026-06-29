export interface CameraView {
  x: number;
  y: number;
  zoom: number;
}

export interface CameraBounds {
  width: number;
  height: number;
  viewW: number;
  viewH: number;
}

export interface Point {
  x: number;
  y: number;
}

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 2.3;

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function clampCamera(cam: CameraView, bounds: CameraBounds): CameraView {
  const zoom = clampZoom(cam.zoom);
  const halfW = bounds.viewW / (2 * zoom);
  const halfH = bounds.viewH / (2 * zoom);
  const minX = Math.min(bounds.width / 2, halfW);
  const maxX = Math.max(bounds.width / 2, bounds.width - halfW);
  const minY = Math.min(bounds.height / 2, halfH);
  const maxY = Math.max(bounds.height / 2, bounds.height - halfH);

  return {
    x: Math.max(minX, Math.min(maxX, cam.x)),
    y: Math.max(minY, Math.min(maxY, cam.y)),
    zoom,
  };
}

export function screenToWorld(cam: CameraView, sx: number, sy: number, viewW: number, viewH: number): Point {
  return {
    x: (sx - viewW / 2) / cam.zoom + cam.x,
    y: (sy - viewH / 2) / cam.zoom + cam.y,
  };
}

export function worldToScreen(cam: CameraView, wx: number, wy: number, viewW: number, viewH: number): Point {
  return {
    x: (wx - cam.x) * cam.zoom + viewW / 2,
    y: (wy - cam.y) * cam.zoom + viewH / 2,
  };
}

export function zoomAt(cam: CameraView, sx: number, sy: number, zoomFactor: number, bounds: CameraBounds): CameraView {
  const before = screenToWorld(cam, sx, sy, bounds.viewW, bounds.viewH);
  const zoom = clampZoom(cam.zoom * zoomFactor);
  return clampCamera(
    {
      x: before.x - (sx - bounds.viewW / 2) / zoom,
      y: before.y - (sy - bounds.viewH / 2) / zoom,
      zoom,
    },
    bounds,
  );
}

export function panCamera(cam: CameraView, dxScreen: number, dyScreen: number, bounds: CameraBounds): CameraView {
  return clampCamera(
    {
      x: cam.x - dxScreen / cam.zoom,
      y: cam.y - dyScreen / cam.zoom,
      zoom: cam.zoom,
    },
    bounds,
  );
}

export function focusCamera(point: Point, zoom: number, bounds: CameraBounds): CameraView {
  return clampCamera({ x: point.x, y: point.y, zoom }, bounds);
}
