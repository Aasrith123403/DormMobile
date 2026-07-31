/**
 * Balance derivation and debt simplification. Pure.
 *
 * Balances are NEVER stored. They are derived on every read from expenses,
 * their splits, and recorded settlements:
 *
 *   balance(u) = (what u paid) - (what u owes) + (what u has paid back)
 *                                              - (what u has been paid)
 *
 * Positive balance  -> the group owes u money (creditor)
 * Negative balance  -> u owes the group money (debtor)
 *
 * The sum of all balances is always zero, so debtors and creditors match up
 * exactly and the netting below always terminates with everyone at zero.
 */

export interface ExpenseWithSplits {
  /** The single/primary payer. Ignored when `payers` is present. */
  paidBy: string;
  amountCents: number;
  splits: { userId: string; shareCents: number }[];
  /**
   * Set when several people chipped in. Their amounts must sum to
   * `amountCents`; when absent, `paidBy` covered the whole thing.
   */
  payers?: { userId: string; paidCents: number }[];
}

/**
 * Who actually put money in, normalised. Multi-payer expenses record one row
 * per contributor; everything else is a single payer covering the total.
 */
export function payersOf(expense: ExpenseWithSplits): { userId: string; paidCents: number }[] {
  if (expense.payers && expense.payers.length > 0) return expense.payers;
  return [{ userId: expense.paidBy, paidCents: expense.amountCents }];
}

export interface SettlementRecord {
  fromUser: string;
  toUser: string;
  amountCents: number;
}

export interface BalanceInput {
  /** Every current member, so people with no activity still show at $0.00. */
  memberIds: string[];
  expenses: ExpenseWithSplits[];
  settlements: SettlementRecord[];
}

export interface MemberBalance {
  userId: string;
  /** Signed net position in cents. */
  netCents: number;
  paidCents: number;
  owedCents: number;
}

export interface Transfer {
  fromUser: string;
  toUser: string;
  amountCents: number;
}

/**
 * Net position per member, sorted creditors first then by user id so the UI
 * order is stable across re-renders and realtime updates.
 */
export function computeBalances(input: BalanceInput): MemberBalance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string, cents: number) => {
    map.set(key, (map.get(key) ?? 0) + cents);
  };

  for (const expense of input.expenses) {
    for (const payer of payersOf(expense)) {
      bump(paid, payer.userId, payer.paidCents);
    }
    for (const split of expense.splits) {
      bump(owed, split.userId, split.shareCents);
    }
  }

  // A settlement is a real transfer of money outside the ledger: it counts as
  // the sender paying, and the recipient being paid.
  for (const settlement of input.settlements) {
    bump(paid, settlement.fromUser, settlement.amountCents);
    bump(owed, settlement.toUser, settlement.amountCents);
  }

  // Include anyone who appears in the data even if they have since left the
  // group, otherwise their share would silently vanish and balances would
  // stop summing to zero.
  const ids = new Set<string>([...input.memberIds, ...paid.keys(), ...owed.keys()]);

  return [...ids]
    .map((userId) => {
      const paidCents = paid.get(userId) ?? 0;
      const owedCents = owed.get(userId) ?? 0;
      return { userId, paidCents, owedCents, netCents: paidCents - owedCents };
    })
    .sort((a, b) => b.netCents - a.netCents || a.userId.localeCompare(b.userId));
}

/**
 * Turns net balances into transfers, repeatedly settling the largest debtor
 * against the largest creditor. This never needs more than n-1 transfers and
 * collapses matching pairs immediately, which is what "minimum set" means in
 * practice — the exact minimum is subset-sum hard and not worth the latency
 * for dorm-sized groups.
 */
export function minimizeTransfers(balances: MemberBalance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ userId: b.userId, cents: b.netCents }))
    .sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));

  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ userId: b.userId, cents: -b.netCents }))
    .sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.cents, creditor.cents);

    if (amount > 0) {
      transfers.push({
        fromUser: debtor.userId,
        toUser: creditor.userId,
        amountCents: amount,
      });
    }

    debtor.cents -= amount;
    creditor.cents -= amount;

    if (debtor.cents === 0) i += 1;
    if (creditor.cents === 0) j += 1;
  }

  return transfers;
}

/** Convenience: raw ledger rows straight to "X owes Y $Z" lines. */
export function settleUpPlan(input: BalanceInput): {
  balances: MemberBalance[];
  transfers: Transfer[];
} {
  const balances = computeBalances(input);
  return { balances, transfers: minimizeTransfers(balances) };
}

/** What a single member owes / is owed, for the header on the group screen. */
export function balanceForUser(balances: MemberBalance[], userId: string): number {
  return balances.find((b) => b.userId === userId)?.netCents ?? 0;
}
