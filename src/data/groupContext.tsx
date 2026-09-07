import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

import {
  MemberBalance,
  SettlementRecord,
  Transfer,
  computeBalances,
  minimizeTransfers,
} from '../core/balances';
import { choreOwner } from '../core/chores';
import { toCents } from '../core/money';
import { countPurchases, nextChoreTurn, nextSupplyBuyer } from '../core/rotation';
import type {
  EventRow,
  GroupRow,
  GroupStatusRow,
  PingRow,
  SettlementRow,
  SupplyItemRow,
} from '../lib/database.types';
import { useAuth } from './auth';
import { MemberProfile } from './members';
import {
  GroupChore,
  GroupSubscription,
  LedgerExpense,
  getGroupSnapshot,
  refreshGroup,
  subscribeToGroup,
} from './groupStore';

export type { GroupChore, GroupSubscription, LedgerExpense } from './groupStore';

interface GroupContextValue {
  groupId: string;
  group: GroupRow | null;
  members: MemberProfile[];
  memberById: Map<string, MemberProfile>;
  expenses: LedgerExpense[];
  settlements: SettlementRow[];
  subscriptions: GroupSubscription[];
  supplyItems: SupplyItemRow[];
  chores: GroupChore[];
  statuses: GroupStatusRow[];
  pings: PingRow[];
  events: EventRow[];
  supplyTurns: Map<string, string | null>;
  choreTurns: Map<string, string | null>;
  choreOwners: Map<string, string | null>;
  balances: MemberBalance[];
  transfers: Transfer[];
  myNetCents: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  displayName: (userId: string | null | undefined) => string;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ groupId, children }: { groupId: string; children: React.ReactNode }) {
  const { userId } = useAuth();
  const subscribe = useCallback(
    (listener: () => void) => subscribeToGroup(groupId, listener),
    [groupId]
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => getGroupSnapshot(groupId), [groupId])
  );

  const {
    group,
    members,
    expenses,
    settlements,
    subscriptions,
    supplyItems,
    chores,
    statuses: rawStatuses,
    pings,
    events,
    loading,
    error,
  } = snapshot;

  const statuses = useMemo(
    () => rawStatuses.filter((s) => !s.clears_at || s.clears_at > new Date().toISOString()),
    [rawStatuses]
  );

  const { supplyTurns, choreTurns } = useMemo(() => {
    const memberIds = members.map((m) => m.id);
    const supplyCounts = countPurchases(
      expenses
        .filter((e) => e.supply_item_id)
        .map((e) => ({ userId: e.paid_by as string | null }))
    );

    const supply = new Map<string, string | null>(
      supplyItems.map((item) => [
        item.id,
        nextSupplyBuyer({
          memberIds,
          lastBoughtBy: item.last_bought_by,
          purchaseCounts: supplyCounts,
        }),
      ])
    );

    const chore = new Map<string, string | null>(
      chores.map((c) => {
        const counts: Record<string, number> = {};
        for (const completion of c.completions) {
          counts[completion.user_id] = (counts[completion.user_id] ?? 0) + 1;
        }
        return [
          c.id,
          nextChoreTurn({
            memberIds,
            lastCompletedBy: c.completions[0]?.user_id ?? null,
            completionCounts: counts,
          }),
        ];
      })
    );

    return { supplyTurns: supply, choreTurns: chore };
  }, [members, expenses, supplyItems, chores]);

  const choreOwners = useMemo(
    () =>
      new Map<string, string | null>(
        chores.map((c) => [c.id, choreOwner(c.assigned_to, choreTurns.get(c.id) ?? null)])
      ),
    [chores, choreTurns]
  );

  const { balances, transfers } = useMemo(() => {
    const computed = computeBalances({
      memberIds: members.map((m) => m.id),
      expenses: expenses.map((e) => ({
        paidBy: e.paid_by,
        amountCents: e.amountCents,
        splits: e.splits,
        payers: e.payers,
      })),
      settlements: settlements.map<SettlementRecord>((s) => ({
        fromUser: s.from_user,
        toUser: s.to_user,
        amountCents: toCents(s.amount),
      })),
    });

    return { balances: computed, transfers: minimizeTransfers(computed) };
  }, [members, expenses, settlements]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const value = useMemo<GroupContextValue>(
    () => ({
      groupId,
      group,
      members,
      memberById,
      expenses,
      settlements,
      subscriptions,
      supplyItems,
      chores,
      statuses,
      pings,
      events,
      supplyTurns,
      choreTurns,
      choreOwners,
      balances,
      transfers,
      myNetCents: (userId && balances.find((b) => b.userId === userId)?.netCents) || 0,
      loading,
      error,
      refresh: () => refreshGroup(groupId),
      displayName: (id) => {
        if (!id) return 'Someone';
        if (userId && id === userId) return 'You';
        return memberById.get(id)?.name ?? 'Former member';
      },
    }),
    [
      groupId,
      group,
      members,
      memberById,
      expenses,
      settlements,
      subscriptions,
      supplyItems,
      chores,
      statuses,
      pings,
      events,
      supplyTurns,
      choreTurns,
      choreOwners,
      balances,
      transfers,
      userId,
      loading,
      error,
    ]
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup(): GroupContextValue {
  const context = useContext(GroupContext);
  if (!context) throw new Error('useGroup must be used inside <GroupProvider>');
  return context;
}
