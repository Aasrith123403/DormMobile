/**
 * Month-end spend summary. Pure output — nobody enters anything, every figure
 * is read back off expenses the group already logged.
 *
 * Distinct from `insights.ts`, which answers "how are we spending" for an
 * arbitrary range. This answers one fixed question — "what did last month
 * cost us" — in the shape the summary screen and the feed both need.
 */

import { CategoryTotal, summarizeByCategory } from './categories';
import { payersOf } from './balances';

export interface SummaryExpense {
  amountCents: number;
  paidBy: string;
  category?: string | null;
  /** ISO timestamp. */
  createdAt: string;
  splits: { userId: string; shareCents: number }[];
  payers?: { userId: string; paidCents: number }[];
}

export interface PersonSpend {
  userId: string;
  /** What they put on their own card. */
  paidCents: number;
  /** Their share of the month — what they actually consumed. */
  shareCents: number;
}

export interface MonthSummary {
  /** `2026-07`. */
  month: string;
  label: string;
  totalCents: number;
  expenseCount: number;
  /** Largest first. */
  byCategory: CategoryTotal[];
  /** Largest share first. */
  byPerson: PersonSpend[];
  /** Change against the previous month, in cents. Null with no prior month. */
  changeVsPreviousCents: number | null;
  /** Whether anything was logged at all. */
  isEmpty: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-07` for a timestamp, in the viewer's local calendar. */
export function monthKeyOf(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1] ?? '?'} ${year}`;
}

/** The month key for the calendar month before the given one. */
export function previousMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Everything the summary screen shows for one calendar month.
 *
 * "Paid" and "share" are kept apart deliberately: the person who fronted the
 * rent did not consume it, and conflating the two is the classic way a
 * shared-expense app tells someone a number that feels wrong.
 */
export function summarizeMonth(
  expenses: SummaryExpense[],
  month: string,
  memberIds: string[] = []
): MonthSummary {
  const inMonth = expenses.filter((expense) => monthKeyOf(expense.createdAt) === month);
  const inPrevious = expenses.filter(
    (expense) => monthKeyOf(expense.createdAt) === previousMonthKey(month)
  );

  const totalCents = inMonth.reduce((sum, expense) => sum + expense.amountCents, 0);
  const previousTotal = inPrevious.reduce((sum, expense) => sum + expense.amountCents, 0);

  const paid = new Map<string, number>();
  const share = new Map<string, number>();

  for (const expense of inMonth) {
    for (const payer of payersOf(expense)) {
      paid.set(payer.userId, (paid.get(payer.userId) ?? 0) + payer.paidCents);
    }
    for (const split of expense.splits) {
      share.set(split.userId, (share.get(split.userId) ?? 0) + split.shareCents);
    }
  }

  const ids = new Set<string>([...memberIds, ...paid.keys(), ...share.keys()]);

  const byPerson: PersonSpend[] = [...ids]
    .map((userId) => ({
      userId,
      paidCents: paid.get(userId) ?? 0,
      shareCents: share.get(userId) ?? 0,
    }))
    .sort((a, b) => b.shareCents - a.shareCents || a.userId.localeCompare(b.userId));

  return {
    month,
    label: monthLabel(month),
    totalCents,
    expenseCount: inMonth.length,
    byCategory: summarizeByCategory(inMonth),
    byPerson,
    changeVsPreviousCents: inPrevious.length === 0 ? null : totalCents - previousTotal,
    isEmpty: inMonth.length === 0,
  };
}

/** Every month that has any activity, newest first — for a month picker. */
export function monthsWithActivity(expenses: SummaryExpense[]): string[] {
  const keys = new Set(expenses.map((expense) => monthKeyOf(expense.createdAt)));
  return [...keys].sort((a, b) => b.localeCompare(a));
}

/** One-line glance for the home screen: "$312 this month". */
export function glanceLine(summary: MonthSummary): string {
  const amount = `$${(summary.totalCents / 100).toFixed(2)}`;
  if (summary.isEmpty) return 'Nothing logged this month';

  const top = summary.byCategory[0];
  return top ? `${amount} this month · mostly ${top.category.label}` : `${amount} this month`;
}
