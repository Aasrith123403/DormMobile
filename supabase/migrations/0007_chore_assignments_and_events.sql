-- ============================================================================
-- RoomLedger — chore assignments + the shared calendar
--
-- Apply after 0006_presence_ping.sql, in the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent.
--
-- Two changes, and one reversal of an earlier decision:
--
--   1. Chores get a real owner. 0005 derived whose turn it was from history
--      and stored nothing, which is fair but answers a question nobody asked
--      out loud — people want to *decide* who does the bathroom and then see
--      that decision. `assigned_to` is that decision. It stays optional:
--      leaving it null keeps the derived rotation exactly as it was, so
--      groups that liked the old behaviour lose nothing.
--
--   2. A group calendar. Dates and clock times are stored as `date` and
--      `time`, not `timestamptz`, on purpose: "dinner at 7" means seven
--      o'clock where the house is, and a timestamp would quietly become 6 or
--      8 for anyone whose phone reports a different zone.
-- ============================================================================

-- ============================================================================
-- 1. CHORES — an owner you choose, not just a turn we compute
-- ============================================================================

alter table public.chores
  add column if not exists assigned_to uuid references public.users (id) on delete set null;

comment on column public.chores.assigned_to is
  'Explicit owner. Null means fall back to the derived rotation from 0005.';

create index if not exists chores_assigned_idx
  on public.chores (group_id, assigned_to);

/**
 * Assign a chore to a member, or pass null to hand it back to the rotation.
 *
 * Goes through a function rather than a plain update because the chores RLS
 * policy checks the *chore's* group, not the assignee's: without this you
 * could put a housemate's name on a chore in a group they are not in.
 */
create or replace function public.assign_chore(p_chore_id uuid, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chore public.chores;
begin
  select * into chore from public.chores where id = p_chore_id;
  if chore is null then
    raise exception 'chore_not_found';
  end if;
  if not public.is_group_member(chore.group_id) then
    raise exception 'not_a_group_member';
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.group_id = chore.group_id and m.user_id = p_user_id
  ) then
    raise exception 'assignee_not_in_group';
  end if;

  update public.chores set assigned_to = p_user_id where id = chore.id;
end;
$$;

revoke all on function public.assign_chore(uuid, uuid) from public;
grant execute on function public.assign_chore(uuid, uuid) to authenticated;

/**
 * Assign several chores in one round trip.
 *
 * The assign screen hands out every unassigned chore at once ("split them
 * evenly"), and doing that as N separate updates would let the roster show a
 * half-finished split if the network dropped between them.
 *
 * Takes matched arrays rather than a composite type so the client can send
 * plain JSON. A null entry in p_user_ids returns that chore to the rotation.
 */
create or replace function public.assign_chores(p_chore_ids uuid[], p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i       int;
  changed int := 0;
begin
  if coalesce(array_length(p_chore_ids, 1), 0) <> coalesce(array_length(p_user_ids, 1), 0) then
    raise exception 'length_mismatch';
  end if;

  for i in 1 .. coalesce(array_length(p_chore_ids, 1), 0) loop
    perform public.assign_chore(p_chore_ids[i], p_user_ids[i]);
    changed := changed + 1;
  end loop;

  return changed;
end;
$$;

revoke all on function public.assign_chores(uuid[], uuid[]) from public;
grant execute on function public.assign_chores(uuid[], uuid[]) to authenticated;

-- ============================================================================
-- 2. EVENTS — the shared calendar
-- ============================================================================

create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 80),
  -- Local wall-clock, deliberately. See the header note.
  event_date date not null,
  -- Null start_time means an all-day entry ("move-out day").
  start_time time,
  end_time   time,
  location   text check (location is null or length(location) <= 80),
  note       text check (note is null or length(note) <= 280),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- An event that ends before it starts is a typo, not a plan.
  constraint events_time_order check (
    start_time is null or end_time is null or end_time > start_time
  ),
  -- An end time without a start has nothing to end.
  constraint events_end_needs_start check (end_time is null or start_time is not null)
);

create index if not exists events_group_date_idx on public.events (group_id, event_date);

alter table public.events enable row level security;
alter table public.events replica identity full;

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

-- Anyone in the house can fix a time or a place: a shared calendar that only
-- its author can correct is a calendar people stop trusting.
drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- Deleting is narrower than editing — removing something from everyone's
-- calendar is the one action here that loses information.
drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (created_by = auth.uid() or public.is_group_owner(group_id));

-- ============================================================================
-- 3. REALTIME
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['events']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
