/**
 * All arithmetic in RoomLedger happens in integer cents. Dollars only exist at
 * the edges: parsed on the way in, formatted on the way out. This keeps split
 * remainders exact and avoids float drift in balance netting.
 */

/** Rounds a dollar amount (number or numeric string from Postgres) to cents. */
export function toCents(amount: number | string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** "$12.34" / "-$12.34" for display. */
export function formatMoney(cents: number, opts: { signed?: boolean } = {}): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : opts.signed && rounded > 0 ? '+' : '';
  const abs = Math.abs(rounded);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Parses free-typed user input ("12", "12.5", "$1,234.56") into cents.
 * Returns null when the text is not a usable positive-or-zero amount.
 */
export function parseAmountInput(input: string): number | null {
  if (input == null) return null;
  const cleaned = input.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
