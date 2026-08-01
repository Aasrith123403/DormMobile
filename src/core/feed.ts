/**
 * The house feed. Pure.
 *
 * Nobody posts to this. Every entry is a byproduct of something that already
 * happened — an expense was logged, a chore was marked done, someone tapped
 * "we're out" — plus a couple of forward-looking entries derived from dates
 * the app already holds. There is no feed table and nothing to moderate: give
 * this function the same rows the group screens already load and it produces
 * the same feed on every device.
 *
 * Deliberately excluded: anything that would make the feed a reason to post
 * rather than a reason to look. No reactions, no free text, no "X viewed Y".
 */

import { CategoryTotal } from './categories';

export type FeedEntryKind =
  | 'expense'
  | 'supply-bought'
  | 'supply-needed'
  | 'chore-done'
  | 'status'
  | 'settlement'
  | 'upcoming'
  | 'month-summary';

export interface FeedEntry {
  id: string;
  kind: FeedEntryKind;
  /** ISO timestamp used for ordering. Future-dated for upcoming entries. */
  at: string;
  /** Whose action this was, if it was anyone's. */
  actorId: string | null;
  /** Primary line, already phrased. */
  title: string;
  /** Secondary line, or null. */
  detail: string | null;
  /** Ionicons glyph. */
  icon: string;
  /** Signed cents when the entry is about money, else null. */
  amountCents: number | null;
  /** True when this needs the viewer to do something. */
  actionable: boolean;
}

export interface FeedInput {
  viewerId: string | null;
  /** Resolves a user id to a display name; "You" handling is the caller's. */
  nameOf: (userId: string | null | undefined) => string;
  expenses: {
    id: string;
    description: string;
    amountCents: number;
    paidBy: string;
    createdAt: string;
    supplyItemId?: string | null;
    repeatParentId?: string | null;
  }[];
  supplyItems: {
    id: string;
    name: string;
    isNeeded: boolean;
    neededAt: string | null;
    neededBy: string | null;
    /** Whose turn it is to buy — already derived by the caller. */
    turnUserId: string | null;
  }[];
  chores: {
    id: string;
    name: string;
    nextDue: string;
    completions: { id: string; userId: string; completedAt: string }[];
    turnUserId: string | null;
  }[];
  statuses: {
    userId: string;
    status: string;
    updatedAt: string;
  }[];
  settlements: {
    id: string;
    fromUser: string;
    toUser: string;
    amountCents: number;
    settledAt: string;
  }[];
  /** Recurring money that has not posted yet. */
  upcoming: { id: string; name: string; amountCents: number; dueDate: string }[];
  /** Last month's total, if there is one worth reporting. */
  lastMonth: { month: string; label: string; totalCents: number; byCategory: CategoryTotal[] } | null;
  /** Today, as YYYY-MM-DD. */
  today: string;
}

/** Entries older than this stop being interesting. */
export const FEED_WINDOW_DAYS = 30;

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/**
 * Builds the feed, newest first.
 *
 * Forward-looking entries ("rent posts in 3 days", "you're up for dish soap")
 * sort to the top because they are the only ones the viewer can still act on;
 * everything else is history and reads in reverse chronological order.
 */
export function buildFeed(input: FeedInput): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const { nameOf, viewerId, today } = input;
  const nowIso = new Date().toISOString();
  const isYou = (id: string | null | undefined) => Boolean(id) && id === viewerId;

  /* ------------------------------------------------ things still to do -- */

  for (const item of input.supplyItems) {
    if (!item.isNeeded) continue;

    const yours = isYou(item.turnUserId);
    entries.push({
      id: `supply-needed-${item.id}`,
      kind: 'supply-needed',
      // Needed items stay pinned to now so they lead the feed until resolved.
      at: nowIso,
      actorId: item.neededBy,
      title: yours
        ? `Out of ${item.name.toLowerCase()} — you're up`
        : `Out of ${item.name.toLowerCase()}`,
      detail: yours
        ? 'You have bought the fewest lately.'
        : item.turnUserId
          ? `${nameOf(item.turnUserId)}'s turn to buy.`
          : 'Nobody assigned yet.',
      icon: 'alert-circle',
      amountCents: null,
      actionable: yours,
    });
  }

  for (const chore of input.chores) {
    if (chore.nextDue > today) continue;

    const yours = isYou(chore.turnUserId);
    const overdueDays = daysBetween(startOfDayIso(chore.nextDue), startOfDayIso(today));

    entries.push({
      id: `chore-due-${chore.id}`,
      kind: 'upcoming',
      at: nowIso,
      actorId: chore.turnUserId,
      title: yours ? `${chore.name} is yours` : `${chore.name} — ${nameOf(chore.turnUserId)}'s turn`,
      detail: overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue` : 'Due today',
      icon: 'checkbox-outline',
      amountCents: null,
      actionable: yours,
    });
  }

  for (const charge of input.upcoming) {
    const days = daysBetween(startOfDayIso(today), startOfDayIso(charge.dueDate));
    if (days < 0 || days > 7) continue;

    entries.push({
      id: `upcoming-${charge.id}-${charge.dueDate}`,
      kind: 'upcoming',
      at: nowIso,
      actorId: null,
      title:
        days === 0
          ? `${charge.name} posts today`
          : `${charge.name} posts in ${days} day${days === 1 ? '' : 's'}`,
      detail: null,
      icon: 'repeat',
      amountCents: charge.amountCents,
      actionable: false,
    });
  }

  /* -------------------------------------------------------- what happened -- */

  const cutoff = new Date(Date.now() - FEED_WINDOW_DAYS * 86_400_000).toISOString();

  for (const expense of input.expenses) {
    if (expense.createdAt < cutoff) continue;

    const supply = expense.supplyItemId
      ? input.supplyItems.find((item) => item.id === expense.supplyItemId)
      : undefined;

    entries.push({
      id: `expense-${expense.id}`,
      kind: supply ? 'supply-bought' : 'expense',
      at: expense.createdAt,
      actorId: expense.paidBy,
      title: supply
        ? `${nameOf(expense.paidBy)} bought ${supply.name.toLowerCase()}`
        : `${nameOf(expense.paidBy)} paid for ${expense.description}`,
      detail: expense.repeatParentId ? 'Repeating expense' : null,
      icon: supply ? 'cart' : 'receipt',
      amountCents: expense.amountCents,
      actionable: false,
    });
  }

  for (const chore of input.chores) {
    for (const completion of chore.completions) {
      if (completion.completedAt < cutoff) continue;

      entries.push({
        id: `chore-done-${completion.id}`,
        kind: 'chore-done',
        at: completion.completedAt,
        actorId: completion.userId,
        title: `${nameOf(completion.userId)} did ${chore.name.toLowerCase()}`,
        detail: null,
        icon: 'checkmark-circle',
        amountCents: null,
        actionable: false,
      });
    }
  }

  for (const settlement of input.settlements) {
    if (settlement.settledAt < cutoff) continue;

    entries.push({
      id: `settlement-${settlement.id}`,
      kind: 'settlement',
      at: settlement.settledAt,
      actorId: settlement.fromUser,
      title: `${nameOf(settlement.fromUser)} paid ${nameOf(settlement.toUser)}`,
      detail: 'Settled up',
      icon: 'swap-horizontal',
      amountCents: settlement.amountCents,
      actionable: false,
    });
  }

  for (const status of input.statuses) {
    if (status.updatedAt < cutoff) continue;
    // Only the viewer's housemates are interesting here.
    if (isYou(status.userId)) continue;

    entries.push({
      id: `status-${status.userId}-${status.updatedAt}`,
      kind: 'status',
      at: status.updatedAt,
      actorId: status.userId,
      title: `${nameOf(status.userId)} is ${status.status.toLowerCase()}`,
      detail: null,
      icon: 'ellipse',
      amountCents: null,
      actionable: false,
    });
  }

  if (input.lastMonth && input.lastMonth.totalCents > 0) {
    const top = input.lastMonth.byCategory[0];
    entries.push({
      id: `month-${input.lastMonth.month}`,
      kind: 'month-summary',
      // Dated to the start of this month so it sits with that period.
      at: `${today.slice(0, 7)}-01T00:00:00.000Z`,
      actorId: null,
      title: `The house spent $${(input.lastMonth.totalCents / 100).toFixed(2)} in ${input.lastMonth.label}`,
      detail: top ? `Mostly ${top.category.label.toLowerCase()}` : null,
      icon: 'stats-chart',
      amountCents: input.lastMonth.totalCents,
      actionable: false,
    });
  }

  /* ------------------------------------------------------------- ordering -- */

  return entries.sort((a, b) => {
    // Anything the viewer can act on leads, regardless of age.
    if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
    const byTime = b.at.localeCompare(a.at);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

/** "2h", "3d" — relative time for a feed row. */
export function feedTimeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;

  return `${Math.round(days / 7)}w`;
}
