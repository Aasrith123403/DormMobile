import { env } from '../../lib/env';
import { toBase64 } from '../imageData';
import type { OcrProvider, ReceiptImage } from '../parseReceipt';

const ENDPOINT = 'https://api.ocr.space/parse/image';

interface OcrSpaceResponse {
  ParsedResults?: { ParsedText?: string }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
}

/**
 * OCR.space — free tier, no billing account needed, useful for trying the
 * feature out. Accuracy on creased thermal receipts is noticeably worse than
 * Google Vision, so treat it as the "just get it working" option.
 */
export const ocrSpaceOcr: OcrProvider = {
  name: 'ocrspace',

  async recognizeText(image: ReceiptImage): Promise<string> {
    if (!env.ocrSpaceApiKey) {
      throw new Error('Missing EXPO_PUBLIC_OCRSPACE_API_KEY.');
    }

    const base64 = await toBase64(image);

    const body = new FormData();
    body.append('base64Image', `data:image/jpeg;base64,${base64}`);
    body.append('language', 'eng');
    body.append('isTable', 'true');
    body.append('OCREngine', '2');
    body.append('scale', 'true');

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { apikey: env.ocrSpaceApiKey },
      body,
    });

    const payload = (await response.json()) as OcrSpaceResponse;

    if (!response.ok || payload.IsErroredOnProcessing) {
      const message = Array.isArray(payload.ErrorMessage)
        ? payload.ErrorMessage.join(' ')
        : payload.ErrorMessage;
      throw new Error(message || `OCR.space error (${response.status}).`);
    }

    return payload.ParsedResults?.map((result) => result.ParsedText ?? '').join('\n') ?? '';
  },
};
