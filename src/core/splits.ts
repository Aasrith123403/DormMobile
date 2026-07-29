/**
 * Split calculation. Pure: no dates, no network, no Supabase types.
 *
 * Invariant enforced everywhere in this file: the share amounts must sum to
 * exactly the expense total, in cents. Even splits that do not divide evenly
 * hand the leftover cents to the earliest participants, matching the
 * `insert_even_splits` SQL function used by subscription auto-generation.
 */

export interface SplitLine {
  userId: string;
  shareCents: number;
}

export interface SplitParticipant {
  userId: string;
  /** Included in the split at all. Toggled off members keep their custom value. */
  included: boolean;
  /** When set, overrides the even share for this member. */
  customCents?: number | null;
}

export type SplitMode = 'even' | 'custom';

/**
 * Divides a total across members, distributing the indivisible remainder one
 * cent at a time to the first members in the list. Order is the caller's, so
 * pass a stable order (we use group join order) to keep results reproducible.
 */
export function evenSplit(totalCents: number, userIds: string[]): SplitLine[] {
  const n = userIds.length;
  if (n === 0) return [];

  const negative = totalCents < 0;
  const magnitude = Math.abs(Math.round(totalCents));
  const base = Math.floor(magnitude / n);
  const remainder = magnitude - base * n;

  return userIds.map((userId, index) => {
    const share = base + (index < remainder ? 1 : 0);
    return { userId, shareCents: negative ? -share : share };
  });
}

export interface SplitResult {
  lines: SplitLine[];
  /** Signed difference: assigned total minus expense total, in cents. */
  differenceCents: number;
  valid: boolean;
  error: string | null;
}

/**
 * Builds the final split lines for an expense.
 *
 * - `even`: ignores custom values, divides evenly across included members.
 * - `custom`: uses each included member's entered amount and validates the sum.
 */
export function computeSplits(
  totalCents: number,
  participants: SplitParticipant[],
  mode: SplitMode = 'even'
): SplitResult {
  const included = participants.filter((p) => p.included);

  if (totalCents <= 0) {
    return {
      lines: [],
      differenceCents: 0,
      valid: false,
      error: 'Enter an amount greater than zero.',
    };
  }

  if (included.length === 0) {
    return {
      lines: [],
      differenceCents: -totalCents,
      valid: false,
      error: 'Include at least one person in the split.',
    };
  }

  if (mode === 'even') {
    return {
      lines: evenSplit(
        totalCents,
        included.map((p) => p.userId)
      ),
      differenceCents: 0,
      valid: true,
      error: null,
    };
  }

  const lines: SplitLine[] = included.map((p) => ({
    userId: p.userId,
    shareCents: Math.round(p.customCents ?? 0),
  }));

  if (lines.some((line) => line.shareCents < 0)) {
    return {
      lines,
      differenceCents: sumShares(lines) - totalCents,
      valid: false,
      error: 'Shares cannot be negative.',
    };
  }

  const difference = sumShares(lines) - totalCents;
  if (difference !== 0) {
    return {
      lines,
      differenceCents: difference,
      valid: false,
      error:
        difference > 0
          ? `Shares are over the total by ${formatDiff(difference)}.`
          : `Shares are under the total by ${formatDiff(-difference)}.`,
    };
  }

  return { lines, differenceCents: 0, valid: true, error: null };
}

export function sumShares(lines: SplitLine[]): number {
  return lines.reduce((total, line) => total + line.shareCents, 0);
}

/**
 * Seeds the custom-amount editor when a user switches from even to custom, so
 * they start from a valid, summing-to-total state.
 */
export function seedCustomShares(
  totalCents: number,
  participants: SplitParticipant[]
): SplitParticipant[] {
  const includedIds = participants.filter((p) => p.included).map((p) => p.userId);
  const seeded = new Map(evenSplit(totalCents, includedIds).map((l) => [l.userId, l.shareCents]));
  return participants.map((p) => ({
    ...p,
    customCents: p.included ? (seeded.get(p.userId) ?? 0) : 0,
  }));
}

function formatDiff(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}
