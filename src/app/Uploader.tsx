import { useRef, useState } from 'react';
import type { PipelineInput } from '../core/pipeline';
import {
  dataUrlPayloadBytes,
  extractPdfTextFromBytes,
  formatBytes,
  type PipelineAttachment,
} from '../core/attachments';

interface Props {
  onRun: (input: PipelineInput) => void;
  disabled?: boolean;
}

const MAX_ATTACHMENTS = 6;
const MAX_VISION_IMAGES = 3;
const MAX_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 4_800_000;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_DIAGRAM_BYTES = 1 * 1024 * 1024;
const ACCEPTED_FILES = 'image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.webp,.svg,.pdf';
const SUPPORTED_RASTER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function Uploader({ onRun, disabled }: Props) {
  const [intent, setIntent] = useState('');
  const [attachments, setAttachments] = useState<PipelineAttachment[]>([]);
  const [mode, setMode] = useState<PipelineInput['mode']>('auto');
  const [fileError, setFileError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prepareFiles = async (files?: FileList | File[]) => {
    if (!files || disabled || preparing) return;
    const incoming = Array.from(files);
    if (!incoming.length) return;

    const slots = MAX_ATTACHMENTS - attachments.length;
    if (slots <= 0) {
      setFileError(`Attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    setPreparing(true);
    const errors: string[] = [];
    const prepared: PipelineAttachment[] = [];
    let remainingImageSlots = MAX_VISION_IMAGES - attachments.filter((attachment) => attachment.kind === 'image').length;

    for (const file of incoming.slice(0, slots)) {
      try {
        const attachment = await prepareAttachment(file, remainingImageSlots);
        if (attachment.kind === 'image') remainingImageSlots -= 1;
        prepared.push(attachment);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (incoming.length > slots) errors.push(`Only the first ${slots} file${slots === 1 ? '' : 's'} were added.`);

    if (prepared.length) {
      setAttachments((prev) => {
        const seen = new Set(prev.map((attachment) => attachment.id));
        const unique = prepared.filter((attachment) => !seen.has(attachment.id));
        return [...prev, ...unique].slice(0, MAX_ATTACHMENTS);
      });
    }
    setFileError(errors.length ? errors.join(' ') : null);
    setPreparing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    setFileError(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const files = filesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    void prepareFiles(files);
  };

  const submit = () => {
    if (disabled || preparing) return;
    const firstImage = attachments.find((attachment) => attachment.kind === 'image' && attachment.dataUrl);
    onRun({
      intent: intent.trim() || undefined,
      attachments,
      imageDataUrl: firstImage?.dataUrl,
      mode,
    });
  };

  const useGeneratedDemo = () => {
    setMode('generate');
    setIntent('Build a Black-Scholes option pricing sandbox with Greeks and a pricing curve');
  };

  const attachLabel = preparing
    ? 'Preparing'
    : attachments.length
      ? `${attachments.length} attached`
      : 'Attach files';
  const busy = Boolean(disabled || preparing);

  return (
    <div className="uploader">
      <div className="seg mode-seg" role="tablist" aria-label="model build mode">
        <button type="button" className={mode !== 'generate' ? 'active' : ''} onClick={() => setMode('auto')}>
          Auto
        </button>
        <button type="button" className={mode === 'generate' ? 'active' : ''} onClick={() => setMode('generate')}>
          Generate
        </button>
      </div>
      <div className="prompt-field">
        <input
          type="text"
          aria-label="model intent"
          placeholder={
            mode === 'generate'
              ? 'Build a Black-Scholes option pricing sandbox'
              : 'Describe a model, chart, screenshot, diagram, or PDF'
          }
          value={intent}
          disabled={disabled}
          onChange={(e) => setIntent(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
      <label
        className={`drop ${attachments.length ? 'has' : ''} ${dragging ? 'dragging' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void prepareFiles(e.dataTransfer.files);
        }}
      >
        {attachLabel}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          hidden
          disabled={busy}
          onChange={(e) => void prepareFiles(e.target.files ?? undefined)}
        />
      </label>
      <button className="btn" type="button" onClick={useGeneratedDemo} disabled={disabled}>
        Black-Scholes
      </button>
      <button className="btn btn-primary" onClick={submit} disabled={busy}>
        {mode === 'generate' ? 'Generate model' : 'Build'}
      </button>
      {attachments.length > 0 && (
        <div className="attachment-strip" aria-label="attached files">
          {attachments.map((attachment) => (
            <span className={`attachment-chip ${attachment.kind}`} key={attachment.id}>
              <b>{attachmentKindLabel(attachment)}</b>
              <span className="attachment-name" title={attachment.name}>
                {attachment.name}
              </span>
              <span className="attachment-meta">{attachmentMeta(attachment)}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => removeAttachment(attachment.id)}
                disabled={busy}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
      {fileError && <span className="upload-error">{fileError}</span>}
    </div>
  );
}

async function prepareAttachment(file: File, remainingImageSlots: number): Promise<PipelineAttachment> {
  const mimeType = normalizedMimeType(file);
  const id = `${file.name}-${file.size}-${file.lastModified}`;

  if (SUPPORTED_RASTER_IMAGE_TYPES.has(mimeType)) {
    if (remainingImageSlots <= 0) throw new Error(`use up to ${MAX_VISION_IMAGES} vision images`);
    if (file.size > MAX_IMAGE_SOURCE_BYTES) throw new Error(`image source must be under ${formatBytes(MAX_IMAGE_SOURCE_BYTES)}`);
    const original = await readAsDataUrl(file);
    const dataUrl = original.length <= MAX_IMAGE_DATA_URL_CHARS ? original : await compressImage(file);
    if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      throw new Error('image is still too large after preparation');
    }
    const preparedBytes = dataUrlPayloadBytes(dataUrl);
    return {
      id,
      name: file.name,
      kind: 'image',
      mimeType: dataUrl.slice(5, dataUrl.indexOf(';')) || mimeType,
      size: file.size,
      dataUrl,
      note:
        dataUrl === original
          ? `Vision payload ${formatBytes(preparedBytes)}`
          : `Compressed for vision to ${formatBytes(preparedBytes)}`,
    };
  }

  if (mimeType === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error(`PDF must be under ${formatBytes(MAX_PDF_BYTES)}`);
    const extracted = extractPdfTextFromBytes(await file.arrayBuffer());
    return {
      id,
      name: file.name,
      kind: 'pdf',
      mimeType,
      size: file.size,
      text: extracted.text,
      pageCount: extracted.pageCount,
      note: extracted.note,
    };
  }

  if (mimeType === 'image/svg+xml') {
    if (file.size > MAX_DIAGRAM_BYTES) throw new Error(`SVG diagram must be under ${formatBytes(MAX_DIAGRAM_BYTES)}`);
    return {
      id,
      name: file.name,
      kind: 'diagram',
      mimeType,
      size: file.size,
      text: (await file.text()).slice(0, 12_000),
      note: 'SVG diagram text extracted',
    };
  }

  throw new Error('use PNG, JPEG, WebP, SVG, or PDF');
}

function filesFromClipboard(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter((file) => file.size > 0);
  if (files.length) return files.map((file, index) => clipboardFile(file, index));

  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item, index) => {
      const file = item.getAsFile();
      return file ? clipboardFile(file, index) : null;
    })
    .filter((file): file is File => Boolean(file));
}

function clipboardFile(file: File, index: number): File {
  if (file.name && file.name !== 'image.png') return file;
  const ext = extensionForMime(file.type);
  const name = `pasted-screenshot-${index + 1}.${ext}`;
  return new File([file], name, { type: file.type, lastModified: Date.now() });
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'png';
}

function normalizedMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File): Promise<string> {
  const img = await loadImage(file);
  const attempts = [
    { maxDim: 1800, quality: 0.86 },
    { maxDim: 1500, quality: 0.78 },
    { maxDim: 1200, quality: 0.72 },
  ];
  let best = '';
  for (const attempt of attempts) {
    const dataUrl = drawImageToJpeg(img, attempt.maxDim, attempt.quality);
    best = dataUrl;
    if (dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS) return dataUrl;
  }
  return best;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not prepare image'));
    };
    img.src = url;
  });
}

function drawImageToJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not prepare image canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function attachmentKindLabel(attachment: PipelineAttachment): string {
  if (attachment.kind === 'pdf') return 'PDF';
  if (attachment.kind === 'diagram') return 'SVG';
  return 'IMG';
}

function attachmentMeta(attachment: PipelineAttachment): string {
  if (attachment.kind === 'image' && attachment.dataUrl) {
    return formatBytes(dataUrlPayloadBytes(attachment.dataUrl));
  }
  if (attachment.kind === 'pdf') {
    const pages = attachment.pageCount ? `${attachment.pageCount}p` : 'PDF';
    const text = attachment.text ? `${attachment.text.length.toLocaleString()} chars` : 'metadata';
    return `${pages} / ${text}`;
  }
  if (attachment.kind === 'diagram') return `${Math.min(attachment.text?.length ?? 0, 12_000).toLocaleString()} chars`;
  return formatBytes(attachment.size);
}
