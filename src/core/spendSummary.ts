import { CategoryTotal, summarizeByCategory } from './categories';
import { payersOf } from './balances';

export interface SummaryExpense {
  amountCents: number;
  paidBy: string;
  category?: string | null;
  createdAt: string;
  splits: { userId: string; shareCents: number }[];
  payers?: { userId: string; paidCents: number }[];
}

export interface PersonSpend {
  userId: string;
  paidCents: number;
  shareCents: number;
}

export interface MonthSummary {
  month: string;
  label: string;
  totalCents: number;
  expenseCount: number;
  byCategory: CategoryTotal[];
  byPerson: PersonSpend[];
  changeVsPreviousCents: number | null;
  isEmpty: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthKeyOf(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1] ?? '?'} ${year}`;
}

export function previousMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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

export function monthsWithActivity(expenses: SummaryExpense[]): string[] {
  const keys = new Set(expenses.map((expense) => monthKeyOf(expense.createdAt)));
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function glanceLine(summary: MonthSummary): string {
  const amount = `$${(summary.totalCents / 100).toFixed(2)}`;
  if (summary.isEmpty) return 'Nothing logged this month';
  const top = summary.byCategory[0];
  return top ? `${amount} this month · mostly ${top.category.label}` : `${amount} this month`;
}
