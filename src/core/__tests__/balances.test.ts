import {
  BalanceInput,
  computeBalances,
  minimizeTransfers,
  payersOf,
  settleUpPlan,
  balanceForUser,
  MemberBalance,
} from '../balances';
import { evenSplit } from '../splits';

/** Builds an expense whose splits are an even division across `among`. */
const expense = (paidBy: string, amountCents: number, among: string[]) => ({
  paidBy,
  amountCents,
  splits: evenSplit(amountCents, among),
});

const netOf = (balances: MemberBalance[], userId: string) => balanceForUser(balances, userId);

describe('computeBalances', () => {
  it('nets a single expense between two people', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [expense('ana', 2000, ['ana', 'ben'])],
      settlements: [],
    });

    expect(netOf(balances, 'ana')).toBe(1000);
    expect(netOf(balances, 'ben')).toBe(-1000);
  });

  it('shows inactive members at zero', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben', 'cass'],
      expenses: [expense('ana', 2000, ['ana', 'ben'])],
      settlements: [],
    });

    expect(netOf(balances, 'cass')).toBe(0);
    expect(balances).toHaveLength(3);
  });

  it('tracks paid and owed separately', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [expense('ana', 5000, ['ana', 'ben'])],
      settlements: [],
    });

    const ana = balances.find((b) => b.userId === 'ana')!;
    expect(ana.paidCents).toBe(5000);
    expect(ana.owedCents).toBe(2500);
  });

  it('applies settlements as real transfers of money', () => {
    const base: BalanceInput = {
      memberIds: ['ana', 'ben'],
      expenses: [expense('ana', 2000, ['ana', 'ben'])],
      settlements: [],
    };

    const before = computeBalances(base);
    expect(netOf(before, 'ben')).toBe(-1000);

    const after = computeBalances({
      ...base,
      settlements: [{ fromUser: 'ben', toUser: 'ana', amountCents: 1000 }],
    });

    expect(netOf(after, 'ana')).toBe(0);
    expect(netOf(after, 'ben')).toBe(0);
  });

  it('handles a partial settlement', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [expense('ana', 2000, ['ana', 'ben'])],
      settlements: [{ fromUser: 'ben', toUser: 'ana', amountCents: 400 }],
    });

    expect(netOf(balances, 'ben')).toBe(-600);
    expect(netOf(balances, 'ana')).toBe(600);
  });

  it('keeps a departed member in the results so balances still sum to zero', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [expense('gone', 3000, ['ana', 'ben', 'gone'])],
      settlements: [],
    });

    expect(balances.map((b) => b.userId).sort()).toEqual(['ana', 'ben', 'gone']);
    expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  it('always sums to zero across an arbitrary ledger', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben', 'cass', 'dev'],
      expenses: [
        expense('ana', 4237, ['ana', 'ben', 'cass']),
        expense('ben', 999, ['ana', 'ben', 'cass', 'dev']),
        expense('cass', 12_345, ['cass', 'dev']),
        expense('dev', 1, ['ana', 'dev']),
      ],
      settlements: [
        { fromUser: 'dev', toUser: 'cass', amountCents: 5000 },
        { fromUser: 'ana', toUser: 'ben', amountCents: 137 },
      ],
    });

    expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  it('sorts creditors before debtors', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben', 'cass'],
      expenses: [expense('ana', 3000, ['ana', 'ben', 'cass'])],
      settlements: [],
    });

    expect(balances[0].userId).toBe('ana');
    expect(balances[0].netCents).toBeGreaterThan(0);
  });
});

describe('minimizeTransfers', () => {
  it('produces no transfers when everyone is square', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [expense('ana', 1000, ['ana', 'ben']), expense('ben', 1000, ['ana', 'ben'])],
      settlements: [],
    });

    expect(minimizeTransfers(balances)).toEqual([]);
  });

  it('collapses a three-way circle into a single payment', () => {
    // ana -> ben $10, ben -> cass $10, cass -> ana $10 nets out entirely.
    const balances = computeBalances({
      memberIds: ['ana', 'ben', 'cass'],
      expenses: [
        expense('ana', 2000, ['ana', 'ben']),
        expense('ben', 2000, ['ben', 'cass']),
        expense('cass', 2000, ['cass', 'ana']),
      ],
      settlements: [],
    });

    expect(minimizeTransfers(balances)).toEqual([]);
  });

  it('routes a chain of debts into one direct payment', () => {
    // ben owes ana $10; cass owes ben $10 -> cass should just pay ana.
    const balances: MemberBalance[] = [
      { userId: 'ana', netCents: 1000, paidCents: 0, owedCents: 0 },
      { userId: 'ben', netCents: 0, paidCents: 0, owedCents: 0 },
      { userId: 'cass', netCents: -1000, paidCents: 0, owedCents: 0 },
    ];

    expect(minimizeTransfers(balances)).toEqual([
      { fromUser: 'cass', toUser: 'ana', amountCents: 1000 },
    ]);
  });

  it('never needs more than n-1 transfers', () => {
    const memberIds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const balances = computeBalances({
      memberIds,
      expenses: [
        expense('a', 6001, memberIds),
        expense('b', 250, ['b', 'c']),
        expense('c', 9999, ['a', 'c', 'f']),
        expense('d', 4200, ['d', 'e']),
      ],
      settlements: [],
    });

    const transfers = minimizeTransfers(balances);
    expect(transfers.length).toBeLessThanOrEqual(memberIds.length - 1);
  });

  it('settles everyone to zero when the transfers are applied', () => {
    const memberIds = ['a', 'b', 'c', 'd', 'e'];
    const input: BalanceInput = {
      memberIds,
      expenses: [
        expense('a', 7333, ['a', 'b', 'c']),
        expense('b', 1201, memberIds),
        expense('c', 51, ['d', 'e']),
        expense('e', 88_888, memberIds),
      ],
      settlements: [{ fromUser: 'a', toUser: 'e', amountCents: 2500 }],
    };

    const { balances, transfers } = settleUpPlan(input);

    const applied = new Map(balances.map((b) => [b.userId, b.netCents]));
    for (const t of transfers) {
      applied.set(t.fromUser, applied.get(t.fromUser)! + t.amountCents);
      applied.set(t.toUser, applied.get(t.toUser)! - t.amountCents);
    }

    for (const [, net] of applied) {
      expect(net).toBe(0);
    }
  });

  it('only ever moves money from debtors to creditors', () => {
    const balances: MemberBalance[] = [
      { userId: 'a', netCents: 5000, paidCents: 0, owedCents: 0 },
      { userId: 'b', netCents: -3000, paidCents: 0, owedCents: 0 },
      { userId: 'c', netCents: -2000, paidCents: 0, owedCents: 0 },
    ];

    const transfers = minimizeTransfers(balances);
    expect(transfers).toEqual([
      { fromUser: 'b', toUser: 'a', amountCents: 3000 },
      { fromUser: 'c', toUser: 'a', amountCents: 2000 },
    ]);
    expect(transfers.every((t) => t.amountCents > 0)).toBe(true);
  });

  it('is deterministic for equal balances', () => {
    const balances: MemberBalance[] = [
      { userId: 'zoe', netCents: 1000, paidCents: 0, owedCents: 0 },
      { userId: 'amy', netCents: 1000, paidCents: 0, owedCents: 0 },
      { userId: 'bob', netCents: -1000, paidCents: 0, owedCents: 0 },
      { userId: 'cal', netCents: -1000, paidCents: 0, owedCents: 0 },
    ];

    expect(minimizeTransfers(balances)).toEqual(minimizeTransfers([...balances].reverse()));
  });

  it('settles randomised ledgers exactly, with no leftover cents', () => {
    let seed = 20260728;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let trial = 0; trial < 200; trial += 1) {
      const size = 2 + Math.floor(random() * 6);
      const memberIds = Array.from({ length: size }, (_, i) => `m${i}`);
      const expenses = Array.from({ length: 1 + Math.floor(random() * 8) }, () => {
        const among = memberIds.filter(() => random() > 0.3);
        const participants = among.length > 0 ? among : [memberIds[0]];
        const payer = memberIds[Math.floor(random() * size)];
        return expense(payer, 1 + Math.floor(random() * 50_000), participants);
      });

      const { balances, transfers } = settleUpPlan({ memberIds, expenses, settlements: [] });

      expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);

      const applied = new Map(balances.map((b) => [b.userId, b.netCents]));
      for (const t of transfers) {
        applied.set(t.fromUser, applied.get(t.fromUser)! + t.amountCents);
        applied.set(t.toUser, applied.get(t.toUser)! - t.amountCents);
      }
      for (const [, net] of applied) expect(net).toBe(0);
      expect(transfers.length).toBeLessThanOrEqual(size - 1);
    }
  });
});

describe('expenses paid by several people', () => {
  it('credits each payer their own contribution', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [
        {
          paidBy: 'ana',
          amountCents: 6000,
          payers: [
            { userId: 'ana', paidCents: 4000 },
            { userId: 'ben', paidCents: 2000 },
          ],
          splits: evenSplit(6000, ['ana', 'ben']),
        },
      ],
      settlements: [],
    });

    // Ana put in 4000 and consumed 3000; Ben put in 2000 and consumed 3000.
    expect(netOf(balances, 'ana')).toBe(1000);
    expect(netOf(balances, 'ben')).toBe(-1000);
  });

  it('ignores paid_by entirely when payers are present', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [
        {
          paidBy: 'ana',
          amountCents: 1000,
          payers: [{ userId: 'ben', paidCents: 1000 }],
          splits: evenSplit(1000, ['ana', 'ben']),
        },
      ],
      settlements: [],
    });

    expect(netOf(balances, 'ben')).toBe(500);
    expect(netOf(balances, 'ana')).toBe(-500);
  });

  it('falls back to the single payer when there are no payer rows', () => {
    const withEmpty = computeBalances({
      memberIds: ['ana', 'ben'],
      expenses: [
        { paidBy: 'ana', amountCents: 2000, payers: [], splits: evenSplit(2000, ['ana', 'ben']) },
      ],
      settlements: [],
    });

    expect(netOf(withEmpty, 'ana')).toBe(1000);
  });

  it('still sums to zero with a mix of single and multi-payer expenses', () => {
    const balances = computeBalances({
      memberIds: ['ana', 'ben', 'cass'],
      expenses: [
        expense('ana', 3000, ['ana', 'ben', 'cass']),
        {
          paidBy: 'ben',
          amountCents: 4501,
          payers: [
            { userId: 'ben', paidCents: 2501 },
            { userId: 'cass', paidCents: 2000 },
          ],
          splits: evenSplit(4501, ['ana', 'ben', 'cass']),
        },
      ],
      settlements: [],
    });

    expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  it('settles a multi-payer ledger to zero', () => {
    const input: BalanceInput = {
      memberIds: ['ana', 'ben', 'cass'],
      expenses: [
        {
          paidBy: 'ana',
          amountCents: 9999,
          payers: [
            { userId: 'ana', paidCents: 5000 },
            { userId: 'cass', paidCents: 4999 },
          ],
          splits: evenSplit(9999, ['ana', 'ben', 'cass']),
        },
      ],
      settlements: [],
    };

    const { balances, transfers } = settleUpPlan(input);
    const applied = new Map(balances.map((b) => [b.userId, b.netCents]));
    for (const t of transfers) {
      applied.set(t.fromUser, applied.get(t.fromUser)! + t.amountCents);
      applied.set(t.toUser, applied.get(t.toUser)! - t.amountCents);
    }
    for (const [, net] of applied) expect(net).toBe(0);
  });
});

describe('payersOf', () => {
  it('normalises a single payer to one contribution', () => {
    expect(payersOf({ paidBy: 'ana', amountCents: 500, splits: [] })).toEqual([
      { userId: 'ana', paidCents: 500 },
    ]);
  });

  it('passes multi-payer contributions through', () => {
    const payers = [
      { userId: 'ana', paidCents: 300 },
      { userId: 'ben', paidCents: 200 },
    ];
    expect(payersOf({ paidBy: 'ana', amountCents: 500, splits: [], payers })).toEqual(payers);
  });
});

describe('paying separately', () => {
  /**
   * Everyone covering their own share: each person's split equals what they
   * put in. The expense must net to exactly zero for everyone, which is what
   * lets the UI promise "nobody owes anybody".
   */
  const separately = (contributions: [string, number][]) => ({
    paidBy: contributions[0][0],
    amountCents: contributions.reduce((sum, [, cents]) => sum + cents, 0),
    payers: contributions.map(([userId, paidCents]) => ({ userId, paidCents })),
    splits: contributions.map(([userId, shareCents]) => ({ userId, shareCents })),
  });

  it('leaves nobody owing anybody', () => {
    // Aasrith paid 50, Jay paid 60.
    const balances = computeBalances({
      memberIds: ['aasrith', 'jay'],
      expenses: [separately([['aasrith', 5000], ['jay', 6000]])],
      settlements: [],
    });

    expect(netOf(balances, 'aasrith')).toBe(0);
    expect(netOf(balances, 'jay')).toBe(0);
    expect(minimizeTransfers(balances)).toEqual([]);
  });

  it('still records what each person spent', () => {
    const balances = computeBalances({
      memberIds: ['aasrith', 'jay'],
      expenses: [separately([['aasrith', 5000], ['jay', 6000]])],
      settlements: [],
    });

    const jay = balances.find((b) => b.userId === 'jay')!;
    expect(jay.paidCents).toBe(6000);
    expect(jay.owedCents).toBe(6000);
  });

  it('nets to zero for any number of contributors and amounts', () => {
    const cases: [string, number][][] = [
      [['a', 1]],
      [['a', 999], ['b', 1]],
      [['a', 3333], ['b', 3333], ['c', 3334]],
      [['a', 12_345], ['b', 1], ['c', 99_999], ['d', 7]],
    ];

    for (const contributions of cases) {
      const balances = computeBalances({
        memberIds: contributions.map(([id]) => id),
        expenses: [separately(contributions)],
        settlements: [],
      });

      for (const balance of balances) expect(balance.netCents).toBe(0);
    }
  });

  it('does not disturb unrelated balances in the same group', () => {
    const balances = computeBalances({
      memberIds: ['aasrith', 'jay'],
      expenses: [
        // An ordinary split expense that does create a debt...
        { paidBy: 'aasrith', amountCents: 2000, splits: evenSplit(2000, ['aasrith', 'jay']) },
        // ...plus a separately-paid one, which should change nothing.
        separately([['aasrith', 5000], ['jay', 6000]]),
      ],
      settlements: [],
    });

    expect(netOf(balances, 'aasrith')).toBe(1000);
    expect(netOf(balances, 'jay')).toBe(-1000);
  });
});
