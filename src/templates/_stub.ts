/**
 * _stub.ts — placeholder renderer for not-yet-built templates. [OWNER: B]
 * Lets a stub satisfy TemplateModule so the registry + UI work end-to-end.
 */
import type { Renderer } from '../core/contract';

export function comingSoonRenderer(el: HTMLElement, label: string): Renderer {
  const paint = () => {
    el.innerHTML =
      '<div class="coming-soon">' +
      '<div class="cs-badge">stub</div>' +
      `<p>${label}</p>` +
      '<span>Implement run() + render2D/3D following the Monte Carlo pattern.</span>' +
      '</div>';
  };
  paint();
  return { update: () => paint(), destroy: () => { el.innerHTML = ''; } };
}