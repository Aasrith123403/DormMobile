/**
 * Base64 encoding. React Native ships no `btoa`, and the usual workarounds
 * (Blob + FileReader) are slower and harder to test than this. Lives in core
 * so it stays pure and unit-tested; the OCR layer wraps it with file reading.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const byte2 = bytes[i + 1];
    const byte3 = bytes[i + 2];

    const chunk = (byte1 << 16) | ((byte2 ?? 0) << 8) | (byte3 ?? 0);

    output += ALPHABET[(chunk >> 18) & 63];
    output += ALPHABET[(chunk >> 12) & 63];
    output += byte2 === undefined ? '=' : ALPHABET[(chunk >> 6) & 63];
    output += byte3 === undefined ? '=' : ALPHABET[chunk & 63];
  }

  return output;
}
