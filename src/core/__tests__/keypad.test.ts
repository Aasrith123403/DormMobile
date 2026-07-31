import { applyKey, displayAmount } from '../amountInput';

describe('applyKey', () => {
  it('appends digits', () => {
    expect(applyKey('', '4')).toBe('4');
    expect(applyKey('4', '2')).toBe('42');
  });

  it('replaces a lone leading zero', () => {
    expect(applyKey('0', '5')).toBe('5');
    expect(applyKey('0', '.')).toBe('0.');
  });

  it('starts a decimal from nothing as 0.', () => {
    expect(applyKey('', '.')).toBe('0.');
  });

  it('allows only one decimal point', () => {
    expect(applyKey('12.5', '.')).toBe('12.5');
    expect(applyKey('12.', '.')).toBe('12.');
  });

  it('stops at two decimal places', () => {
    expect(applyKey('12.34', '5')).toBe('12.34');
    expect(applyKey('12.3', '4')).toBe('12.34');
  });

  it('caps the whole-number length', () => {
    expect(applyKey('1234567', '8')).toBe('1234567');
    expect(applyKey('123456', '7')).toBe('1234567');
  });

  it('deletes the last character', () => {
    expect(applyKey('12.34', 'delete')).toBe('12.3');
    expect(applyKey('1', 'delete')).toBe('');
    expect(applyKey('', 'delete')).toBe('');
  });

  it('produces strings parseAmountInput can read', () => {
    let value = '';
    for (const key of ['4', '2', '.', '5', '0']) value = applyKey(value, key);
    expect(value).toBe('42.50');
    expect(Number(value)).toBe(42.5);
  });
});

describe('displayAmount', () => {
  it('shows a zero placeholder before anything is typed', () => {
    expect(displayAmount('')).toBe('0');
    expect(displayAmount('12.3')).toBe('12.3');
  });
});
