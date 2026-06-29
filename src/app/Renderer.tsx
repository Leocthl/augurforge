/**
 * Renderer.tsx — mounts a template''s imperative 2D/3D Renderer and keeps it in sync. [OWNER: A]
 *
 * - Recreates the underlying Plotly/Three renderer only when template, view, or theme change.
 * - Repaints (renderer.update) when the SimResult or the Animate flag changes — switching view
 *   never re-runs the math (run() lives upstream in App).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type {
  Renderer as RendererHandle,
  RenderOpts,
  SimResult,
  TemplateModule,
  Theme,
  ViewKind,
} from '../core/contract';

interface Props {
  template: TemplateModule;
  sim: SimResult;
  view: ViewKind;
  animate: boolean;
  theme: Theme;
}

export interface RendererApi {
  exportPng(): Promise<string>;
}

const EXPORT_BACKGROUND = '#101826';

function canvasToPng(source: HTMLCanvasElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = source.width || Math.max(1, Math.round(source.clientWidth * window.devicePixelRatio));
  canvas.height = source.height || Math.max(1, Math.round(source.clientHeight * window.devicePixelRatio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create PNG export canvas');
  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterize SVG chart'));
    image.src = url;
  });
}

async function svgToPng(svg: SVGSVGElement): Promise<string> {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, Math.round(rect.width || viewBox.width || 900));
  const height = Math.max(1, Math.round(rect.height || viewBox.height || 520));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await imageFromUrl(url);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create PNG export canvas');
    ctx.scale(scale, scale);
    ctx.fillStyle = EXPORT_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportElementPng(el: HTMLElement): Promise<string> {
  const canvas = el.querySelector<HTMLCanvasElement>('canvas');
  if (canvas) return canvasToPng(canvas);
  const svg = el.querySelector<SVGSVGElement>('svg');
  if (svg) return svgToPng(svg);
  throw new Error('No exportable chart surface found');
}

export const Renderer = forwardRef<RendererApi, Props>(function Renderer(
  { template, sim, view, animate, theme },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RendererHandle | null>(null);
  const simRef = useRef(sim);
  const animateRef = useRef(animate);
  simRef.current = sim;
  animateRef.current = animate;

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      const handle = handleRef.current;
      if (handle?.exportPng) return handle.exportPng();
      const el = elRef.current;
      if (!el) throw new Error('No chart mounted');
      return exportElementPng(el);
    },
  }), []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const fn =
      view === '3d'
        ? template.render3D ?? template.render2D
        : template.render2D ?? template.render3D;
    if (!fn) return;
    const opts: RenderOpts = { animate: animateRef.current, theme };
    const handle = fn(el, simRef.current, opts);
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // animate excluded on purpose: toggling it should update, not recreate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, view, theme]);

  useEffect(() => {
    handleRef.current?.update(sim, animate);
  }, [sim, animate]);

  return <div className="chart" ref={elRef} />;
});
