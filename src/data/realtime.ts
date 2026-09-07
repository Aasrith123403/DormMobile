import { useEffect, useRef } from 'react';

import { supabase } from '../lib/supabase';

interface RealtimeRefreshOptions {
  channel: string;
  tables: string[];
  filter?: string;
  onChange: () => void | Promise<void>;
  enabled?: boolean;
}

let channelSequence = 0;

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
      for (const table of tableKey.split(',')) {
        subscription.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
          schedule
        );
      }

      subscription.subscribe();
    } catch (caught) {
      console.warn('[RoomLedger] realtime unavailable, falling back to manual refresh:', caught);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(subscription).catch(() => {
      });
    };
  }, [channel, tableKey, filter, enabled]);
}
