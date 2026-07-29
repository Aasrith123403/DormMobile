import { computeSplits, evenSplit, seedCustomShares, sumShares, SplitParticipant } from '../splits';

const participants = (ids: string[], included = true): SplitParticipant[] =>
  ids.map((userId) => ({ userId, included }));

describe('evenSplit', () => {
  it('divides an amount that splits cleanly', () => {
    expect(evenSplit(3000, ['a', 'b', 'c'])).toEqual([
      { userId: 'a', shareCents: 1000 },
      { userId: 'b', shareCents: 1000 },
      { userId: 'c', shareCents: 1000 },
    ]);
  });

  it('gives leftover cents to the earliest members', () => {
    // $10.00 across 3 people = 333.33...; the extra cent goes to the first.
    expect(evenSplit(1000, ['a', 'b', 'c'])).toEqual([
      { userId: 'a', shareCents: 334 },
      { userId: 'b', shareCents: 333 },
      { userId: 'c', shareCents: 333 },
    ]);
  });

  it('always sums back to the original total', () => {
    for (let total = 1; total <= 500; total += 1) {
      for (let n = 1; n <= 7; n += 1) {
        const ids = Array.from({ length: n }, (_, i) => `user-${i}`);
        expect(sumShares(evenSplit(total, ids))).toBe(total);
      }
    }
  });

  it('handles a single member and an empty group', () => {
    expect(evenSplit(1234, ['solo'])).toEqual([{ userId: 'solo', shareCents: 1234 }]);
    expect(evenSplit(1234, [])).toEqual([]);
  });
});

describe('computeSplits — even mode', () => {
  it('splits across included members only', () => {
    const result = computeSplits(
      900,
      [
        { userId: 'a', included: true },
        { userId: 'b', included: false },
        { userId: 'c', included: true },
      ],
      'even'
    );

    expect(result.valid).toBe(true);
    expect(result.lines).toEqual([
      { userId: 'a', shareCents: 450 },
      { userId: 'c', shareCents: 450 },
    ]);
  });

  it('rejects an empty participant set', () => {
    const result = computeSplits(900, participants(['a', 'b'], false), 'even');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least one person/i);
  });

  it('rejects a zero or negative total', () => {
    expect(computeSplits(0, participants(['a']), 'even').valid).toBe(false);
    expect(computeSplits(-500, participants(['a']), 'even').valid).toBe(false);
  });
});

describe('computeSplits — custom mode', () => {
  it('accepts custom shares that sum to the total', () => {
    const result = computeSplits(
      1000,
      [
        { userId: 'a', included: true, customCents: 700 },
        { userId: 'b', included: true, customCents: 300 },
      ],
      'custom'
    );

    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
    expect(sumShares(result.lines)).toBe(1000);
  });

  it('reports the shortfall when shares are under the total', () => {
    const result = computeSplits(
      1000,
      [
        { userId: 'a', included: true, customCents: 400 },
        { userId: 'b', included: true, customCents: 300 },
      ],
      'custom'
    );

    expect(result.valid).toBe(false);
    expect(result.differenceCents).toBe(-300);
    expect(result.error).toMatch(/under the total by \$3\.00/);
  });

  it('reports the excess when shares are over the total', () => {
    const result = computeSplits(
      1000,
      [
        { userId: 'a', included: true, customCents: 800 },
        { userId: 'b', included: true, customCents: 450 },
      ],
      'custom'
    );

    expect(result.valid).toBe(false);
    expect(result.differenceCents).toBe(250);
    expect(result.error).toMatch(/over the total by \$2\.50/);
  });

  it('ignores excluded members even if they carry a stale custom amount', () => {
    const result = computeSplits(
      1000,
      [
        { userId: 'a', included: true, customCents: 1000 },
        { userId: 'b', included: false, customCents: 500 },
      ],
      'custom'
    );

    expect(result.valid).toBe(true);
    expect(result.lines).toHaveLength(1);
  });

  it('rejects negative shares', () => {
    const result = computeSplits(
      1000,
      [
        { userId: 'a', included: true, customCents: 1200 },
        { userId: 'b', included: true, customCents: -200 },
      ],
      'custom'
    );

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/negative/i);
  });
});

describe('seedCustomShares', () => {
  it('seeds a valid custom state from the even split', () => {
    const seeded = seedCustomShares(1000, [
      { userId: 'a', included: true },
      { userId: 'b', included: true },
      { userId: 'c', included: false },
    ]);

    expect(seeded.map((p) => p.customCents)).toEqual([500, 500, 0]);
    expect(computeSplits(1000, seeded, 'custom').valid).toBe(true);
  });
});
