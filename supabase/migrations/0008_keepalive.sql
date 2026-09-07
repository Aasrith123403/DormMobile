-- ============================================================================
-- RoomLedger — keeping a free project awake
--
-- Apply after 0007_chore_assignments_and_events.sql.
-- Safe to re-run: every statement is idempotent.
--
-- Supabase pauses Free Plan projects after 7 days of low database activity,
-- and a paused project is simply unreachable until somebody restores it by
-- hand from the dashboard. No data is lost, but the app is down, and nobody
-- finds out until they open it.
--
-- The inactivity timer resets on *any* database activity, so the fix is a
-- scheduled write twice a week. That is what this table and function exist
-- for, and .github/workflows/keepalive.yml is what calls it.
--
-- Security shape, deliberately:
--   - The table has RLS on and NO policies, so it is completely unreachable
--     through the API. Not readable, not writable, by anyone.
--   - The only way to touch it is the SECURITY DEFINER function below, which
--     takes no arguments, returns nothing, and can only ever set one
--     timestamp on one row. Granting it to `anon` therefore adds no way to
--     read, infer or damage anything — the worst an abuser achieves is
--     keeping the project awake, which is the point.
-- ============================================================================

create table if not exists public.heartbeat (
  -- The check plus the primary key make a second row impossible.
  id        smallint primary key default 1 check (id = 1),
  last_seen timestamptz not null default now()
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

-- Any policy that may exist from an earlier run is removed: this table is
-- meant to have none at all.
drop policy if exists heartbeat_all on public.heartbeat;

/**
 * One timestamp write — enough database activity to reset the pause timer.
 *
 * Returns void rather than the row so it cannot be used as an oracle for
 * whether or when anyone last touched the project.
 */
create or replace function public.record_heartbeat()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.heartbeat set last_seen = now() where id = 1;
end;
$$;

revoke all on function public.record_heartbeat() from public;
grant execute on function public.record_heartbeat() to anon, authenticated;

notify pgrst, 'reload schema';
