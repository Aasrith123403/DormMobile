import { useCallback, useEffect, useMemo, useState } from 'react';

import { computeBalances, ExpenseWithSplits, SettlementRecord } from '../core/balances';
import { toCents } from '../core/money';
import type { GroupRow, MembershipRow, UserRow } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth';
import { useRealtimeRefresh } from './realtime';

export interface GroupSummary {
  group: GroupRow;
  role: 'owner' | 'member';
  memberCount: number;
  /** The signed-in user's net position in this group, in cents. */
  netCents: number;
}

/**
 * Every group the user belongs to, each with their live net balance so the
 * home screen answers "who owes what" without a single tap.
 */
export function useGroups() {
  const { userId } = useAuth();
  const [summaries, setSummaries] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setSummaries([]);
      setLoading(false);
      return;
    }

    try {
      // RLS already limits every table below to the caller's groups, so these
      // unfiltered reads only ever return rows the user is entitled to.
      const [membershipsRes, groupsRes, expensesRes, splitsRes, settlementsRes] = await Promise.all([
        supabase.from('memberships').select('*'),
        supabase.from('groups').select('*').order('created_at', { ascending: false }),
        supabase.from('expenses').select('id, group_id, paid_by, amount'),
        supabase.from('splits').select('expense_id, user_id, share_amount'),
        supabase.from('settlements').select('group_id, from_user, to_user, amount'),
      ]);

      const firstError =
        membershipsRes.error ??
        groupsRes.error ??
        expensesRes.error ??
        splitsRes.error ??
        settlementsRes.error;
      if (firstError) throw firstError;

      const memberships = (membershipsRes.data ?? []) as MembershipRow[];
      const groups = (groupsRes.data ?? []) as GroupRow[];

      const splitsByExpense = new Map<string, { userId: string; shareCents: number }[]>();
      for (const split of splitsRes.data ?? []) {
        const list = splitsByExpense.get(split.expense_id) ?? [];
        list.push({ userId: split.user_id, shareCents: toCents(split.share_amount) });
        splitsByExpense.set(split.expense_id, list);
      }

      const expensesByGroup = new Map<string, ExpenseWithSplits[]>();
      for (const expense of expensesRes.data ?? []) {
        const list = expensesByGroup.get(expense.group_id) ?? [];
        list.push({
          paidBy: expense.paid_by,
          amountCents: toCents(expense.amount),
          splits: splitsByExpense.get(expense.id) ?? [],
        });
        expensesByGroup.set(expense.group_id, list);
      }

      const settlementsByGroup = new Map<string, SettlementRecord[]>();
      for (const settlement of settlementsRes.data ?? []) {
        const list = settlementsByGroup.get(settlement.group_id) ?? [];
        list.push({
          fromUser: settlement.from_user,
          toUser: settlement.to_user,
          amountCents: toCents(settlement.amount),
        });
        settlementsByGroup.set(settlement.group_id, list);
      }

      const membershipsByGroup = new Map<string, MembershipRow[]>();
      for (const membership of memberships) {
        const list = membershipsByGroup.get(membership.group_id) ?? [];
        list.push(membership);
        membershipsByGroup.set(membership.group_id, list);
      }

      const next = groups.map((group) => {
        const groupMembers = membershipsByGroup.get(group.id) ?? [];
        const balances = computeBalances({
          memberIds: groupMembers.map((m) => m.user_id),
          expenses: expensesByGroup.get(group.id) ?? [],
          settlements: settlementsByGroup.get(group.id) ?? [],
        });

        return {
          group,
          role: (groupMembers.find((m) => m.user_id === userId)?.role ?? 'member') as 'owner' | 'member',
          memberCount: groupMembers.length,
          netCents: balances.find((b) => b.userId === userId)?.netCents ?? 0,
        };
      });

      setSummaries(next);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh({
    channel: `groups-of-${userId ?? 'anon'}`,
    enabled: Boolean(userId),
    tables: ['memberships', 'groups', 'expenses', 'splits', 'settlements'],
    onChange: load,
  });

  const totals = useMemo(() => {
    const owed = summaries.reduce((sum, s) => sum + Math.max(0, s.netCents), 0);
    const owes = summaries.reduce((sum, s) => sum + Math.min(0, s.netCents), 0);
    return { owedToYouCents: owed, youOweCents: -owes };
  }, [summaries]);

  return { summaries, totals, loading, error, refresh: load };
}

export async function createGroup(name: string): Promise<GroupRow> {
  const { data, error } = await supabase.rpc('create_group', { p_name: name });
  if (error) throw error;
  return data as unknown as GroupRow;
}

export async function joinGroupByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code });
  if (error) throw error;
  return data as unknown as string;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export type MemberProfile = UserRow & { role: 'owner' | 'member'; joinedAt: string };

export function sortMembers(members: MemberProfile[]): MemberProfile[] {
  return [...members].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id)
  );
}
