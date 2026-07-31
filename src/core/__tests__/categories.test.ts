import {
  CATEGORIES,
  detectCategory,
  getCategory,
  isCategoryId,
  summarizeByCategory,
} from '../categories';

describe('the catalogue', () => {
  it('has unique ids and no missing display fields', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const category of CATEGORIES) {
      expect(category.label).not.toBe('');
      expect(category.icon).not.toBe('');
      expect(category.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(category.softColor).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('always resolves to a real category', () => {
    expect(getCategory('groceries').label).toBe('Groceries');
    expect(getCategory(null).id).toBe('other');
    expect(getCategory('not-a-category').id).toBe('other');
    expect(getCategory(undefined).id).toBe('other');
  });

  it('validates ids', () => {
    expect(isCategoryId('dining')).toBe(true);
    expect(isCategoryId('nope')).toBe(false);
    expect(isCategoryId(null)).toBe(false);
  });
});

describe('detectCategory', () => {
  it('recognises common shop and meal names', () => {
    expect(detectCategory('Trader Joes')).toBe('groceries');
    expect(detectCategory('Chipotle')).toBe('dining');
    expect(detectCategory('Uber to airport')).toBe('transport');
    expect(detectCategory('Netflix')).toBe('entertainment');
    expect(detectCategory('Toilet paper')).toBe('household');
    expect(detectCategory('Internet bill')).toBe('utilities');
    expect(detectCategory('Airbnb for the weekend')).toBe('travel');
  });

  it('is case and spacing insensitive', () => {
    expect(detectCategory('  WHOLE FOODS  ')).toBe('groceries');
    expect(detectCategory('uber eats')).toBe('dining');
  });

  it('prefers the most specific keyword when several match', () => {
    // "uber eats" (dining) is longer and more specific than "uber" (transport).
    expect(detectCategory('Uber Eats dinner')).toBe('dining');
  });

  it('returns null rather than guessing wrong', () => {
    expect(detectCategory('')).toBeNull();
    expect(detectCategory(null)).toBeNull();
    expect(detectCategory(undefined)).toBeNull();
    expect(detectCategory('zxcvbnm')).toBeNull();
  });
});

describe('summarizeByCategory', () => {
  it('totals and ranks categories', () => {
    const result = summarizeByCategory([
      { amountCents: 1000, category: 'groceries' },
      { amountCents: 500, category: 'dining' },
      { amountCents: 2500, category: 'groceries' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].category.id).toBe('groceries');
    expect(result[0].totalCents).toBe(3500);
    expect(result[0].count).toBe(2);
    expect(result[1].category.id).toBe('dining');
  });

  it('files uncategorised spending under Other', () => {
    const result = summarizeByCategory([
      { amountCents: 700, category: null },
      { amountCents: 300 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].category.id).toBe('other');
    expect(result[0].totalCents).toBe(1000);
  });

  it('computes percentages that reflect the totals', () => {
    const result = summarizeByCategory([
      { amountCents: 7500, category: 'groceries' },
      { amountCents: 2500, category: 'dining' },
    ]);

    expect(result[0].percent).toBe(75);
    expect(result[1].percent).toBe(25);
  });

  it('never divides by zero', () => {
    expect(summarizeByCategory([])).toEqual([]);
    expect(summarizeByCategory([{ amountCents: 0, category: 'dining' }])[0].percent).toBe(0);
  });

  it('preserves the grand total across categories', () => {
    const expenses = [
      { amountCents: 1234, category: 'groceries' },
      { amountCents: 99, category: 'dining' },
      { amountCents: 4567, category: 'travel' },
      { amountCents: 1, category: null },
    ];

    const summed = summarizeByCategory(expenses).reduce((total, row) => total + row.totalCents, 0);
    expect(summed).toBe(1234 + 99 + 4567 + 1);
  });
});
