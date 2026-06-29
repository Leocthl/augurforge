/**
 * ThinkingGraph.tsx — the live galaxy graph. [OWNER: B / explainer]
 * react-force-graph-3d (Three.js + d3-force) renders the {nodes,links} live; new nodes fly in as
 * the force sim re-heats. Aesthetic ported from codebase-memory-mcp: near-black canvas, UnrealBloom
 * glow, additive link particles, gentle auto-rotate.
 */
import { useEffect, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { GraphData } from './types';

// react-force-graph-3d's generics are fiddly; treat the component + ref as loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FG: any = ForceGraph3D;

interface Props {
  data: GraphData;
  width: number;
  height: number;
}

export function ThinkingGraph({ data, width, height }: Props) {
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