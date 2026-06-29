export type Rng = () => number;

/** Deterministic 32-bit PRNG with a compact state, good enough for seeded demos. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller pair. Returning both normals makes antithetic/pair use explicit upstream. */
export function normalPair(rng: Rng): [number, number] {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  const angle = 2 * Math.PI * v;
  return [mag * Math.cos(angle), mag * Math.sin(angle)];
}

export function normal(rng: Rng): number {
  return normalPair(rng)[0];
}

