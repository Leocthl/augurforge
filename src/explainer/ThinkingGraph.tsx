/**
 * ThinkingGraph.tsx — the live reasoning graph. [OWNER: B / explainer]
 * react-force-graph-3d (Three.js + d3-force) renders {nodes,links} live. Two visual tiers via
 * `variant`: a restrained, design-token 'embed' for the workbench rail and a cinematic 'showcase'
 * galaxy for explainer.html. Honors prefers-reduced-motion; surfaces the <canvas> for clip capture.
 */
import { useEffect, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';
import type { GNode, GraphData, GraphVariant } from './types';
import { ROLE_COLOR, EMBED_ROLE_COLOR } from './types';

// react-force-graph-3d's generics are fiddly; treat the component + ref as loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FG: any = ForceGraph3D;

interface VariantParams {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  autoRotateSpeed: number;
  cameraZ: number;
  nodeRelSize: number;
  background: string;
  labelFloor: number;
  labelCeil: number;
}

const VARIANT: Record<GraphVariant, VariantParams> = {
  showcase: { bloomStrength: 0.14, bloomRadius: 0.2, bloomThreshold: 0.78, autoRotateSpeed: 0.7, cameraZ: 220, nodeRelSize: 3.35, background: '#06090f', labelFloor: 2.6, labelCeil: 5.4 },
  embed: { bloomStrength: 0.08, bloomRadius: 0.16, bloomThreshold: 0.82, autoRotateSpeed: 0.45, cameraZ: 165, nodeRelSize: 2.9, background: '#11151c', labelFloor: 2.4, labelCeil: 4.8 },
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Props {
  data: GraphData;
  width: number;
  height: number;
  variant?: GraphVariant;
  /** Receives the WebGL <canvas> once mounted (used by the clip recorder). */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  /** Fired with a node id when a node is clicked (drives transcript focus). */
  onNodeClick?: (id: string) => void;
}

/** Build the floating text label for a node, coloured from the variant palette. */
function nodeLabelObject(node: GNode, color: string, floor: number, ceil: number): SpriteText {
  const sprite = new SpriteText(node.label);
  sprite.color = color;
  sprite.textHeight = Math.max(floor, Math.min(ceil, node.size * 0.7));
  sprite.fontFace = 'Inter, system-ui, sans-serif';
  sprite.fontWeight = '600';
  sprite.material.depthWrite = false;
  sprite.position.set(0, node.size + 4, 0);
  return sprite;
}

export function ThinkingGraph({ data, width, height, variant = 'showcase', onCanvas, onNodeClick }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bloomRef = useRef<any>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const v = VARIANT[variant];
  const palette = variant === 'embed' ? EMBED_ROLE_COLOR : ROLE_COLOR;

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const composer = fg.postProcessingComposer?.();
      if (composer) {
        const pass = new UnrealBloomPass(new Vector2(width || 800, height || 520), v.bloomStrength, v.bloomRadius, v.bloomThreshold);
        composer.addPass(pass);
        bloomRef.current = pass;
      }
    } catch {
      /* bloom is optional polish */
    }
    const controls = fg.controls?.();
    if (controls) {
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = v.autoRotateSpeed;
      controls.enableDamping = true;
    }
    fg.cameraPosition?.({ z: v.cameraZ });
    if (onCanvas) {
      const renderer = fg.renderer?.();
      onCanvas(renderer?.domElement ?? null);
    }
    return () => onCanvas?.(null);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the bloom pass sized to the container (was previously mount-only).
  useEffect(() => {
    bloomRef.current?.setSize?.(width || 800, height || 520);
  }, [width, height]);

  return (
    <FG
      ref={fgRef}
      width={width}
      height={height}
      graphData={data}
      backgroundColor={v.background}
      showNavInfo={false}
      nodeRelSize={v.nodeRelSize}
      rendererConfig={{ preserveDrawingBuffer: true, antialias: true }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeVal={(n: any) => n.size}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeColor={(n: any) => palette[(n as GNode).role]}
      nodeOpacity={0.95}
      nodeResolution={16}
      nodeThreeObjectExtend
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeThreeObject={(n: any) => nodeLabelObject(n as GNode, palette[(n as GNode).role], v.labelFloor, v.labelCeil)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeLabel={(n: any) => n.label}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onNodeClick={(n: any) => onNodeClick?.((n as GNode).id)}
      linkColor={() => (variant === 'embed' ? '#33455c' : '#2b4a6f')}
      linkOpacity={0.55}
      linkWidth={0.6}
      linkDirectionalParticles={reduced ? 0 : 2}
      linkDirectionalParticleWidth={1.6}
      linkDirectionalParticleSpeed={0.012}
      enableNodeDrag={false}
      warmupTicks={reduced ? 60 : 20}
      cooldownTime={reduced ? 0 : 4000}
    />
  );
}
