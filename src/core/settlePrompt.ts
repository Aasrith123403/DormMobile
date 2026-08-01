/**
 * When to gently suggest settling up. Pure, and reads only figures the app
 * already computes.
 *
 * This never sends anything. It decides whether a card is worth showing in
 * the UI the user is already looking at — so the cost of being wrong is a
 * dismissible card, not an interruption. That is why the thresholds are
 * deliberately generous: a prompt that appears over every $3 imbalance is
 * noise, and noise is what people learn to ignore.
 */

export type SettlePromptReason = 'threshold' | 'new-month' | null;

export interface SettlePromptInput {
  /** The viewer's net position, in cents. Negative means they owe. */
  myNetCents: number;
  /** Today, as YYYY-MM-DD. */
  today: string;
  /**
   * The most recent settlement in this group, as an ISO timestamp, or null if
   * the group has never settled.
   */
  lastSettledAt: string | null;
  /** Whether there is anything to settle at all. */
  hasOutstanding: boolean;
}

export interface SettlePromptResult {
  show: boolean;
  reason: SettlePromptReason;
  /** Ready to render; empty when nothing is being suggested. */
  headline: string;
  detail: string;
}

/** Balances below this are not worth a prompt. */
export const SETTLE_THRESHOLD_CENTS = 2500;

/** Days into a new month during which the monthly nudge is relevant. */
export const NEW_MONTH_WINDOW_DAYS = 5;

const EMPTY: SettlePromptResult = { show: false, reason: null, headline: '', detail: '' };

function dayOfMonth(today: string): number {
  return Number(today.split('-')[2] ?? 0);
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Two moments are worth surfacing:
 *
 *   1. The balance has grown past the point where people start to feel it.
 *   2. A new month has just begun and the group has not settled in it — the
 *      natural "clean slate" moment, and the one people already think in.
 *
 * Anything else stays quiet.
 */
export function evaluateSettlePrompt(input: SettlePromptInput): SettlePromptResult {
  const { myNetCents, today, lastSettledAt, hasOutstanding } = input;

  if (!hasOutstanding) return EMPTY;

  const magnitude = Math.abs(myNetCents);
  const owed = myNetCents < 0;
  const amount = `$${(magnitude / 100).toFixed(2)}`;

  if (magnitude >= SETTLE_THRESHOLD_CENTS) {
    return {
      show: true,
      reason: 'threshold',
      headline: owed ? `You owe ${amount}` : `You're owed ${amount}`,
      detail: owed
        ? 'Worth clearing before it grows.'
        : 'A nudge-free reminder — settle whenever suits.',
    };
  }

  // Early in a new month, if nothing has been settled since the month turned.
  const settledThisMonth = lastSettledAt ? monthOf(lastSettledAt) === monthOf(today) : false;

  if (!settledThisMonth && dayOfMonth(today) <= NEW_MONTH_WINDOW_DAYS && magnitude > 0) {
    return {
      show: true,
      reason: 'new-month',
      headline: 'New month, old balances',
      detail: owed
        ? `You owe ${amount} from last month.`
        : `You're owed ${amount} from last month.`,
    };
  }

  return EMPTY;
}
