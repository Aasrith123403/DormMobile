import {
  SummaryExpense,
  currentMonthKey,
  glanceLine,
  monthKeyOf,
  monthLabel,
  monthsWithActivity,
  previousMonthKey,
  summarizeMonth,
} from '../spendSummary';

const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).toISOString();

const expense = (
  amountCents: number,
  paidBy: string,
  among: string[],
  createdAt: string,
  category: string | null = null
): SummaryExpense => ({
  amountCents,
  paidBy,
  createdAt,
  category,
  splits: among.map((userId) => ({ userId, shareCents: Math.round(amountCents / among.length) })),
});

describe('month key helpers', () => {
  it('derives the key from the local calendar', () => {
    expect(monthKeyOf(at(2026, 7, 15))).toBe('2026-07');
  });

  it('formats a label', () => {
    expect(monthLabel('2026-07')).toBe('Jul 2026');
    expect(monthLabel('2026-01')).toBe('Jan 2026');
  });

  it('steps back a month, including across a year boundary', () => {
    expect(previousMonthKey('2026-07')).toBe('2026-06');
    expect(previousMonthKey('2026-01')).toBe('2025-12');
  });

  it('reports the current month', () => {
    expect(currentMonthKey(new Date(2026, 6, 28))).toBe('2026-07');
  });
});

describe('summarizeMonth', () => {
  const july = [
    expense(4000, 'ana', ['ana', 'ben'], at(2026, 7, 3), 'groceries'),
    expense(2000, 'ben', ['ana', 'ben'], at(2026, 7, 10), 'dining'),
    expense(6000, 'ana', ['ana', 'ben'], at(2026, 7, 20), 'groceries'),
  ];
  const june = [expense(3000, 'ana', ['ana', 'ben'], at(2026, 6, 5), 'groceries')];

  it('totals only the requested month', () => {
    const summary = summarizeMonth([...july, ...june], '2026-07');
    expect(summary.totalCents).toBe(12_000);
    expect(summary.expenseCount).toBe(3);
  });

  it('ranks categories largest first', () => {
    const summary = summarizeMonth(july, '2026-07');
    expect(summary.byCategory[0].category.id).toBe('groceries');
    expect(summary.byCategory[0].totalCents).toBe(10_000);
  });

  it('keeps what someone paid separate from what they consumed', () => {
    const summary = summarizeMonth(july, '2026-07');
    const ana = summary.byPerson.find((p) => p.userId === 'ana')!;

    expect(ana.paidCents).toBe(10_000);
    expect(ana.shareCents).toBe(6000);
  });

  it('credits each contributor on a multi-payer expense', () => {
    const summary = summarizeMonth(
      [
        {
          amountCents: 6000,
          paidBy: 'ana',
          createdAt: at(2026, 7, 4),
          category: 'household',
          splits: [
            { userId: 'ana', shareCents: 3000 },
            { userId: 'ben', shareCents: 3000 },
          ],
          payers: [
            { userId: 'ana', paidCents: 4000 },
            { userId: 'ben', paidCents: 2000 },
          ],
        },
      ],
      '2026-07'
    );

    expect(summary.byPerson.find((p) => p.userId === 'ana')!.paidCents).toBe(4000);
    expect(summary.byPerson.find((p) => p.userId === 'ben')!.paidCents).toBe(2000);
  });

  it('compares against the previous month', () => {
    const summary = summarizeMonth([...july, ...june], '2026-07');
    expect(summary.changeVsPreviousCents).toBe(12_000 - 3000);
  });

  it('reports no comparison when there is no prior month', () => {
    expect(summarizeMonth(july, '2026-07').changeVsPreviousCents).toBeNull();
  });

  it('includes members with no activity so the roster is complete', () => {
    const summary = summarizeMonth(july, '2026-07', ['ana', 'ben', 'cass']);
    expect(summary.byPerson.find((p) => p.userId === 'cass')).toEqual({
      userId: 'cass',
      paidCents: 0,
      shareCents: 0,
    });
  });

  it('handles an empty month without dividing by zero', () => {
    const summary = summarizeMonth([], '2026-07');
    expect(summary.isEmpty).toBe(true);
    expect(summary.totalCents).toBe(0);
    expect(summary.byCategory).toEqual([]);
    expect(summary.changeVsPreviousCents).toBeNull();
  });

  it('preserves the total across the category breakdown', () => {
    const summary = summarizeMonth(july, '2026-07');
    const summed = summary.byCategory.reduce((total, row) => total + row.totalCents, 0);
    expect(summed).toBe(summary.totalCents);
  });
});

describe('monthsWithActivity', () => {
  it('lists distinct months, newest first', () => {
    const months = monthsWithActivity([
      expense(100, 'ana', ['ana'], at(2026, 5, 1)),
      expense(100, 'ana', ['ana'], at(2026, 7, 1)),
      expense(100, 'ana', ['ana'], at(2026, 7, 20)),
    ]);

    expect(months).toEqual(['2026-07', '2026-05']);
  });

  it('is empty for no expenses', () => {
    expect(monthsWithActivity([])).toEqual([]);
  });
});

describe('glanceLine', () => {
  it('names the biggest category', () => {
    const summary = summarizeMonth(
      [expense(31_200, 'ana', ['ana'], at(2026, 7, 4), 'groceries')],
      '2026-07'
    );
    expect(glanceLine(summary)).toBe('$312.00 this month · mostly Groceries');
  });

  it('says so when nothing was logged', () => {
    expect(glanceLine(summarizeMonth([], '2026-07'))).toBe('Nothing logged this month');
  });
});
