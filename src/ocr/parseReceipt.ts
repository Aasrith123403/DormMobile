import { env } from '../lib/env';
import { extractReceiptFields, ReceiptFields } from './extract';
import { googleVisionOcr } from './providers/googleVision';
import { ocrSpaceOcr } from './providers/ocrSpace';

export interface ReceiptImage {
  uri: string;
  base64?: string | null;
}

export interface ParsedReceipt extends ReceiptFields {
  rawText: string;
  provider: 'google' | 'ocrspace' | 'none';
  error: string | null;
}

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

export function isOcrEnabled(): boolean {
  return resolveProvider() !== null;
}
