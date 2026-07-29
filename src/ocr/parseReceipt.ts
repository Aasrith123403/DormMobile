import { env } from '../lib/env';
import { extractReceiptFields, ReceiptFields } from './extract';
import { googleVisionOcr } from './providers/googleVision';
import { ocrSpaceOcr } from './providers/ocrSpace';

/**
 * The one seam the rest of the app knows about.
 *
 * Everything OCR-shaped goes through `parseReceipt`. Swapping providers — to
 * a different API, or to an on-device model in a dev build — means writing a
 * new `OcrProvider` and adding a case below; no screen changes.
 *
 * ---------------------------------------------------------------------------
 * Which provider to use
 * ---------------------------------------------------------------------------
 * Recommended: **Google Cloud Vision** (`EXPO_PUBLIC_OCR_PROVIDER=google`).
 * It is a plain HTTPS call, so it works in Expo Go with no native module and
 * no custom dev client; DOCUMENT_TEXT_DETECTION handles crumpled thermal
 * receipts far better than the free alternatives, and the first 1,000
 * requests each month are free — plenty for a dorm.
 *
 * On-device (ML Kit / Vision framework) is cheaper at scale and works
 * offline, but every option requires a native module, which means leaving the
 * managed Expo Go workflow. If you later build a dev client, implement
 * `OcrProvider` over `@react-native-ml-kit/text-recognition` and register it
 * here — `parseReceipt`'s signature does not change.
 *
 * Note that an API-based provider sends the receipt image to a third party.
 * With `EXPO_PUBLIC_OCR_PROVIDER=none` the app never uploads anything for
 * scanning and users type amounts by hand.
 */

export interface ReceiptImage {
  /** Local file URI from expo-image-picker. */
  uri: string;
  /** Base64 payload, when the picker was asked for one. Avoids a re-read. */
  base64?: string | null;
}

export interface ParsedReceipt extends ReceiptFields {
  /** Raw OCR text, kept for debugging and for a "show what I read" affordance. */
  rawText: string;
  provider: 'google' | 'ocrspace' | 'none';
  /** Set when OCR could not run; the UI falls back to manual entry. */
  error: string | null;
}

/** What a provider must implement: image in, plain text out. */
export interface OcrProvider {
  name: 'google' | 'ocrspace';
  recognizeText(image: ReceiptImage): Promise<string>;
}

const EMPTY: ReceiptFields = { amountCents: null, merchant: null, confidence: 0 };

export async function parseReceipt(image: ReceiptImage): Promise<ParsedReceipt> {
  const provider = resolveProvider();

  if (!provider) {
    return {
      ...EMPTY,
      rawText: '',
      provider: 'none',
      error:
        env.ocrProvider === 'none'
          ? null
          : 'Receipt scanning is not configured. Add an OCR API key to .env.',
    };
  }

  try {
    const rawText = await provider.recognizeText(image);

    if (!rawText.trim()) {
      return {
        ...EMPTY,
        rawText: '',
        provider: provider.name,
        error: "Couldn't read that receipt. Try a flatter, brighter photo.",
      };
    }

    return { ...extractReceiptFields(rawText), rawText, provider: provider.name, error: null };
  } catch (caught) {
    return {
      ...EMPTY,
      rawText: '',
      provider: provider.name,
      error: (caught as Error).message || 'Receipt scanning failed.',
    };
  }
}

function resolveProvider(): OcrProvider | null {
  switch (env.ocrProvider) {
    case 'google':
      return env.googleVisionApiKey ? googleVisionOcr : null;
    case 'ocrspace':
      return env.ocrSpaceApiKey ? ocrSpaceOcr : null;
    default:
      return null;
  }
}

/** True when a scan button should appear at all. */
export function isOcrEnabled(): boolean {
  return resolveProvider() !== null;
}
