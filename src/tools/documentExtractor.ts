import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const PDF_MIME = 'application/pdf';
const MAX_PDF_BYTES = 32 * 1024 * 1024;

const EXTRACTION_SYSTEM_PROMPT =
  'Extract all text from the provided document verbatim. Preserve structure (headings, bullets, tables as plain text). Output only the extracted text — no commentary, no markdown fences.';

export type ExtractionResult = {
  text: string;
  skipped?: string;
};

export async function extractText(
  buffer: Buffer,
  mimeType: string | undefined,
  filename: string
): Promise<ExtractionResult> {
  const mt = (mimeType || '').toLowerCase();

  let contentBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam;

  if (SUPPORTED_IMAGE_TYPES.has(mt)) {
    contentBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mt as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: buffer.toString('base64'),
      },
    };
  } else if (mt === PDF_MIME) {
    if (buffer.length > MAX_PDF_BYTES) {
      return { text: '', skipped: 'PDF too large (max 32 MB).' };
    }
    contentBlock = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buffer.toString('base64'),
      },
    };
  } else if (mt === 'image/heic' || mt === 'image/heif') {
    return { text: '', skipped: 'HEIC not supported — please send as JPEG or PNG.' };
  } else {
    return { text: '', skipped: `Unsupported file type: ${mimeType || 'unknown'}` };
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: `Filename: ${filename}. Extract all text.` },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return { text };
  } catch (err) {
    return {
      text: '',
      skipped: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}