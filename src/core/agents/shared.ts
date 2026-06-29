/**
 * shared.ts — small helpers used by all six agents. [OWNER: A]
 * Not part of the cross-session contract; lives entirely inside /core.
 */
import type { PipelineInput } from '../pipeline';

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException ? e.name === 'AbortError' : errMsg(e).toLowerCase().includes('abort');
}

/**
 * In LIVE mode chat() returns parsed JSON from the proxy; if it has the expected
 * shape we use it, otherwise we fall back to the stub's mock result. Keeps the
 * live path crash-proof when a provider returns malformed JSON.
 */
export function coerce<T extends object>(json: unknown, fallback: T, requiredKey: keyof T): T {
  if (json && typeof json === 'object' && (requiredKey as string) in json) {
    return json as T;
  }
  return fallback;
}

export function jsonSchema(name: string, schema: Record<string, unknown>): object {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

export function objectSchema(
  properties: Record<string, unknown>,
  required: string[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
    ...extra,
  };
}

export function stringEnum(values: string[]): Record<string, unknown> {
  return { type: 'string', enum: values };
}

export function cleanString(value: unknown, fallback: string, max = 280): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** A compact text summary of the upload — placeholder until real prompt engineering. */
export function describeInput(input: PipelineInput): string {
  const bits: string[] = [];
  if (input.intent) bits.push(`Intent: ${input.intent}`);
  if (input.templateId) bits.push(`Requested template: ${input.templateId}`);
  if (typeof input.data === 'string') bits.push(`Data: ${input.data}`);
  else if (input.data) bits.push(`Data keys: ${Object.keys(input.data).join(', ')}`);
  if (input.imageDataUrl) bits.push('An input image is attached (vision).');
  if (input.mode) bits.push(`Mode: ${input.mode}`);
  return bits.join('\n') || 'No structured input provided.';
}

/** Percent helper for narrative mock text. */
export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
