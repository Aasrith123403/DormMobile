import { useCallback, useEffect, useMemo, useState } from 'react';

import { computeBalances, ExpenseWithSplits, SettlementRecord } from '../core/balances';
import { toCents } from '../core/money';
import type { GroupRow, MembershipRow } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth';
import { useRealtimeRefresh } from './realtime';

/**
 * Set once if the summaries RPC is absent, so the slower path is not retried
 * on every refresh.
 */
let summariesRpcMissing = false;

interface SummaryRow {
  group_id: string;
  name: string;
  join_code: string;
  created_at: string;
  role: 'owner' | 'member';
  member_count: number;
  expense_count: number;
  my_net: string;
  members: { id: string; name: string }[];
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');
}

export interface GroupSummary {
  group: GroupRow;
  role: 'owner' | 'member';
  memberCount: number;
  /** The signed-in user's net position in this group, in cents. */
  netCents: number;
  /** Enough to render an avatar stack on the card. */
  members: { id: string; name: string }[];
}

/**
 * Every group the user belongs to, each with their live net balance so the
 * home screen answers "who owes what" without a single tap.
 */
export function useGroups() {
  const { userId } = useAuth();
  const [summaries, setSummaries] = useState<GroupSummary[]>([]);
  /** Across every group, for the getting-started checklist. */
  const [expenseCount, setExpenseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setSummaries([]);
      setLoading(false);
      return;
    }

    // Fast path: one round trip, netted in Postgres. Falls through to the
    // client-side computation below if 0004_group_summaries.sql has not been
    // applied, so the app keeps working either way.
    if (!summariesRpcMissing) {
      const { data, error: rpcError } = await supabase.rpc('get_my_group_summaries');

      if (!rpcError && data) {
        setSummaries(
          (data as SummaryRow[]).map((row) => ({
            group: {
              id: row.group_id,
              name: row.name,
              join_code: row.join_code,
              created_at: row.created_at,
              created_by: '',
            },
            role: row.role,
            memberCount: row.member_count,
            netCents: toCents(row.my_net),
            members: row.members ?? [],
          }))
        );
        setExpenseCount((data as SummaryRow[]).reduce((sum, row) => sum + row.expense_count, 0));
        setError(null);
        setLoading(false);
        return;
      }

      if (isMissingFunction(rpcError)) {
        summariesRpcMissing = true;
        console.warn(
          '[RoomLedger] get_my_group_summaries missing — run supabase/apply_all.sql for a faster home screen.'
        );
      } else if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
    }

    try {
      // RLS already limits every table below to the caller's groups, so these
      // unfiltered reads only ever return rows the user is entitled to.
      const [membershipsRes, groupsRes, expensesRes, splitsRes, settlementsRes, usersRes] =
        await Promise.all([
        supabase.from('memberships').select('*'),
        supabase.from('groups').select('*').order('created_at', { ascending: false }),
        supabase.from('expenses').select('id, group_id, paid_by, amount'),
        supabase.from('splits').select('expense_id, user_id, share_amount'),
        supabase.from('settlements').select('group_id, from_user, to_user, amount'),
        supabase.from('users').select('id, name'),
      ]);

      const firstError =
        membershipsRes.error ??
        groupsRes.error ??
        expensesRes.error ??
        splitsRes.error ??
        settlementsRes.error ??
        usersRes.error;
      if (firstError) throw firstError;

      const nameById = new Map((usersRes.data ?? []).map((user) => [user.id, user.name]));

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
          members: groupMembers
            .slice()
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((m) => ({ id: m.user_id, name: nameById.get(m.user_id) ?? 'Roommate' })),
        };
      });

      setSummaries(next);
      setExpenseCount((expensesRes.data ?? []).length);
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
    tables: ['memberships', 'groups', 'expenses', 'splits', 'settlements', 'users'],
    onChange: load,
  });

  const totals = useMemo(() => {
    const owed = summaries.reduce((sum, s) => sum + Math.max(0, s.netCents), 0);
    const owes = summaries.reduce((sum, s) => sum + Math.min(0, s.netCents), 0);
    return { owedToYouCents: owed, youOweCents: -owes };
  }, [summaries]);

  return { summaries, totals, expenseCount, loading, error, refresh: load };
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

export { sortMembers } from './members';
export type { MemberProfile } from './members';
