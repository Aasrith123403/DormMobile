import { File } from 'expo-file-system';

import { encodeBase64 } from '../core/base64';
import type { ReceiptImage } from './parseReceipt';

/**
 * Base64 for an image the OCR provider is about to POST.
 *
 * expo-image-picker hands back base64 directly when asked, which is the fast
 * path; otherwise the file is read and encoded here.
 */
export async function toBase64(image: ReceiptImage): Promise<string> {
  if (image.base64) return image.base64;

  const buffer = await new File(image.uri).arrayBuffer();
  return encodeBase64(new Uint8Array(buffer));
}
