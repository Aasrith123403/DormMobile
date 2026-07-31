import type { RealtimeChannel } from '@supabase/supabase-js';

import { toCents } from '../core/money';
import type {
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

/**
 * One cache entry per group, shared by every mounted GroupProvider.
 *
 * The group tabs and any modal opened over them (add expense, settle up,
 * group info) all want the same data. A provider per mount meant duplicate
 * fetches and duplicate realtime subscriptions, so the data lives here
 * instead: the first subscriber starts the load and opens the socket, the
 * last one to leave tears both down.
 */

export interface LedgerExpense extends ExpenseRow {
  amountCents: number;
  splits: { userId: string; shareCents: number }[];
  /** Empty unless several people chipped in. */
  payers: { userId: string; paidCents: number }[];
}

export interface GroupSubscription extends SubscriptionRow {
  monthlyCostCents: number;
  memberIds: string[];
}

export interface GroupSnapshot {
  group: GroupRow | null;
  members: MemberProfile[];
  expenses: LedgerExpense[];
  settlements: SettlementRow[];
  subscriptions: GroupSubscription[];
  supplyItems: SupplyItemRow[];
  statuses: GroupStatusRow[];
  loading: boolean;
  error: string | null;
}

/**
 * Shared initial value. useSyncExternalStore compares snapshots by identity,
 * so this must be a stable constant — a fresh object per call would loop.
 */
export const EMPTY_SNAPSHOT: GroupSnapshot = Object.freeze({
  group: null,
  members: [],
  expenses: [],
  settlements: [],
  subscriptions: [],
  supplyItems: [],
  statuses: [],
  loading: true,
  error: null,
}) as GroupSnapshot;

interface GroupEntry {
  snapshot: GroupSnapshot;
  listeners: Set<() => void>;
  teardownRealtime: (() => void) | null;
  /** The load currently running, if any; concurrent callers join it. */
  inFlight: Promise<void> | null;
  /** A refresh was requested mid-fetch and must run once it finishes. */
  refreshAgain: boolean;
  caughtUp: boolean;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, GroupEntry>();

/**
 * Grace period before a group with no subscribers is discarded. Navigating
 * between tabs and dismissing a modal both briefly drop to zero listeners,
 * and re-fetching every time would undo the point of the cache.
 */
const DISPOSE_DELAY_MS = 15_000;

let channelSequence = 0;

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

/* ------------------------------------------------------------- loading -- */

async function fetchGroup(groupId: string): Promise<void> {
  try {
    const [groupRes, membershipRes, expenseRes, settlementRes, subscriptionRes, supplyRes, statusRes] =
      await Promise.all([
        supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
        supabase.from('memberships').select('*').eq('group_id', groupId),
        supabase
          .from('expenses')
          .select('*, splits(user_id, share_amount), expense_payers(user_id, amount)')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false }),
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
      ]);

    const firstError =
      groupRes.error ??
      membershipRes.error ??
      expenseRes.error ??
      settlementRes.error ??
      subscriptionRes.error ??
      supplyRes.error ??
      statusRes.error;
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

      supplyItems: (supplyRes.data ?? []) as SupplyItemRow[],
      statuses: (statusRes.data ?? []) as GroupStatusRow[],
      loading: false,
      error: null,
    });
  } catch (caught) {
    setSnapshot(groupId, { loading: false, error: (caught as Error).message });
  }
}

/**
 * Reloads a group.
 *
 * Concurrent calls join the in-flight request rather than stacking, but a
 * request made *during* a fetch sets a dirty flag and runs again afterwards:
 * the in-flight read reflects the database as of when it started, so a change
 * arriving mid-fetch would otherwise be invisible until the next event.
 */
export function refreshGroup(groupId: string): Promise<void> {
  // Nobody is watching this group — don't resurrect a disposed entry.
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

/** Coalesces realtime bursts: one expense insert fires an event per split. */
function scheduleRefresh(groupId: string): void {
  const entry = entries.get(groupId);
  if (!entry) return;

  if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
  entry.refreshTimer = setTimeout(() => {
    entry.refreshTimer = null;
    void refreshGroup(groupId);
  }, 120);
}

/* ------------------------------------------------------------ realtime -- */

function startRealtime(groupId: string): () => void {
  const channels: RealtimeChannel[] = [];

  const open = (suffix: string, tables: string[], filter?: string) => {
    channelSequence += 1;
    // A fresh topic every time: supabase.channel() hands back an existing
    // channel on a topic match, and a subscribed channel rejects new
    // handlers.
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
      ['expenses', 'settlements', 'subscriptions', 'supply_items', 'group_status', 'memberships'],
      `group_id=eq.${groupId}`
    );
    // splits and subscription_members carry no group_id to filter on; RLS
    // still limits the stream to rows in the user's own groups.
    open('-links', ['splits', 'subscription_members', 'expense_payers']);
  } catch (caught) {
    console.warn('[RoomLedger] realtime unavailable, falling back to manual refresh:', caught);
  }

  return () => {
    for (const channel of channels) {
      void supabase.removeChannel(channel).catch(() => {
        /* already gone */
      });
    }
  };
}

/* ------------------------------------------------------- subscriptions -- */

export function getGroupSnapshot(groupId: string): GroupSnapshot {
  return entries.get(groupId)?.snapshot ?? EMPTY_SNAPSHOT;
}

/**
 * Registers a listener and keeps the group alive while it is mounted.
 * Shaped for useSyncExternalStore: returns its own unsubscribe.
 */
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
      // Catch-up on open: generate any subscription charges that came due
      // while the app was closed, so balances are already correct by the
      // time the ledger renders.
      void supabase
        .rpc('generate_due_subscription_charges', { p_group_id: groupId })
        .then(({ error }) => {
          if (error) {
            console.warn('[RoomLedger] subscription catch-up skipped:', error.message);
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

    // Tabs and modals both drop to zero listeners in passing, so wait before
    // throwing the data away.
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

/**
 * Drops every cached group. Called on sign-out so the next account cannot
 * see the previous one's ledger while its own data loads.
 */
export function clearGroupCache(): void {
  const stale = [...entries.values()];
  // Drop everything first: a still-mounted screen must not be able to read a
  // half-cleared entry, and the next subscribe has to start from scratch
  // rather than find an entry whose listeners are already non-empty and so
  // never re-runs the first-subscriber setup.
  entries.clear();

  for (const entry of stale) {
    entry.teardownRealtime?.();
    entry.teardownRealtime = null;
    if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
    if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
    entry.snapshot = EMPTY_SNAPSHOT;

    // Wake any still-mounted screens so they re-render empty rather than
    // showing the signed-out account's rows.
    for (const listener of entry.listeners) listener();
  }
}
