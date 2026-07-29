import { useEffect, useRef } from 'react';

import { supabase } from '../lib/supabase';

interface RealtimeRefreshOptions {
  /** Human-readable prefix; a unique suffix is appended per subscription. */
  channel: string;
  tables: string[];
  /** Optional PostgREST filter, e.g. `group_id=eq.<uuid>`. */
  filter?: string;
  onChange: () => void | Promise<void>;
  enabled?: boolean;
}

/**
 * supabase.channel(topic) returns the EXISTING channel when one with that
 * topic is already open, and a channel that has been subscribed rejects any
 * further `.on()` handlers. A fixed topic therefore breaks in two ordinary
 * situations: a modal mounting a second GroupProvider for the same group
 * while the tab screens still hold the first, and fast refresh, where
 * removeChannel() is async and the old channel outlives the cleanup.
 *
 * Every subscription gets its own topic instead. The server treats them as
 * independent subscriptions, and each is torn down with its own effect.
 */
let channelSequence = 0;

/**
 * Subscribes to Postgres changes and re-runs a loader when anything moves.
 *
 * Refetching rather than patching local state keeps derived balances honest:
 * a split row arriving without its expense would otherwise show a wrong total
 * for a frame. Dorm-sized ledgers are small, so the extra round-trip is
 * cheaper than the bookkeeping — and coalescing bursts (one expense insert
 * fires one expense event plus one per split) keeps it to a single fetch.
 */
export function useRealtimeRefresh({
  channel,
  tables,
  filter,
  onChange,
  enabled = true,
}: RealtimeRefreshOptions) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  const tableKey = tables.join(',');

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void callbackRef.current();
      }, 120);
    };

    channelSequence += 1;
    const subscription = supabase.channel(`${channel}-${channelSequence}`);

    try {
      // Every handler must be registered before subscribe() is called.
      for (const table of tableKey.split(',')) {
        subscription.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
          schedule
        );
      }

      subscription.subscribe();
    } catch (caught) {
      // Live updates are an enhancement, not a requirement — the screens all
      // load on mount and offer pull-to-refresh. Losing the socket should
      // never take down the ledger with an uncaught error.
      console.warn('[RoomLedger] realtime unavailable, falling back to manual refresh:', caught);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(subscription).catch(() => {
        /* channel may already be gone */
      });
    };
  }, [channel, tableKey, filter, enabled]);
}
