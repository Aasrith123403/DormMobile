import {
  ChoreFrequency,
  countPurchases,
  describeDue,
  isOverdue,
  nextChoreTurn,
  nextDueDate,
  nextSupplyBuyer,
  nextTurn,
  reconcileTurn,
} from '../rotation';

describe('nextTurn', () => {
  const members = ['ana', 'ben', 'cass'];

  it('moves to the following member', () => {
    expect(nextTurn(members, 'ana')).toBe('ben');
    expect(nextTurn(members, 'ben')).toBe('cass');
  });

  it('wraps around at the end of the list', () => {
    expect(nextTurn(members, 'cass')).toBe('ana');
  });

  it('starts the rotation when nobody has gone yet', () => {
    expect(nextTurn(members, null)).toBe('ana');
  });

  it('falls back to the first member for an unknown actor', () => {
    expect(nextTurn(members, 'stranger')).toBe('ana');
  });

  it('handles a one-person group and an empty group', () => {
    expect(nextTurn(['solo'], 'solo')).toBe('solo');
    expect(nextTurn([], 'ana')).toBeNull();
  });
});

describe('reconcileTurn', () => {
  it('keeps the turn when the member is still around', () => {
    expect(reconcileTurn(['ana', 'ben'], ['ana', 'ben'], 'ben')).toBe('ben');
  });

  it('passes the turn on when the holder has left', () => {
    expect(reconcileTurn(['ana', 'ben', 'cass'], ['ana', 'cass'], 'ben')).toBe('cass');
  });

  it('wraps when the departed member was last', () => {
    expect(reconcileTurn(['ana', 'ben', 'cass'], ['ana', 'ben'], 'cass')).toBe('ana');
  });

  it('seeds the turn for a group that never had one', () => {
    expect(reconcileTurn([], ['ana', 'ben'], null)).toBe('ana');
  });

  it('returns null once the group is empty', () => {
    expect(reconcileTurn(['ana'], [], 'ana')).toBeNull();
  });
});

describe('nextSupplyBuyer', () => {
  const members = ['ana', 'ben', 'cass'];

  it('never picks the person who bought this item last', () => {
    const next = nextSupplyBuyer({
      memberIds: members,
      lastBoughtBy: 'ana',
      purchaseCounts: { ana: 0, ben: 5, cass: 5 },
    });

    expect(next).not.toBe('ana');
  });

  it('picks whoever has bought the least overall', () => {
    expect(
      nextSupplyBuyer({
        memberIds: members,
        lastBoughtBy: 'ana',
        purchaseCounts: { ana: 1, ben: 4, cass: 2 },
      })
    ).toBe('cass');
  });

  it('breaks ties on roster order, so every device agrees', () => {
    expect(
      nextSupplyBuyer({
        memberIds: members,
        lastBoughtBy: 'cass',
        purchaseCounts: { ana: 2, ben: 2, cass: 0 },
      })
    ).toBe('ana');
  });

  it('starts with the first member when nobody has bought it yet', () => {
    expect(
      nextSupplyBuyer({ memberIds: members, lastBoughtBy: null, purchaseCounts: {} })
    ).toBe('ana');
  });

  it('treats a member with no recorded purchases as zero', () => {
    expect(
      nextSupplyBuyer({
        memberIds: members,
        lastBoughtBy: 'ana',
        purchaseCounts: { ana: 3, ben: 3 },
      })
    ).toBe('cass');
  });

  it('still names the last buyer when they are the only member', () => {
    expect(
      nextSupplyBuyer({ memberIds: ['solo'], lastBoughtBy: 'solo', purchaseCounts: { solo: 9 } })
    ).toBe('solo');
  });

  it('ignores a last buyer who has since left the group', () => {
    expect(
      nextSupplyBuyer({
        memberIds: ['ana', 'ben'],
        lastBoughtBy: 'departed',
        purchaseCounts: { ana: 1, ben: 0 },
      })
    ).toBe('ben');
  });

  it('returns null for an empty group', () => {
    expect(
      nextSupplyBuyer({ memberIds: [], lastBoughtBy: null, purchaseCounts: {} })
    ).toBeNull();
  });

  it('spreads the load evenly when the same item is bought repeatedly', () => {
    // Simulate ten runs, always following the app's answer.
    let last: string | null = null;
    const counts: Record<string, number> = {};

    for (let i = 0; i < 9; i += 1) {
      const buyer: string = nextSupplyBuyer({
        memberIds: members,
        lastBoughtBy: last,
        purchaseCounts: counts,
      })!;
      counts[buyer] = (counts[buyer] ?? 0) + 1;
      last = buyer;
    }

    // Nine runs across three people should land three each.
    expect(members.map((m) => counts[m])).toEqual([3, 3, 3]);
  });

  it('lets a lagging member catch up rather than strictly alternating', () => {
    // Cass joined late and has bought nothing; they should come up next even
    // though Ben is "next in line" by roster order.
    expect(
      nextSupplyBuyer({
        memberIds: members,
        lastBoughtBy: 'ana',
        purchaseCounts: { ana: 6, ben: 6, cass: 0 },
      })
    ).toBe('cass');
  });
});

describe('countPurchases', () => {
  it('tallies per member', () => {
    expect(
      countPurchases([{ userId: 'ana' }, { userId: 'ben' }, { userId: 'ana' }])
    ).toEqual({ ana: 2, ben: 1 });
  });

  it('ignores purchases with no recorded buyer', () => {
    expect(countPurchases([{ userId: null }, { userId: 'ana' }])).toEqual({ ana: 1 });
  });

  it('returns an empty tally for no purchases', () => {
    expect(countPurchases([])).toEqual({});
  });
});

describe('nextChoreTurn', () => {
  it('uses the same fairness rule as supplies', () => {
    expect(
      nextChoreTurn({
        memberIds: ['ana', 'ben', 'cass'],
        lastCompletedBy: 'ana',
        completionCounts: { ana: 1, ben: 3, cass: 1 },
      })
    ).toBe('cass');
  });

  it('starts at the front for a brand new chore', () => {
    expect(
      nextChoreTurn({ memberIds: ['ana', 'ben'], lastCompletedBy: null, completionCounts: {} })
    ).toBe('ana');
  });
});

describe('nextDueDate', () => {
  const cases: [ChoreFrequency, string][] = [
    ['daily', '2026-07-29'],
    ['weekly', '2026-08-04'],
    ['biweekly', '2026-08-11'],
    ['monthly', '2026-08-27'],
  ];

  it.each(cases)('advances a %s chore correctly', (frequency, expected) => {
    expect(nextDueDate(frequency, '2026-07-28')).toBe(expected);
  });

  it('crosses month and year boundaries', () => {
    expect(nextDueDate('weekly', '2026-12-30')).toBe('2027-01-06');
  });
});

describe('describeDue', () => {
  it('calls out overdue chores plainly', () => {
    expect(describeDue('2026-07-27', '2026-07-28')).toBe('1 day overdue');
    expect(describeDue('2026-07-24', '2026-07-28')).toBe('4 days overdue');
  });

  it('stays quiet for everything else', () => {
    expect(describeDue('2026-07-28', '2026-07-28')).toBe('Due today');
    expect(describeDue('2026-07-29', '2026-07-28')).toBe('Due tomorrow');
    expect(describeDue('2026-08-02', '2026-07-28')).toBe('Due in 5 days');
  });
});

describe('isOverdue', () => {
  it('is true only strictly before today', () => {
    expect(isOverdue('2026-07-27', '2026-07-28')).toBe(true);
    expect(isOverdue('2026-07-28', '2026-07-28')).toBe(false);
    expect(isOverdue('2026-07-29', '2026-07-28')).toBe(false);
  });
});
