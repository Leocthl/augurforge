/**
 * shared.ts — small helpers used by all six agent stubs. [OWNER: A]
 * Not part of the cross-session contract; lives entirely inside /core.
 */
import type { PipelineInput } from '../pipeline';

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * In LIVE mode chat() returns parsed JSON from the proxy; if it has the expected
 * shape we use it, otherwise we fall back to the stub's mock result. Keeps the
 * scaffold crash-proof before the real §7 prompts/schemas exist.
 */
export function coerce<T extends object>(json: unknown, fallback: T, requiredKey: keyof T): T {
  if (json && typeof json === 'object' && (requiredKey as string) in json) {
    return json as T;
  }
  return fallback;
}

/** A compact text summary of the upload — placeholder until real prompt engineering. */
export function describeInput(input: PipelineInput): string {
  const bits: string[] = [];
  if (input.intent) bits.push(`Intent: ${input.intent}`);
  if (input.templateId) bits.push(`Requested template: ${input.templateId}`);
  if (typeof input.data === 'string') bits.push(`Data: ${input.data}`);
  else if (input.data) bits.push(`Data keys: ${Object.keys(input.data).join(', ')}`);
  if (input.imageDataUrl) bits.push('An input image is attached (vision).');
  return bits.join('\n') || 'No structured input provided.';
}

/** Percent helper for narrative mock text. */
export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}