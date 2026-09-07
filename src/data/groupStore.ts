import type { RealtimeChannel } from '@supabase/supabase-js';

import { toCents } from '../core/money';
import type {
  ChoreCompletionRow,
  ChoreRow,
  EventRow,
  PingRow,
  ExpenseRow,
  GroupRow,
  GroupStatusRow,
  MembershipRow,
  SettlementRow,
  SubscriptionRow,
  SupplyItemRow,
  UserRow,
} from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { MemberProfile, sortMembers } from './members';

export interface LedgerExpense extends ExpenseRow {
  amountCents: number;
  splits: { userId: string; shareCents: number }[];
  payers: { userId: string; paidCents: number }[];
}

export interface GroupSubscription extends SubscriptionRow {
  monthlyCostCents: number;
  memberIds: string[];
}

export interface GroupChore extends ChoreRow {
  completions: ChoreCompletionRow[];
}

export interface GroupSnapshot {
  group: GroupRow | null;
  members: MemberProfile[];
  expenses: LedgerExpense[];
  settlements: SettlementRow[];
  subscriptions: GroupSubscription[];
  supplyItems: SupplyItemRow[];
  chores: GroupChore[];
  statuses: GroupStatusRow[];
  pings: PingRow[];
  events: EventRow[];
  loading: boolean;
  error: string | null;
}

export const EMPTY_SNAPSHOT: GroupSnapshot = Object.freeze({
  group: null,
  members: [],
  expenses: [],
  settlements: [],
  subscriptions: [],
  supplyItems: [],
  chores: [],
  statuses: [],
  pings: [],
  events: [],
  loading: true,
  error: null,
}) as GroupSnapshot;

interface GroupEntry {
  snapshot: GroupSnapshot;
  listeners: Set<() => void>;
  teardownRealtime: (() => void) | null;
  inFlight: Promise<void> | null;
  refreshAgain: boolean;
  caughtUp: boolean;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, GroupEntry>();

const DISPOSE_DELAY_MS = 15_000;

let channelSequence = 0;

const degraded = { payers: false, chores: false, pings: false, events: false };
let warnedCatchUp = false;

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = error.message ?? '';
  return (
    code === 'PGRST200' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703' ||
    /could not find (a relationship|the table)/i.test(message) ||
    /does not exist/i.test(message)
  );
}

function getEntry(groupId: string): GroupEntry {
  let entry = entries.get(groupId);
  if (!entry) {
    entry = {
      snapshot: EMPTY_SNAPSHOT,
      listeners: new Set(),
      teardownRealtime: null,
      inFlight: null,
      refreshAgain: false,
      caughtUp: false,
      refreshTimer: null,
      disposeTimer: null,
    };
    entries.set(groupId, entry);
  }
  return entry;
}

function setSnapshot(groupId: string, patch: Partial<GroupSnapshot>): void {
  const entry = entries.get(groupId);
  if (!entry) return;
  entry.snapshot = { ...entry.snapshot, ...patch };
  for (const listener of entry.listeners) listener();
}

async function fetchExpenses(groupId: string) {
  const base = supabase
    .from('expenses')
    .select('*, splits(user_id, share_amount)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (degraded.payers) return base;
  const withPayers = await supabase
    .from('expenses')
    .select('*, splits(user_id, share_amount), expense_payers(user_id, amount)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (!withPayers.error) return withPayers;
  if (isMissingSchema(withPayers.error)) {
    degraded.payers = true;
    console.warn(
      '[RoomLedger] expense_payers missing — run supabase/apply_all.sql to enable paying separately.'
    );
    return base;
  }

  return withPayers;
}

async function fetchPings(groupId: string) {
  if (degraded.pings) return { data: [], error: null };
  const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const result = await supabase
    .from('pings')
    .select('*')
    .eq('group_id', groupId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!result.error) return result;
  if (isMissingSchema(result.error)) {
    degraded.pings = true;
    console.warn('[RoomLedger] pings missing — run supabase/apply_all.sql to enable pings.');
    return { data: [], error: null };
  }

  return result;
}

async function fetchEvents(groupId: string) {
  if (degraded.events) return { data: [], error: null };
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);

  const result = await supabase
    .from('events')
    .select('*')
    .eq('group_id', groupId)
    .gte('event_date', since)
    .order('event_date');

  if (!result.error) return result;
  if (isMissingSchema(result.error)) {
    degraded.events = true;
    console.warn('[RoomLedger] events missing — run supabase/apply_all.sql to enable the calendar.');
    return { data: [], error: null };
  }

  return result;
}

async function fetchChores(groupId: string) {
  if (degraded.chores) return { data: [], error: null };
  const result = await supabase
    .from('chores')
    .select('*, chore_completions(id, chore_id, user_id, completed_at)')
    .eq('group_id', groupId)
    .order('next_due');

  if (!result.error) return result;
  if (isMissingSchema(result.error)) {
    degraded.chores = true;
    console.warn('[RoomLedger] chores missing — run supabase/apply_all.sql to enable chores.');
    return { data: [], error: null };
  }

  return result;
}

async function fetchGroup(groupId: string): Promise<void> {
  try {
    const [
      groupRes,
      membershipRes,
      expenseRes,
      settlementRes,
      subscriptionRes,
      supplyRes,
      statusRes,
      choreRes,
      pingRes,
      eventRes,
    ] = await Promise.all([
        supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
        supabase.from('memberships').select('*').eq('group_id', groupId),
        fetchExpenses(groupId),
        supabase
          .from('settlements')
          .select('*')
          .eq('group_id', groupId)
          .order('settled_at', { ascending: false }),
        supabase
          .from('subscriptions')
          .select('*, subscription_members(user_id)')
          .eq('group_id', groupId)
          .order('next_charge_date', { ascending: true }),
        supabase.from('supply_items').select('*').eq('group_id', groupId).order('created_at'),
        supabase.from('group_status').select('*').eq('group_id', groupId),
        fetchChores(groupId),
        fetchPings(groupId),
        fetchEvents(groupId),
      ]);

    const firstError =
      groupRes.error ??
      membershipRes.error ??
      expenseRes.error ??
      settlementRes.error ??
      subscriptionRes.error ??
      supplyRes.error ??
      statusRes.error ??
      choreRes.error ??
      pingRes.error ??
      eventRes.error;
    if (firstError) throw firstError;
    const memberships = (membershipRes.data ?? []) as MembershipRow[];
    const profileRes = memberships.length
      ? await supabase
          .from('users')
          .select('*')
          .in('id', memberships.map((m) => m.user_id))
      : { data: [] as UserRow[], error: null };
    if (profileRes.error) throw profileRes.error;
    const profileById = new Map((profileRes.data ?? []).map((u) => [u.id, u as UserRow]));
    setSnapshot(groupId, {
      group: (groupRes.data as GroupRow | null) ?? null,
      members: sortMembers(
        memberships.map((membership) => {
          const profile = profileById.get(membership.user_id);
          return {
            id: membership.user_id,
            name: profile?.name || 'Roommate',
            avatar_url: profile?.avatar_url ?? null,
            venmo_username: profile?.venmo_username ?? null,
            created_at: profile?.created_at ?? membership.created_at,
            role: membership.role,
            joinedAt: membership.created_at,
          };
        })
      ),

      expenses: (
        (expenseRes.data ?? []) as (ExpenseRow & {
          splits: { user_id: string; share_amount: string }[];
          expense_payers: { user_id: string; amount: string }[];
        })[]
      ).map((row) => ({
        ...row,
        amountCents: toCents(row.amount),
        splits: (row.splits ?? []).map((split) => ({
          userId: split.user_id,
          shareCents: toCents(split.share_amount),
        })),
        payers: (row.expense_payers ?? []).map((payer) => ({
          userId: payer.user_id,
          paidCents: toCents(payer.amount),
        })),
      })),

      settlements: (settlementRes.data ?? []) as SettlementRow[],
      subscriptions: (
        (subscriptionRes.data ?? []) as (SubscriptionRow & {
          subscription_members: { user_id: string }[];
        })[]
      ).map((row) => ({
        ...row,
        monthlyCostCents: toCents(row.monthly_cost),
        memberIds: (row.subscription_members ?? []).map((m) => m.user_id),
      })),

      supplyItems: ((supplyRes.data ?? []) as Partial<SupplyItemRow>[]).map((row) => ({
        ...(row as SupplyItemRow),
        is_needed: row.is_needed ?? false,
        needed_at: row.needed_at ?? null,
        needed_by: row.needed_by ?? null,
        last_bought_by: row.last_bought_by ?? null,
        last_bought_at: row.last_bought_at ?? null,
      })),

      chores: ((choreRes.data ?? []) as unknown as (Partial<ChoreRow> & {
        chore_completions: ChoreCompletionRow[];
      })[]).map(
        (row) => ({
          ...(row as ChoreRow),
          assigned_to: row.assigned_to ?? null,
          completions: [...(row.chore_completions ?? [])].sort((a, b) =>
            b.completed_at.localeCompare(a.completed_at)
          ),
        })
      ),

      statuses: ((statusRes.data ?? []) as Partial<GroupStatusRow>[]).map((row) => ({
        ...(row as GroupStatusRow),
        note: row.note ?? null,
        place: row.place ?? null,
        clears_at: row.clears_at ?? null,
      })),

      pings: (pingRes.data ?? []) as unknown as PingRow[],
      events: (eventRes.data ?? []) as unknown as EventRow[],
      loading: false,
      error: null,
    });
  } catch (caught) {
    setSnapshot(groupId, { loading: false, error: (caught as Error).message });
  }
}

export function refreshGroup(groupId: string): Promise<void> {
  const entry = entries.get(groupId);
  if (!entry) return Promise.resolve();
  if (entry.inFlight) {
    entry.refreshAgain = true;
    return entry.inFlight;
  }

  const request = fetchGroup(groupId).finally(() => {
    const current = entries.get(groupId);
    if (!current) return;
    current.inFlight = null;
    if (current.refreshAgain) {
      current.refreshAgain = false;
      void refreshGroup(groupId);
    }
  });

  entry.inFlight = request;
  return request;
}

function scheduleRefresh(groupId: string): void {
  const entry = entries.get(groupId);
  if (!entry) return;
  if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
  entry.refreshTimer = setTimeout(() => {
    entry.refreshTimer = null;
    void refreshGroup(groupId);
  }, 120);
}

function startRealtime(groupId: string): () => void {
  const channels: RealtimeChannel[] = [];
  const open = (suffix: string, tables: string[], filter?: string) => {
    channelSequence += 1;
    const channel = supabase.channel(`group-${groupId}${suffix}-${channelSequence}`);
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => scheduleRefresh(groupId)
      );
    }

    channel.subscribe();
    channels.push(channel);
  };

  try {
    open(
      '',
      [
        'expenses',
        'settlements',
        'subscriptions',
        'supply_items',
        'group_status',
        'memberships',
        'chores',
        'pings',
        'events',
      ],
      `group_id=eq.${groupId}`
    );

    open('-links', ['splits', 'subscription_members', 'expense_payers', 'chore_completions']);
  } catch (caught) {
    console.warn('[RoomLedger] realtime unavailable, falling back to manual refresh:', caught);
  }

  return () => {
    for (const channel of channels) {
      void supabase.removeChannel(channel).catch(() => {
      });
    }
  };
}

export function getGroupSnapshot(groupId: string): GroupSnapshot {
  return entries.get(groupId)?.snapshot ?? EMPTY_SNAPSHOT;
}

export function subscribeToGroup(groupId: string, listener: () => void): () => void {
  const entry = getEntry(groupId);
  const isFirst = entry.listeners.size === 0;
  entry.listeners.add(listener);
  if (entry.disposeTimer) {
    clearTimeout(entry.disposeTimer);
    entry.disposeTimer = null;
  }

  if (isFirst) {
    if (!entry.teardownRealtime) entry.teardownRealtime = startRealtime(groupId);
    if (!entry.caughtUp) {
      entry.caughtUp = true;
      void Promise.all([
        supabase.rpc('generate_due_subscription_charges', { p_group_id: groupId }),
        supabase.rpc('generate_due_repeating_expenses', { p_group_id: groupId }),
      ])
        .then((results) => {
          for (const { error } of results) {
            if (error && !warnedCatchUp) {
              warnedCatchUp = true;
              console.warn(
                '[RoomLedger] recurring catch-up unavailable — run supabase/apply_all.sql.'
              );
            }
          }
        })
        .then(() => refreshGroup(groupId));
    } else {
      void refreshGroup(groupId);
    }
  }

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0) return;
    entry.disposeTimer = setTimeout(() => disposeGroup(groupId), DISPOSE_DELAY_MS);
  };
}

function disposeGroup(groupId: string): void {
  const entry = entries.get(groupId);
  if (!entry || entry.listeners.size > 0) return;
  entry.teardownRealtime?.();
  if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
  if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
  entries.delete(groupId);
}

export function clearGroupCache(): void {
  const stale = [...entries.values()];
  entries.clear();
  for (const entry of stale) {
    entry.teardownRealtime?.();
    entry.teardownRealtime = null;
    if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
    if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
    entry.snapshot = EMPTY_SNAPSHOT;
    for (const listener of entry.listeners) listener();
  }
}
