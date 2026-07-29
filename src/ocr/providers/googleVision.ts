import { env } from '../../lib/env';
import { toBase64 } from '../imageData';
import type { OcrProvider, ReceiptImage } from '../parseReceipt';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionResponse {
  responses?: {
    fullTextAnnotation?: { text?: string };
    textAnnotations?: { description?: string }[];
    error?: { message?: string };
  }[];
  error?: { message?: string };
}

/**
 * Google Cloud Vision DOCUMENT_TEXT_DETECTION over plain HTTPS — no native
 * module, so it runs in Expo Go.
 *
 * The API key is restricted to the Vision API in the Google console. It ships
 * in the bundle like any EXPO_PUBLIC_ value, so restrict it by API (and by
 * app bundle id once you build standalone); it grants nothing but OCR.
 */
export const googleVisionOcr: OcrProvider = {
  name: 'google',

  async recognizeText(image: ReceiptImage): Promise<string> {
    if (!env.googleVisionApiKey) {
      throw new Error('Missing EXPO_PUBLIC_GOOGLE_VISION_API_KEY.');
    }

    const base64 = await toBase64(image);

    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(env.googleVisionApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            // Receipts are overwhelmingly English; narrowing the hint cuts
            // false positives on lookalike glyphs such as 5/S and 0/O.
            imageContext: { languageHints: ['en'] },
          },
        ],
      }),
    });

    const payload = (await response.json()) as VisionResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Vision API error (${response.status}).`);
    }

    const first = payload.responses?.[0];
    if (first?.error?.message) throw new Error(first.error.message);

    return first?.fullTextAnnotation?.text ?? first?.textAnnotations?.[0]?.description ?? '';
  },
};
