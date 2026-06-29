/**
 * Uploader.tsx — free-text intent + optional image drop → a PipelineInput for the Modeler. [OWNER: A]
 * The image is read as a base64 data URI (the format the Modeler''s vision call expects).
 */
import { useRef, useState } from 'react';
import type { PipelineInput } from '../core/pipeline';

interface Props {
  onRun: (input: PipelineInput) => void;
  disabled?: boolean;
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function Uploader({ onRun, disabled }: Props) {
  const [intent, setIntent] = useState('');
  const [imageName, setImageName] = useState<string | null>(null);
  const [mode, setMode] = useState<PipelineInput['mode']>('auto');
  const [fileError, setFileError] = useState<string | null>(null);
  const imageData = useRef<string | undefined>(undefined);

  const readFile = (file?: File) => {
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      imageData.current = undefined;
      setImageName(null);
      setFileError('Use a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      imageData.current = undefined;
      setImageName(null);
      setFileError('Image must be under 6 MB.');
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      imageData.current = reader.result as string;
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (disabled) return;
    onRun({ intent: intent.trim() || undefined, imageDataUrl: imageData.current, mode });
  };

  const useGeneratedDemo = () => {
    setMode('generate');
    setIntent('Build a Black-Scholes option pricing sandbox with Greeks and a pricing curve');
  };

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
              : 'Describe a model, chart, screenshot, or sketch'
          }
          value={intent}
          disabled={disabled}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
      <label className={`drop ${imageName ? 'has' : ''}`}>
        {imageName ?? 'Attach image'}
        <input type="file" accept="image/*" hidden disabled={disabled} onChange={(e) => readFile(e.target.files?.[0])} />
      </label>
      <button className="btn" type="button" onClick={useGeneratedDemo} disabled={disabled}>
        Black-Scholes
      </button>
      <button className="btn btn-primary" onClick={submit} disabled={disabled}>
        {mode === 'generate' ? 'Generate model' : 'Build'}
      </button>
      {fileError && <span className="upload-error">{fileError}</span>}
    </div>
  );
}
