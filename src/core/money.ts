export function toCents(amount: number | string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatMoney(cents: number, opts: { signed?: boolean } = {}): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : opts.signed && rounded > 0 ? '+' : '';
  const abs = Math.abs(rounded);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function parseAmountInput(input: string): number | null {
  if (input == null) return null;
  const cleaned = input.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
