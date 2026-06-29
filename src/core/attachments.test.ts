import { describe, expect, it } from 'vitest';
import {
  describeAttachmentsForPrompt,
  extractPdfTextFromBytes,
  type PipelineAttachment,
} from './attachments';

function arrayBufferFromAscii(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('attachment helpers', () => {
  it('extracts plain text from simple uncompressed PDFs', () => {
    const pdf = `%PDF-1.4
1 0 obj << /Type /Page >> endobj
stream
BT /F1 12 Tf 72 720 Td (Loss triangle AY 2024) Tj [( sigma ) 120 (18 percent)] TJ ET
endstream
%%EOF`;

    const result = extractPdfTextFromBytes(arrayBufferFromAscii(pdf));

    expect(result.pageCount).toBe(1);
    expect(result.text).toContain('Loss triangle AY 2024');
    expect(result.text).toContain('sigma');
    expect(result.note).toContain('Embedded PDF text extracted');
  });

  it('summarizes images and PDF extracts for agent prompts', () => {
    const attachments: PipelineAttachment[] = [
      {
        id: 'chart',
        name: 'triangle.png',
        kind: 'image',
        mimeType: 'image/png',
        size: 1024,
        dataUrl: 'data:image/png;base64,aaaa',
      },
      {
        id: 'pdf',
        name: 'assumptions.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
        size: 2048,
        text: 'Use a 30 year horizon and 18 percent volatility.',
        pageCount: 2,
      },
    ];

    const summary = describeAttachmentsForPrompt(attachments);

    expect(summary).toContain('triangle.png');
    expect(summary).toContain('Gemma 4');
    expect(summary).toContain('assumptions.pdf');
    expect(summary).toContain('30 year horizon');
    expect(summary).toContain('untrusted source material');
  });
});
