export function nextTurn(memberIds: string[], lastActorId: string | null): string | null {
  if (memberIds.length === 0) return null;
  if (lastActorId === null) return memberIds[0];
  const index = memberIds.indexOf(lastActorId);
  if (index === -1) return memberIds[0];
  return memberIds[(index + 1) % memberIds.length];
}

export function reconcileTurn(
  previousOrder: string[],
  currentMembers: string[],
  currentTurnUserId: string | null
): string | null {
  if (currentMembers.length === 0) return null;
  if (currentTurnUserId && currentMembers.includes(currentTurnUserId)) {
    return currentTurnUserId;
  }

  const startIndex = currentTurnUserId ? previousOrder.indexOf(currentTurnUserId) : -1;
  if (startIndex !== -1) {
    for (let step = 1; step <= previousOrder.length; step += 1) {
      const candidate = previousOrder[(startIndex + step) % previousOrder.length];
      if (currentMembers.includes(candidate)) return candidate;
    }
  }

  return currentMembers[0];
}

export interface SupplyTurnInput {
  memberIds: string[];
  lastBoughtBy: string | null;
  purchaseCounts: Record<string, number>;
}

export function nextSupplyBuyer(input: SupplyTurnInput): string | null {
  const { memberIds, lastBoughtBy, purchaseCounts } = input;
  if (memberIds.length === 0) return null;
  const eligible = memberIds.filter((id) => id !== lastBoughtBy);
  const candidates = eligible.length > 0 ? eligible : memberIds;
  let best = candidates[0];
  let bestCount = purchaseCounts[best] ?? 0;
  for (const id of candidates.slice(1)) {
    const count = purchaseCounts[id] ?? 0;
    if (count < bestCount) {
      best = id;
      bestCount = count;
    }
  }

  return best;
}

export function countPurchases(
  purchases: { userId: string | null }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const purchase of purchases) {
    if (!purchase.userId) continue;
    counts[purchase.userId] = (counts[purchase.userId] ?? 0) + 1;
  }
  return counts;
}

export type ChoreFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export const CHORE_FREQUENCY_DAYS: Record<ChoreFrequency, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export interface ChoreTurnInput {
  memberIds: string[];
  lastCompletedBy: string | null;
  completionCounts: Record<string, number>;
}

export function nextChoreTurn(input: ChoreTurnInput): string | null {
  return nextSupplyBuyer({
    memberIds: input.memberIds,
    lastBoughtBy: input.lastCompletedBy,
    purchaseCounts: input.completionCounts,
  });
}

export function nextDueDate(frequency: ChoreFrequency, completedOn: string): string {
  const days = CHORE_FREQUENCY_DAYS[frequency] ?? 7;
  const [year, month, day] = completedOn.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function describeDue(nextDue: string, today: string): string {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };

  const days = Math.round((toUtc(nextDue) - toUtc(today)) / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function isOverdue(nextDue: string, today: string): boolean {
  return nextDue < today;
}
