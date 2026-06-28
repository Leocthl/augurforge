/**
 * Renderer.tsx — mounts a template''s imperative 2D/3D Renderer and keeps it in sync. [OWNER: A]
 *
 * - Recreates the underlying Plotly/Three renderer only when template, view, or theme change.
 * - Repaints (renderer.update) when the SimResult or the Animate flag changes — switching view
 *   never re-runs the math (run() lives upstream in App).
 */
import { useEffect, useRef } from 'react';
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

export function Renderer({ template, sim, view, animate, theme }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RendererHandle | null>(null);
  const simRef = useRef(sim);
  const animateRef = useRef(animate);
  simRef.current = sim;
  animateRef.current = animate;

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
}