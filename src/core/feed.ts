import { CategoryTotal } from './categories';

export type FeedEntryKind =
  | 'ping'
  | 'event'
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
  at: string;
  actorId: string | null;
  title: string;
  detail: string | null;
  icon: string;
  amountCents: number | null;
  actionable: boolean;
}

export interface FeedInput {
  viewerId: string | null;
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

  upcoming: { id: string; name: string; amountCents: number; dueDate: string }[];
  events: { id: string; title: string; date: string; time: string | null; location: string | null }[];
  pings: {
    id: string;
    title: string;
    note: string | null;
    createdAt: string;
    fromUser: string;
    canRespond: boolean;
    responseLabel: string | null;
  }[];

  lastMonth: { month: string; label: string; totalCents: number; byCategory: CategoryTotal[] } | null;
  today: string;
}

export const FEED_WINDOW_DAYS = 30;

export const EVENT_HORIZON_DAYS = 2;

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function startOfDayIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function buildFeed(input: FeedInput): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const { nameOf, viewerId, today } = input;
  const nowIso = new Date().toISOString();
  const isYou = (id: string | null | undefined) => Boolean(id) && id === viewerId;
  for (const item of input.supplyItems) {
    if (!item.isNeeded) continue;
    const yours = isYou(item.turnUserId);
    entries.push({
      id: `supply-needed-${item.id}`,
      kind: 'supply-needed',
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

  for (const ping of input.pings) {
    entries.push({
      id: `ping-${ping.id}`,
      kind: 'ping',
      at: ping.canRespond ? nowIso : ping.createdAt,
      actorId: ping.fromUser,
      title: ping.title,
      detail: ping.note ?? ping.responseLabel,
      icon: 'hand-left',
      amountCents: null,
      actionable: ping.canRespond,
    });
  }

  for (const event of input.events) {
    const days = daysBetween(startOfDayIso(today), startOfDayIso(event.date));
    if (days < 0 || days > EVENT_HORIZON_DAYS) continue;
    entries.push({
      id: `event-${event.id}`,
      kind: 'event',
      at: nowIso,
      actorId: null,
      title:
        days === 0
          ? `${event.title} today`
          : days === 1
            ? `${event.title} tomorrow`
            : `${event.title} in ${days} days`,
      detail: [event.time, event.location].filter(Boolean).join(' · ') || null,
      icon: 'calendar',
      amountCents: null,
      actionable: false,
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
      at: `${today.slice(0, 7)}-01T00:00:00.000Z`,
      actorId: null,
      title: `The house spent $${(input.lastMonth.totalCents / 100).toFixed(2)} in ${input.lastMonth.label}`,
      detail: top ? `Mostly ${top.category.label.toLowerCase()}` : null,
      icon: 'stats-chart',
      amountCents: input.lastMonth.totalCents,
      actionable: false,
    });
  }

  return entries.sort((a, b) => {
    if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
    const byTime = b.at.localeCompare(a.at);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

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
