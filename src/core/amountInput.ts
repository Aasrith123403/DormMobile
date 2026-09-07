export function applyKey(current: string, key: string): string {
  if (key === 'delete') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }

  const [whole, fraction] = current.split('.');
  if (fraction !== undefined && fraction.length >= 2) return current;
  if (fraction === undefined && whole.length >= 7) return current;
  if (current === '0') return key;
  return current + key;
}

export function displayAmount(raw: string): string {
  return raw === '' ? '0' : raw;
}
