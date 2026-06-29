import type { AgentEvent, Metric } from './contract';
import type { PipelineAttachment, PipelineAttachmentKind } from './attachments';
import type { PipelineInput } from './pipeline';

const STORAGE_KEY = 'augurforge.latestSession.v1';
const EVENT_NAME = 'augurforge:session';
const TEXT_PREVIEW_LIMIT = 800;
const EVENT_LIMIT = 80;

export interface SessionAttachment {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  size: number;
  pageCount?: number;
  note?: string;
  textPreview?: string;
}

export interface SessionInput {
  intent?: string;
  mode?: PipelineInput['mode'];
  templateId?: string;
  attachments?: SessionAttachment[];
}

export interface AugurForgeSessionSnapshot {
  version: 1;
  updatedAt: number;
  input?: SessionInput;
  title?: string;
  modelerMapping?: Record<string, string>;
  metrics?: Metric[];
  latestSummary?: string;
  events?: AgentEvent[];
}

export function sanitizeAttachmentsForSession(attachments: PipelineAttachment[] | undefined): SessionAttachment[] {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    size: attachment.size,
    pageCount: attachment.pageCount,
    note: attachment.note,
    textPreview: attachment.text?.slice(0, TEXT_PREVIEW_LIMIT),
  }));
}

export function inputForSession(input: PipelineInput | undefined, templateId?: string): SessionInput | undefined {
  if (!input) return undefined;
  const attachments = sanitizeAttachmentsForSession(input.attachments);
  return {
    intent: input.intent,
    mode: input.mode,
    templateId: templateId ?? input.templateId,
    attachments: attachments.length ? attachments : undefined,
  };
}

export function pipelineInputFromSession(snapshot: AugurForgeSessionSnapshot | null): PipelineInput | undefined {
  const input = snapshot?.input;
  if (!input) return undefined;
  return {
    intent: input.intent,
    mode: input.mode,
    templateId: input.templateId,
    data: summaryDataFromSession(snapshot),
    attachments: input.attachments?.map((attachment): PipelineAttachment => ({
      id: attachment.id,
      name: attachment.name,
      kind: safeAttachmentKind(attachment.kind),
      mimeType: attachment.mimeType,
      size: attachment.size,
      pageCount: attachment.pageCount,
      note: attachment.note,
      text: attachment.textPreview,
    })),
  };
}

function summaryDataFromSession(snapshot: AugurForgeSessionSnapshot): string | undefined {
  const lines = [
    snapshot.title ? `Current model: ${snapshot.title}` : undefined,
    snapshot.latestSummary ? `Latest summary: ${snapshot.latestSummary}` : undefined,
    snapshot.input?.attachments?.length
      ? `Uploaded files: ${snapshot.input.attachments.map((attachment) => attachment.name).join(', ')}`
      : undefined,
    ...(snapshot.metrics ?? []).slice(0, 4).map((metric) => `${metric.label}: ${metric.value}`),
    ...Object.entries(snapshot.modelerMapping ?? {})
      .filter(([, value]) => value.trim())
      .slice(0, 6)
      .map(([label, value]) => `${label}: ${value}`),
    ...(snapshot.input?.attachments ?? [])
      .filter((attachment) => attachment.textPreview?.trim())
      .slice(0, 3)
      .map((attachment) => `${attachment.name} preview: ${attachment.textPreview}`),
  ].filter((line): line is string => Boolean(line));
  return lines.length ? lines.join('\n') : undefined;
}

function safeAttachmentKind(kind: string): PipelineAttachmentKind {
  return kind === 'pdf' || kind === 'diagram' || kind === 'image' ? kind : 'diagram';
}

export function readAugurForgeSession(): AugurForgeSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AugurForgeSessionSnapshot;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAugurForgeSession(next: Partial<AugurForgeSessionSnapshot>): AugurForgeSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  const prev = readAugurForgeSession();
  const snapshot: AugurForgeSessionSnapshot = {
    version: 1,
    updatedAt: Date.now(),
    ...prev,
    ...next,
    events: next.events ? next.events.slice(-EVENT_LIMIT) : prev?.events,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
    return snapshot;
  } catch {
    return null;
  }
}

export function subscribeAugurForgeSession(cb: (snapshot: AugurForgeSessionSnapshot | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    cb((event as CustomEvent<AugurForgeSessionSnapshot>).detail ?? readAugurForgeSession());
  };
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) cb(readAugurForgeSession());
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
