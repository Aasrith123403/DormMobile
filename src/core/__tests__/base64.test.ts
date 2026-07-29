import { encodeBase64 } from '../base64';

const bytesOf = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

describe('encodeBase64', () => {
  it('encodes the classic examples', () => {
    expect(encodeBase64(bytesOf('Man'))).toBe('TWFu');
    expect(encodeBase64(bytesOf('hello world'))).toBe('aGVsbG8gd29ybGQ=');
  });

  it('pads correctly for each remainder length', () => {
    expect(encodeBase64(bytesOf('a'))).toBe('YQ==');
    expect(encodeBase64(bytesOf('ab'))).toBe('YWI=');
    expect(encodeBase64(bytesOf('abc'))).toBe('YWJj');
  });

  it('returns an empty string for no bytes', () => {
    expect(encodeBase64(new Uint8Array())).toBe('');
  });

  it('handles the full byte range, including a JPEG header', () => {
    expect(encodeBase64(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('/9j/4A==');
    expect(encodeBase64(Uint8Array.from([0x00, 0x00, 0x00]))).toBe('AAAA');
    expect(encodeBase64(Uint8Array.from([0xff, 0xff, 0xff]))).toBe('////');
  });

  it('round-trips through Node\'s decoder', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const decoded = Uint8Array.from(Buffer.from(encodeBase64(bytes), 'base64'));
    expect([...decoded]).toEqual([...bytes]);
  });
});
