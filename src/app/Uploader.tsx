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

export function Uploader({ onRun, disabled }: Props) {
  const [intent, setIntent] = useState('');
  const [imageName, setImageName] = useState<string | null>(null);
  const imageData = useRef<string | undefined>(undefined);

  const readFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageData.current = reader.result as string;
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    onRun({ intent: intent.trim() || undefined, imageDataUrl: imageData.current });
  };

  return (
    <div className="uploader">
      <input
        type="text"
        placeholder="Describe a model, or attach a chart / screenshot / sketch…"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <label className={`drop ${imageName ? 'has' : ''}`}>
        {imageName ?? '📎 Attach image'}
        <input type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files?.[0])} />
      </label>
      <button className="btn btn-primary" onClick={submit} disabled={disabled}>
        Build ▶
      </button>
    </div>
  );
}