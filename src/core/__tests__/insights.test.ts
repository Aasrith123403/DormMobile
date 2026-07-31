import {
  InsightExpense,
  computeInsights,
  filterByRange,
  formatMonth,
  monthKey,
  suggestTemplates,
} from '../insights';

const expense = (
  amountCents: number,
  paidBy: string,
  among: string[],
  createdAt = '2026-07-10T12:00:00.000Z',
  category: string | null = null
): InsightExpense => ({
  amountCents,
  paidBy,
  createdAt,
  category,
  splits: among.map((userId) => ({
    userId,
    shareCents: Math.round(amountCents / among.length),
  })),
});

describe('computeInsights', () => {
  it('totals spending and counts expenses', () => {
    const result = computeInsights(
      [expense(1000, 'ana', ['ana', 'ben']), expense(2000, 'ben', ['ana', 'ben'])],
      'ana'
    );

    expect(result.totalCents).toBe(3000);
    expect(result.expenseCount).toBe(2);
    expect(result.averageCents).toBe(1500);
  });

  it('separates what someone paid from what they consumed', () => {
    // Ana pays for everything but only consumes half.
    const result = computeInsights([expense(4000, 'ana', ['ana', 'ben'])], 'ana');

    const ana = result.byMember.find((m) => m.userId === 'ana')!;
    expect(ana.paidCents).toBe(4000);
    expect(ana.shareCents).toBe(2000);
    expect(result.yourShareCents).toBe(2000);
  });

  it('reports zero for a viewer with no share', () => {
    const result = computeInsights([expense(1000, 'ana', ['ana'])], 'ben');
    expect(result.yourShareCents).toBe(0);
  });

  it('handles no viewer at all', () => {
    expect(computeInsights([expense(1000, 'ana', ['ana'])], null).yourShareCents).toBe(0);
  });

  it('includes members with no activity', () => {
    const result = computeInsights([expense(1000, 'ana', ['ana'])], 'ana', ['ana', 'ben', 'cass']);
    expect(result.byMember).toHaveLength(3);
    expect(result.byMember.find((m) => m.userId === 'cass')).toEqual({
      userId: 'cass',
      paidCents: 0,
      shareCents: 0,
    });
  });

  it('finds the largest expense', () => {
    const result = computeInsights(
      [expense(1000, 'ana', ['ana']), expense(9999, 'ben', ['ben']), expense(50, 'ana', ['ana'])],
      'ana'
    );

    expect(result.largest?.amountCents).toBe(9999);
  });

  it('degrades gracefully on an empty ledger', () => {
    const result = computeInsights([], 'ana');

    expect(result.totalCents).toBe(0);
    expect(result.averageCents).toBe(0);
    expect(result.largest).toBeNull();
    expect(result.byCategory).toEqual([]);
    expect(result.monthly).toEqual([]);
  });

  it('buckets spending by month, oldest first', () => {
    const result = computeInsights(
      [
        expense(1000, 'ana', ['ana'], '2026-07-05T10:00:00.000Z'),
        expense(2000, 'ana', ['ana'], '2026-05-20T10:00:00.000Z'),
        expense(500, 'ana', ['ana'], '2026-07-28T10:00:00.000Z'),
      ],
      'ana'
    );

    expect(result.monthly.map((m) => m.month)).toEqual(['2026-05', '2026-07']);
    expect(result.monthly[1].totalCents).toBe(1500);
  });

  it('groups by category', () => {
    const result = computeInsights(
      [
        expense(1000, 'ana', ['ana'], '2026-07-05T10:00:00.000Z', 'groceries'),
        expense(3000, 'ana', ['ana'], '2026-07-06T10:00:00.000Z', 'dining'),
      ],
      'ana'
    );

    expect(result.byCategory[0].category.id).toBe('dining');
    expect(result.byCategory[0].totalCents).toBe(3000);
  });
});

describe('filterByRange', () => {
  const now = new Date(2026, 6, 28); // July 2026, local time

  it('keeps only the current calendar month', () => {
    const expenses = [
      expense(100, 'ana', ['ana'], new Date(2026, 6, 2, 12).toISOString()),
      expense(200, 'ana', ['ana'], new Date(2026, 5, 30, 12).toISOString()),
    ];

    expect(filterByRange(expenses, 'month', now)).toHaveLength(1);
  });

  it('passes everything through for the all-time range', () => {
    const expenses = [
      expense(100, 'ana', ['ana'], new Date(2020, 0, 1, 12).toISOString()),
      expense(200, 'ana', ['ana'], new Date(2026, 6, 2, 12).toISOString()),
    ];

    expect(filterByRange(expenses, 'all', now)).toHaveLength(2);
  });
});

describe('month helpers', () => {
  it('formats a month key for display', () => {
    expect(formatMonth('2026-07')).toBe('Jul 2026');
    expect(formatMonth('2026-01')).toBe('Jan 2026');
  });

  it('derives the key from the local calendar', () => {
    expect(monthKey(new Date(2026, 6, 15, 9).toISOString())).toBe('2026-07');
  });
});

describe('suggestTemplates', () => {
  const rows = [
    { description: 'Groceries', amountCents: 4210, category: 'groceries', createdAt: '2026-07-20T10:00:00Z' },
    { description: 'groceries', amountCents: 3800, category: 'groceries', createdAt: '2026-07-10T10:00:00Z' },
    { description: 'Pizza', amountCents: 2400, category: 'dining', createdAt: '2026-07-25T10:00:00Z' },
    { description: 'Groceries', amountCents: 3100, category: 'groceries', createdAt: '2026-06-30T10:00:00Z' },
  ];

  it('ranks by how often something is logged', () => {
    const templates = suggestTemplates(rows);
    expect(templates[0].description).toBe('Groceries');
    expect(templates[0].uses).toBe(3);
  });

  it('treats different casing as the same template', () => {
    expect(suggestTemplates(rows)).toHaveLength(2);
  });

  it('uses the most recent amount, since prices drift', () => {
    expect(suggestTemplates(rows)[0].amountCents).toBe(4210);
  });

  it('respects the limit', () => {
    expect(suggestTemplates(rows, 1)).toHaveLength(1);
  });

  it('ignores blank descriptions and empty input', () => {
    expect(suggestTemplates([])).toEqual([]);
    expect(
      suggestTemplates([{ description: '   ', amountCents: 100, category: null, createdAt: '2026-07-01T00:00:00Z' }])
    ).toEqual([]);
  });
});
