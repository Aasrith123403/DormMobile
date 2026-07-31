/**
 * Keypad input rules. Pure, so the typing behaviour (decimal handling,
 * length caps, delete) is unit tested without mounting a component.
 */

/** Applies one keypress to the current digit string. */
export function applyKey(current: string, key: string): string {
  if (key === 'delete') return current.slice(0, -1);

  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }

  // Block a third decimal place and silly-long amounts.
  const [whole, fraction] = current.split('.');
  if (fraction !== undefined && fraction.length >= 2) return current;
  if (fraction === undefined && whole.length >= 7) return current;

  // Avoid leading zeros like "007".
  if (current === '0') return key;

  return current + key;
}

/** Placeholder shown before anything has been typed. */
export function displayAmount(raw: string): string {
  return raw === '' ? '0' : raw;
}
