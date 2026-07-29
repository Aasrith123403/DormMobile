import { formatMoney, fromCents, parseAmountInput, toCents } from '../money';

describe('toCents', () => {
  it('converts numbers and Postgres numeric strings', () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents('12.34')).toBe(1234);
    expect(toCents('0.00')).toBe(0);
  });

  it('rounds away float representation error', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99 * 3)).toBe(5997);
  });

  it('falls back to zero for junk', () => {
    expect(toCents('not a number')).toBe(0);
  });
});

describe('fromCents', () => {
  it('round-trips through toCents', () => {
    for (const cents of [0, 1, 99, 100, 12_345, 999_999]) {
      expect(toCents(fromCents(cents))).toBe(cents);
    }
  });
});

describe('formatMoney', () => {
  it('formats positive, zero and negative amounts', () => {
    expect(formatMoney(1234)).toBe('$12.34');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(-1234)).toBe('-$12.34');
    expect(formatMoney(5)).toBe('$0.05');
  });

  it('adds an explicit plus sign when asked', () => {
    expect(formatMoney(1234, { signed: true })).toBe('+$12.34');
    expect(formatMoney(-1234, { signed: true })).toBe('-$12.34');
    expect(formatMoney(0, { signed: true })).toBe('$0.00');
  });
});

describe('parseAmountInput', () => {
  it('accepts the shapes people actually type', () => {
    expect(parseAmountInput('12')).toBe(1200);
    expect(parseAmountInput('12.5')).toBe(1250);
    expect(parseAmountInput('12.34')).toBe(1234);
    expect(parseAmountInput('$12.34')).toBe(1234);
    expect(parseAmountInput('1,234.56')).toBe(123_456);
    expect(parseAmountInput(' 42 ')).toBe(4200);
    expect(parseAmountInput('.99')).toBe(99);
  });

  it('rejects unusable input', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('-5')).toBeNull();
    expect(parseAmountInput('1.2.3')).toBeNull();
  });
});
