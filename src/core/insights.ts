/**
 * Spending insights. Pure, so every number on the Insights screen is
 * reproducible in a unit test rather than assembled inline in a component.
 *
 * Everything here describes *spending* (what the group bought), which is a
 * different question from *balances* (who owes whom). Keeping them apart
 * avoids the classic shared-expense bug of showing someone a "you spent"
 * figure that is really their unsettled debt.
 */

import { CategoryTotal, summarizeByCategory } from './categories';

export interface InsightExpense {
  amountCents: number;
  paidBy: string;
  category?: string | null;
  /** ISO timestamp. */
  createdAt: string;
  splits: { userId: string; shareCents: number }[];
}

export interface MemberSpend {
  userId: string;
  /** What they put on their own card. */
  paidCents: number;
  /** Their share of everything, i.e. what they actually consumed. */
  shareCents: number;
}

export interface GroupInsights {
  totalCents: number;
  expenseCount: number;
  /** Mean expense size; 0 when there is nothing logged. */
  averageCents: number;
  largest: InsightExpense | null;
  byCategory: CategoryTotal[];
  byMember: MemberSpend[];
  /** Your own share across the period. */
  yourShareCents: number;
  /** Oldest-first, for a simple bar chart. */
  monthly: { month: string; totalCents: number }[];
}

/** `2026-07` for an ISO timestamp, in the viewer's local calendar. */
export function monthKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "Jul 2026" for display. */
export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[month - 1] ?? '?'} ${year}`;
}

export type InsightRange = 'month' | 'all';

/** Filters to the current calendar month, or passes everything through. */
export function filterByRange(
  expenses: InsightExpense[],
  range: InsightRange,
  now: Date = new Date()
): InsightExpense[] {
  if (range === 'all') return expenses;

  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return expenses.filter((expense) => monthKey(expense.createdAt) === current);
}

export function computeInsights(
  expenses: InsightExpense[],
  viewerId: string | null,
  memberIds: string[] = []
): GroupInsights {
  const totalCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  const paid = new Map<string, number>();
  const share = new Map<string, number>();

  for (const expense of expenses) {
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + expense.amountCents);
    for (const split of expense.splits) {
      share.set(split.userId, (share.get(split.userId) ?? 0) + split.shareCents);
    }
  }

  const ids = new Set<string>([...memberIds, ...paid.keys(), ...share.keys()]);

  const byMember: MemberSpend[] = [...ids]
    .map((userId) => ({
      userId,
      paidCents: paid.get(userId) ?? 0,
      shareCents: share.get(userId) ?? 0,
    }))
    .sort((a, b) => b.shareCents - a.shareCents || a.userId.localeCompare(b.userId));

  const largest = expenses.reduce<InsightExpense | null>(
    (biggest, expense) => (!biggest || expense.amountCents > biggest.amountCents ? expense : biggest),
    null
  );

  const monthTotals = new Map<string, number>();
  for (const expense of expenses) {
    const key = monthKey(expense.createdAt);
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + expense.amountCents);
  }

  return {
    totalCents,
    expenseCount: expenses.length,
    averageCents: expenses.length === 0 ? 0 : Math.round(totalCents / expenses.length),
    largest,
    byCategory: summarizeByCategory(expenses),
    byMember,
    yourShareCents: viewerId ? (share.get(viewerId) ?? 0) : 0,
    monthly: [...monthTotals.entries()]
      .map(([month, cents]) => ({ month, totalCents: cents }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/**
 * Recent expenses collapsed into repeatable templates, most-used first.
 *
 * This is what powers one-tap logging: "Groceries, $42.10" as a chip you
 * press instead of retyping. Amount comes from the most recent occurrence,
 * since prices drift, while the ranking uses how often it appears.
 */
export interface QuickTemplate {
  description: string;
  amountCents: number;
  category: string | null;
  uses: number;
}

export function suggestTemplates(
  expenses: { description: string; amountCents: number; category?: string | null; createdAt: string }[],
  limit = 4
): QuickTemplate[] {
  const groups = new Map<string, QuickTemplate & { latest: string }>();

  for (const expense of expenses) {
    const key = expense.description.trim().toLowerCase();
    if (!key) continue;

    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        description: expense.description.trim(),
        amountCents: expense.amountCents,
        category: expense.category ?? null,
        uses: 1,
        latest: expense.createdAt,
      });
      continue;
    }

    existing.uses += 1;
    if (expense.createdAt > existing.latest) {
      existing.latest = expense.createdAt;
      existing.amountCents = expense.amountCents;
      existing.category = expense.category ?? null;
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.uses - a.uses || b.latest.localeCompare(a.latest))
    .slice(0, limit)
    .map(({ description, amountCents, category, uses }) => ({
      description,
      amountCents,
      category,
      uses,
    }));
}
