export interface ExpenseWithSplits {
  paidBy: string;
  amountCents: number;
  splits: { userId: string; shareCents: number }[];
  payers?: { userId: string; paidCents: number }[];
}

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
  memberIds: string[];
  expenses: ExpenseWithSplits[];
  settlements: SettlementRecord[];
}

export interface MemberBalance {
  userId: string;
  netCents: number;
  paidCents: number;
  owedCents: number;
}

export interface Transfer {
  fromUser: string;
  toUser: string;
  amountCents: number;
}

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

  for (const settlement of input.settlements) {
    bump(paid, settlement.fromUser, settlement.amountCents);
    bump(owed, settlement.toUser, settlement.amountCents);
  }

  const ids = new Set<string>([...input.memberIds, ...paid.keys(), ...owed.keys()]);
  return [...ids]
    .map((userId) => {
      const paidCents = paid.get(userId) ?? 0;
      const owedCents = owed.get(userId) ?? 0;
      return { userId, paidCents, owedCents, netCents: paidCents - owedCents };
    })
    .sort((a, b) => b.netCents - a.netCents || a.userId.localeCompare(b.userId));
}

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

export function settleUpPlan(input: BalanceInput): {
  balances: MemberBalance[];
  transfers: Transfer[];
} {
  const balances = computeBalances(input);
  return { balances, transfers: minimizeTransfers(balances) };
}

export function balanceForUser(balances: MemberBalance[], userId: string): number {
  return balances.find((b) => b.userId === userId)?.netCents ?? 0;
}
