import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

import {
  MemberBalance,
  SettlementRecord,
  Transfer,
  computeBalances,
  minimizeTransfers,
} from '../core/balances';
import { toCents } from '../core/money';
import type { GroupRow, GroupStatusRow, SettlementRow, SupplyItemRow } from '../lib/database.types';
import { useAuth } from './auth';
import { MemberProfile } from './members';
import {
  GroupSubscription,
  LedgerExpense,
  getGroupSnapshot,
  refreshGroup,
  subscribeToGroup,
} from './groupStore';

export type { GroupSubscription, LedgerExpense } from './groupStore';

interface GroupContextValue {
  groupId: string;
  group: GroupRow | null;
  members: MemberProfile[];
  memberById: Map<string, MemberProfile>;
  expenses: LedgerExpense[];
  settlements: SettlementRow[];
  subscriptions: GroupSubscription[];
  supplyItems: SupplyItemRow[];
  statuses: GroupStatusRow[];
  balances: MemberBalance[];
  transfers: Transfer[];
  /** The signed-in user's net position, in cents. */
  myNetCents: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  displayName: (userId: string | null | undefined) => string;
}

const GroupContext = createContext<GroupContextValue | null>(null);

/**
 * Thin view over the shared group cache. Mounting several providers for the
 * same group — the tabs plus a modal on top of them — costs one extra
 * subscription callback, not another fetch or another websocket channel.
 */
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

  const { group, members, expenses, settlements, subscriptions, supplyItems, statuses, loading, error } =
    snapshot;

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
      statuses,
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
      statuses,
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
