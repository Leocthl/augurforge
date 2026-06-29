/**
 * useClipRecorder.ts — record the graph <canvas> to a downloadable .webm. [OWNER: B / explainer]
 *
 * Wraps MediaRecorder over a canvas captureStream(). Picks the first supported VP9/VP8/webm codec,
 * degrades gracefully when none is available (recording simply stays unsupported), and on stop
 * triggers a browser download of the clip. Built for capturing the demo video of the thinking graph.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const CANDIDATE_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* isTypeSupported can throw on exotic browsers — treat as unsupported */
    }
  }
  return null;
}

export interface ClipRecorder {
  /** True when MediaRecorder + a webm codec are available in this browser. */
  supported: boolean;
  recording: boolean;
  /** Begin capturing from the supplied canvas. No-op if unsupported or already recording. */
  start: (canvas: HTMLCanvasElement) => void;
  /** Stop and trigger the .webm download. */
  stop: () => void;
}

export function useClipRecorder(fps = 30): ClipRecorder {
  const [supported] = useState<boolean>(() => pickMimeType() !== null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const download = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `augurforge-thinking-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click has had a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const start = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (recorderRef.current || !canvas || typeof canvas.captureStream !== 'function') return;
      const mimeType = pickMimeType();
      if (!mimeType) return;
      try {
        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        recorder.ondataavailable = (ev: BlobEvent) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          recorderRef.current = null;
          setRecording(false);
          if (blob.size > 0) download(blob);
        };
        recorder.start();
        recorderRef.current = recorder;
        setRecording(true);
      } catch (err) {
        // Codec/stream failure — keep the UI usable rather than throwing.
        console.error('[useClipRecorder] failed to start recording:', err);
        recorderRef.current = null;
        setRecording(false);
      }
    },
    [download, fps],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  // Tear down a live recording if the component unmounts mid-capture.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    };
  }, []);

  return { supported, recording, start, stop };
}
