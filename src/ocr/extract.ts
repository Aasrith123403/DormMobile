/**
 * Turns raw OCR text into a merchant + amount guess. Kept separate from the
 * OCR provider itself so the messy heuristics are pure and unit-testable
 * without an API key or a camera.
 *
 * Everything here is a suggestion — the user always sees the values in the
 * expense form and can correct them before saving.
 */

export interface ReceiptFields {
  /** Best guess at the grand total, in cents. Null when nothing looked like one. */
  amountCents: number | null;
  /** Best guess at the merchant name, used as the expense description. */
  merchant: string | null;
  /** 0-1. Below ~0.5 the UI nudges the user to double-check. */
  confidence: number;
}

/** Matches 12, 12.34, 1,234.56 — optionally preceded by a currency symbol. */
const AMOUNT_PATTERN = /(?:[$£€]\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?\b/g;

const TOTAL_LABELS = /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total)\b/i;
const NOT_TOTAL_LABELS = /\b(sub\s*-?\s*total|subtotal|tax|tip|change|cash|tender|savings|discount|points|balance\s*remaining)\b/i;

const MERCHANT_NOISE =
  /\b(receipt|invoice|order|store|tel|phone|www|http|customer|copy|thank|welcome|address|street|ave|road|suite|open|closed|cashier|register|terminal|merchant\s*id)\b/i;

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** All currency-looking amounts on a line, in cents, in reading order. */
export function amountsInLine(line: string): number[] {
  const found: number[] = [];
  AMOUNT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = AMOUNT_PATTERN.exec(line)) !== null) {
    const whole = Number(match[1].replace(/,/g, ''));
    const fraction = match[2] ? Number(match[2]) : 0;
    if (!Number.isFinite(whole)) continue;
    found.push(whole * 100 + fraction);
  }

  return found;
}

/**
 * Finds the grand total. Prefers a line explicitly labelled "total" (ignoring
 * subtotal/tax/tip lines), and falls back to the largest amount on the
 * receipt, which on a well-formed receipt is the total anyway.
 */
export function extractAmountCents(text: string): { amountCents: number | null; confidence: number } {
  const lines = toLines(text);

  // Walk bottom-up: the grand total is nearly always the last total-ish line.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!TOTAL_LABELS.test(line) || NOT_TOTAL_LABELS.test(line)) continue;

    const onLine = amountsInLine(line.replace(TOTAL_LABELS, ' '));
    if (onLine.length > 0) {
      return { amountCents: Math.max(...onLine), confidence: 0.9 };
    }

    // "TOTAL" alone on its own line, value on the next one.
    const next = lines[i + 1];
    if (next) {
      const onNext = amountsInLine(next);
      if (onNext.length > 0) return { amountCents: Math.max(...onNext), confidence: 0.75 };
    }
  }

  const all = lines.flatMap((line) => (NOT_TOTAL_LABELS.test(line) ? [] : amountsInLine(line)));
  // Bare integers are usually quantities or dates, so only trust amounts that
  // actually had cents when we are guessing without a label.
  const withCents = lines.flatMap((line) =>
    NOT_TOTAL_LABELS.test(line) ? [] : amountsInLine(line).filter((c) => c % 100 !== 0 || /[.,]\d{2}/.test(line))
  );

  const pool = withCents.length > 0 ? withCents : all;
  if (pool.length === 0) return { amountCents: null, confidence: 0 };

  return { amountCents: Math.max(...pool), confidence: 0.45 };
}

/**
 * Merchant name: the first substantial line of text near the top that is not
 * an address, a phone number, or a pile of digits.
 */
export function extractMerchant(text: string): string | null {
  const lines = toLines(text).slice(0, 8);

  for (const line of lines) {
    const letters = line.replace(/[^A-Za-z]/g, '');
    if (letters.length < 3) continue;
    if (MERCHANT_NOISE.test(line)) continue;
    // Mostly digits -> phone number, date, or a barcode.
    if (letters.length / line.length < 0.5) continue;
    if (amountsInLine(line).length > 0 && letters.length < 6) continue;

    return titleCase(line.replace(/[^A-Za-z0-9 &'.-]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 60);
  }

  return null;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function extractReceiptFields(text: string): ReceiptFields {
  const { amountCents, confidence } = extractAmountCents(text);
  const merchant = extractMerchant(text);

  return {
    amountCents,
    merchant,
    confidence: Math.min(1, confidence + (merchant ? 0.1 : 0)),
  };
}
