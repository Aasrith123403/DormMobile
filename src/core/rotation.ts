/**
 * Whose turn it is — for shared staples and for chores.
 *
 * Nothing here is stored as a schedule. A rotation is a *derived answer* to
 * "who is up next", computed from what has already happened: who did it last,
 * and who has done it least. That means the roster can change, someone can do
 * a task out of turn, and the answer stays fair without anyone editing a
 * calendar.
 *
 * Every function is total: an empty group returns null rather than throwing,
 * and unknown ids fall back to the front of the roster.
 */

/* ------------------------------------------------------------ primitives -- */

/**
 * Simple round-robin: the turn moves to whoever follows the person who last
 * did it, in roster order. Used where "next in line" is the whole rule.
 */
export function nextTurn(memberIds: string[], lastActorId: string | null): string | null {
  if (memberIds.length === 0) return null;
  if (lastActorId === null) return memberIds[0];

  const index = memberIds.indexOf(lastActorId);
  if (index === -1) return memberIds[0];

  return memberIds[(index + 1) % memberIds.length];
}

/**
 * Keeps a rotation pointer valid when the roster changes: if the person whose
 * turn it was has left, the turn falls to the next surviving member in the
 * old order.
 */
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

/* --------------------------------------------------------------- supplies -- */

export interface SupplyTurnInput {
  /** Current members, in join order — the tie-break of last resort. */
  memberIds: string[];
  /** Who bought *this* item last, if anyone. */
  lastBoughtBy: string | null;
  /** How many supply runs each member has done overall, across all items. */
  purchaseCounts: Record<string, number>;
}

/**
 * Whose turn it is to buy a given staple.
 *
 * Fairness has two levels, in order:
 *   1. Not the person who bought this same item last — nobody should buy the
 *      trash bags twice running while someone else never does.
 *   2. Among the rest, whoever has bought the least overall, so a person who
 *      happens to notice things first does not end up carrying the house.
 *
 * Ties break on roster order, which makes the answer stable: the same inputs
 * always name the same person, so two phones never disagree.
 */
export function nextSupplyBuyer(input: SupplyTurnInput): string | null {
  const { memberIds, lastBoughtBy, purchaseCounts } = input;
  if (memberIds.length === 0) return null;

  // Excluding the last buyer is a preference, not a rule: in a one-person
  // group, or when everyone else has left, they are still up.
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

/** Tallies supply runs per member, for `nextSupplyBuyer`. */
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

/* ----------------------------------------------------------------- chores -- */

export type ChoreFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export const CHORE_FREQUENCY_DAYS: Record<ChoreFrequency, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export interface ChoreTurnInput {
  memberIds: string[];
  /** Who completed this chore most recently, if anyone. */
  lastCompletedBy: string | null;
  /** Completions per member for this chore. */
  completionCounts: Record<string, number>;
}

/**
 * Whose turn it is for a chore. Same fairness rule as supplies — the app is
 * answering the same question, and using one rule for both means the two
 * screens can never seem to contradict each other.
 */
export function nextChoreTurn(input: ChoreTurnInput): string | null {
  return nextSupplyBuyer({
    memberIds: input.memberIds,
    lastBoughtBy: input.lastCompletedBy,
    purchaseCounts: input.completionCounts,
  });
}

/** The next due date after a chore is completed, as YYYY-MM-DD. */
export function nextDueDate(frequency: ChoreFrequency, completedOn: string): string {
  const days = CHORE_FREQUENCY_DAYS[frequency] ?? 7;
  const [year, month, day] = completedOn.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * How a due date should read: overdue chores are the only ones worth drawing
 * attention to, so everything else stays quiet.
 */
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
