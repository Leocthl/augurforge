/**
 * shared.ts — small helpers used by all six agents. [OWNER: A]
 * Not part of the cross-session contract; lives entirely inside /core.
 */
import type { PipelineInput } from '../pipeline';
import { describeAttachmentsForPrompt } from '../attachments';

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
      // Cerebras currently rejects several nested schemas in strict mode; keep loose mode
      // while preserving additionalProperties:false and validating every parsed result locally.
      strict: false,
      schema: cerebrasSchema(schema),
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
    ...(required.length ? { required } : {}),
    ...extra,
  };
}

function cerebrasSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cerebrasSchema);
  if (!isRecord(schema)) return schema;

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'minItems' || key === 'maxItems') continue;
    next[key] = cerebrasSchema(value);
  }

  if (next.type === 'object' && !('properties' in next) && !('anyOf' in next)) {
    next.properties = {};
  }

  return next;
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
  const attachmentSummary = describeAttachmentsForPrompt(input.attachments);
  if (attachmentSummary) bits.push(attachmentSummary);
  else if (input.imageDataUrl) bits.push('An input image is attached for Gemma 4 vision.');
  if (input.mode) bits.push(`Mode: ${input.mode}`);
  return bits.join('\n') || 'No structured input provided.';
}

export function summarizeRawForAgents(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  const keys = [
    'modelKind',
    'modelFamily',
    'assumptions',
    'calibration',
    'monitoring',
    'nPaths',
    'renderPathCount',
    'conePathCount',
    'steps',
    'stepsPerYear',
    'renderStepsPerYear',
    'seed',
    'barrier',
    'barrierCorrection',
    'antitheticVariates',
    'uncertainty',
    'warnings',
    'parityResidual',
    'impliedVolatilityFromCall',
    'dividendYield',
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in raw) out[key] = raw[key];
  }
  if (Array.isArray(raw.terminal)) out.terminalSampleSize = raw.terminal.length;
  if (Array.isArray(raw.losses)) out.lossSampleSize = raw.losses.length;
  if (Array.isArray(raw.shapes)) {
    out.shapeKinds = raw.shapes
      .map((shape) => (isRecord(shape) && typeof shape.kind === 'string' ? shape.kind : undefined))
      .filter(Boolean);
  }
  return out;
}

/** Percent helper for narrative mock text. */
export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
