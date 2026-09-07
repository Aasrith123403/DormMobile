export type SettlePromptReason = 'threshold' | 'new-month' | null;

export interface SettlePromptInput {
  myNetCents: number;
  today: string;
  lastSettledAt: string | null;
  hasOutstanding: boolean;
}

export interface SettlePromptResult {
  show: boolean;
  reason: SettlePromptReason;
  headline: string;
  detail: string;
}

export const SETTLE_THRESHOLD_CENTS = 2500;

export const NEW_MONTH_WINDOW_DAYS = 5;

const EMPTY: SettlePromptResult = { show: false, reason: null, headline: '', detail: '' };

function dayOfMonth(today: string): number {
  return Number(today.split('-')[2] ?? 0);
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

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
