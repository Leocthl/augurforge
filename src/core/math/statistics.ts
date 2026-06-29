export interface Interval {
  lower: number;
  upper: number;
  confidence: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: readonly number[]): number {
  if (!values.length) return NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function varianceSample(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  let sumSq = 0;
  for (const value of values) {
    const d = value - avg;
    sumSq += d * d;
  }
  return sumSq / (values.length - 1);
}

export function stddevSample(values: readonly number[]): number {
  return Math.sqrt(varianceSample(values));
}

export function sortedQuantile(sortedAsc: readonly number[], probability: number): number {
  if (!sortedAsc.length) return NaN;
  const p = clamp(probability, 0, 1);
  const rank = p * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

export function quantile(values: readonly number[], probability: number): number {
  return sortedQuantile([...values].sort((a, b) => a - b), probability);
}

/** Mean loss beyond the confidence quantile. Expects larger values to be worse. */
export function expectedShortfall(values: readonly number[], confidence: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const threshold = sortedQuantile(sorted, confidence);
  const tail = sorted.filter((value) => value >= threshold);
  return mean(tail.length ? tail : [sorted[sorted.length - 1]]);
}

export function maxDrawdownFromPath(path: readonly number[]): number {
  if (!path.length) return 0;
  let peak = path[0];
  let worst = 0;
  for (const value of path) {
    if (value > peak) peak = value;
    if (peak > 0) worst = Math.max(worst, (peak - value) / peak);
  }
  return worst;
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function binomialWilsonInterval(
  successes: number,
  trials: number,
  confidence = 0.95,
): Interval {
  if (trials <= 0) return { lower: NaN, upper: NaN, confidence };
  const z = zForConfidence(confidence);
  const phat = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (phat + z2 / (2 * trials)) / denom;
  const half = (z / denom) * Math.sqrt((phat * (1 - phat)) / trials + z2 / (4 * trials * trials));
  return {
    lower: clamp(center - half, 0, 1),
    upper: clamp(center + half, 0, 1),
    confidence,
  };
}

/** Distribution-free quantile CI using the normal approximation to order statistics. */
export function quantileRankInterval(
  sortedAsc: readonly number[],
  probability: number,
  confidence = 0.95,
): Interval {
  if (!sortedAsc.length) return { lower: NaN, upper: NaN, confidence };
  const p = clamp(probability, 0, 1);
  const z = zForConfidence(confidence);
  const n = sortedAsc.length;
  const center = p * (n - 1);
  const spread = z * Math.sqrt(n * p * (1 - p));
  const lo = Math.floor(clamp(center - spread, 0, n - 1));
  const hi = Math.ceil(clamp(center + spread, 0, n - 1));
  return { lower: sortedAsc[lo], upper: sortedAsc[hi], confidence };
}

export function meanInterval(values: readonly number[], confidence = 0.95): Interval {
  if (!values.length) return { lower: NaN, upper: NaN, confidence };
  const avg = mean(values);
  if (values.length < 2) return { lower: avg, upper: avg, confidence };
  const half = zForConfidence(confidence) * (stddevSample(values) / Math.sqrt(values.length));
  return { lower: avg - half, upper: avg + half, confidence };
}

function zForConfidence(confidence: number): number {
  if (confidence >= 0.995) return 2.807;
  if (confidence >= 0.99) return 2.576;
  if (confidence >= 0.975) return 2.241;
  if (confidence >= 0.95) return 1.96;
  if (confidence >= 0.9) return 1.645;
  return 1.96;
}

