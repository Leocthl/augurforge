/**
 * ThinkingGraph.tsx — the live galaxy graph. [OWNER: B / explainer]
 * react-force-graph-3d (Three.js + d3-force) renders the {nodes,links} live; new nodes fly in as
 * the force sim re-heats. Aesthetic ported from codebase-memory-mcp: near-black canvas, UnrealBloom
 * glow, additive link particles, gentle auto-rotate. Each node carries an always-visible SpriteText
 * label (sized by node.size, coloured by node.color), and the underlying <canvas> is surfaced to the
 * parent so a clip can be recorded for the demo video.
 */
import { useEffect, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';
import type { GNode, GraphData } from './types';

// react-force-graph-3d's generics are fiddly; treat the component + ref as loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FG: any = ForceGraph3D;

interface Props {
  data: GraphData;
  width: number;
  height: number;
  /** Receives the WebGL <canvas> once mounted (used by the clip recorder). */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}

/** Build the floating text label for a node. Sized/coloured from the node's own fields. */
function nodeLabelObject(node: GNode): SpriteText {
  const sprite = new SpriteText(node.label);
  sprite.color = node.color;
  // Scale text with node size but keep a readable floor/ceiling.
  sprite.textHeight = Math.max(3.5, Math.min(8, node.size * 0.7));
  sprite.fontFace = 'Inter, system-ui, sans-serif';
  sprite.fontWeight = '600';
  sprite.material.depthWrite = false;
  // Lift the label clear of the node sphere so it never overlaps the glow.
  sprite.position.set(0, node.size + 4, 0);
  return sprite;
}

export function ThinkingGraph({ data, width, height, onCanvas }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const composer = fg.postProcessingComposer?.();
      if (composer) composer.addPass(new UnrealBloomPass(new Vector2(width || 800, height || 520), 2.2, 0.9, 0.1));
    } catch {
      /* bloom is optional polish */
    }
    const controls = fg.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.7;
      controls.enableDamping = true;
    }
    fg.cameraPosition?.({ z: 230 });
    // Surface the rendered canvas for the clip recorder.
    if (onCanvas) {
      const renderer = fg.renderer?.();
      onCanvas(renderer?.domElement ?? null);
    }
    return () => onCanvas?.(null);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FG
      ref={fgRef}
      width={width}
      height={height}
      graphData={data}
      backgroundColor="#06090f"
      showNavInfo={false}
      nodeRelSize={4}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeVal={(n: any) => n.size}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeColor={(n: any) => n.color}
      nodeOpacity={0.95}
      nodeResolution={16}
      // Always-on text labels via three-spritetext, drawn alongside the node sphere.
      nodeThreeObjectExtend
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeThreeObject={(n: any) => nodeLabelObject(n as GNode)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeLabel={(n: any) => n.label}
      linkColor={() => '#2b4a6f'}
      linkOpacity={0.55}
      linkWidth={0.6}
      linkDirectionalParticles={2}
      linkDirectionalParticleWidth={1.6}
      linkDirectionalParticleSpeed={0.012}
      enableNodeDrag={false}
      warmupTicks={20}
      cooldownTime={4000}
    />
  );
}