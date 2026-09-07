import { useMemo } from 'react';

import { FeedEntry, buildFeed } from '../core/feed';
import { formatClock } from '../core/calendar';
import {
  PING_RESPONSES,
  canRespond,
  describePing,
  inboxFor,
  responseLabel,
} from '../core/presence';
import { MonthSummary, currentMonthKey, previousMonthKey, summarizeMonth } from '../core/spendSummary';
import { todayIso } from '../core/subscriptions';
import { useAuth } from './auth';
import { useGroup } from './groupContext';

export { PING_RESPONSES };

export interface HouseFeed {
  entries: FeedEntry[];
  actionable: FeedEntry[];
  history: FeedEntry[];
  thisMonth: MonthSummary;
  lastMonth: MonthSummary | null;
  today: string;
}

export function useHouseFeed(): HouseFeed {
  const { userId } = useAuth();
  const {
    expenses,
    supplyItems,
    chores,
    statuses,
    settlements,
    subscriptions,
    events,
    pings,
    supplyTurns,
    choreOwners,
    members,
    displayName,
  } = useGroup();

  const today = todayIso();
  const monthInput = useMemo(
    () =>
      expenses.map((e) => ({
        amountCents: e.amountCents,
        paidBy: e.paid_by,
        category: e.category,
        createdAt: e.created_at,
        splits: e.splits,
        payers: e.payers,
      })),
    [expenses]
  );

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const thisMonth = useMemo(
    () => summarizeMonth(monthInput, currentMonthKey(), memberIds),
    [monthInput, memberIds]
  );

  const lastMonth = useMemo(() => {
    const summary = summarizeMonth(monthInput, previousMonthKey(currentMonthKey()), memberIds);
    return summary.isEmpty ? null : summary;
  }, [monthInput, memberIds]);

  const feedPings = useMemo(() => {
    const mapped = pings.map((p) => ({
      id: p.id,
      fromUser: p.from_user,
      toUser: p.to_user,
      note: p.note,
      createdAt: p.created_at,
      response: p.response,
      respondedAt: p.responded_at,
    }));

    const inbox = inboxFor(mapped, userId);
    return [...inbox.needsReply, ...inbox.sent, ...inbox.other].map((ping) => ({
      id: ping.id,
      title: describePing(ping, userId, displayName),
      note: ping.note,
      createdAt: ping.createdAt,
      fromUser: ping.fromUser,
      canRespond: canRespond(ping, userId),
      responseLabel: responseLabel(ping.response),
    }));
  }, [pings, userId, displayName]);

  const entries = useMemo(
    () =>
      buildFeed({
        viewerId: userId,
        nameOf: displayName,
        expenses: expenses.map((e) => ({
          id: e.id,
          description: e.description,
          amountCents: e.amountCents,
          paidBy: e.paid_by,
          createdAt: e.created_at,
          supplyItemId: e.supply_item_id,
          repeatParentId: e.repeat_parent_id,
        })),
        supplyItems: supplyItems.map((item) => ({
          id: item.id,
          name: item.name,
          isNeeded: item.is_needed,
          neededAt: item.needed_at,
          neededBy: item.needed_by,
          turnUserId: supplyTurns.get(item.id) ?? null,
        })),
        chores: chores.map((chore) => ({
          id: chore.id,
          name: chore.name,
          nextDue: chore.next_due,
          turnUserId: choreOwners.get(chore.id) ?? null,
          completions: chore.completions.map((c) => ({
            id: c.id,
            userId: c.user_id,
            completedAt: c.completed_at,
          })),
        })),
        statuses: statuses.map((s) => ({
          userId: s.user_id,
          status: s.status,
          updatedAt: s.updated_at,
        })),
        settlements: settlements.map((s) => ({
          id: s.id,
          fromUser: s.from_user,
          toUser: s.to_user,
          amountCents: Math.round(Number(s.amount) * 100),
          settledAt: s.settled_at,
        })),

        upcoming: [
          ...subscriptions
            .filter((s) => s.active)
            .map((s) => ({
              id: `sub-${s.id}`,
              name: s.name,
              amountCents: s.monthlyCostCents,
              dueDate: s.next_charge_date,
            })),
          ...expenses
            .filter((e) => e.repeat_interval && e.repeat_next_date)
            .map((e) => ({
              id: `rep-${e.id}`,
              name: e.description,
              amountCents: e.amountCents,
              dueDate: e.repeat_next_date!,
            })),
        ],
        events: events.map((event) => ({
          id: event.id,
          title: event.title,
          date: event.event_date,
          time: formatClock(event.start_time),
          location: event.location,
        })),
        pings: feedPings,
        lastMonth: lastMonth
          ? {
              month: lastMonth.month,
              label: lastMonth.label,
              totalCents: lastMonth.totalCents,
              byCategory: lastMonth.byCategory,
            }
          : null,
        today,
      }),
    [
      userId,
      displayName,
      expenses,
      supplyItems,
      chores,
      statuses,
      settlements,
      subscriptions,
      events,
      supplyTurns,
      choreOwners,
      feedPings,
      lastMonth,
      today,
    ]
  );

  const actionable = useMemo(() => entries.filter((entry) => entry.actionable), [entries]);
  const history = useMemo(() => entries.filter((entry) => !entry.actionable), [entries]);
  return { entries, actionable, history, thisMonth, lastMonth, today };
}
