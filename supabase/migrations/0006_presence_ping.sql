-- ============================================================================
-- RoomLedger — self-declared place + "come here" ping
--
-- Apply after 0005_household.sql. Safe to re-run.
--
-- There is no location data here in any technical sense. `place` is a short
-- label the member picks from a fixed list and can clear at any time; the app
-- never reads GPS, never runs in the background, and never stores a
-- coordinate. It is a status word that happens to be about where someone is,
-- with exactly the same privacy properties as "asleep".
--
-- Pings are deliberately ephemeral: the app only ever reads recent ones, and
-- the optional cron job at the bottom deletes them outright.
-- ============================================================================

-- ============================================================================
-- 1. SELF-DECLARED PLACE
--    Extends the existing group_status (specified as `member_status`; that
--    table already is member status in all but name).
-- ============================================================================

alter table public.group_status
  add column if not exists place text
    check (place is null or length(btrim(place)) between 1 and 40);

-- ============================================================================
-- 2. PINGS
-- ============================================================================

create table if not exists public.pings (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_user    uuid not null references public.users (id) on delete cascade,
  -- Null means the whole group.
  to_user      uuid references public.users (id) on delete cascade,
  note         text check (note is null or length(btrim(note)) <= 120),
  created_at   timestamptz not null default now(),
  response     text check (response is null or response in ('omw', 'soon', 'cant')),
  responded_at timestamptz,
  -- A response without a time, or vice versa, would be a half-written row.
  check ((response is null) = (responded_at is null))
);

create index if not exists pings_group_recent_idx
  on public.pings (group_id, created_at desc);

alter table public.pings enable row level security;
alter table public.pings replica identity full;

drop policy if exists pings_select on public.pings;
create policy pings_select on public.pings
  for select to authenticated
  using (public.is_group_member(group_id));

-- You can only send as yourself, and only into a group you belong to.
drop policy if exists pings_insert on public.pings;
create policy pings_insert on public.pings
  for insert to authenticated
  with check (public.is_group_member(group_id) and from_user = auth.uid());

-- The sender can take a ping back; nobody else can delete one.
drop policy if exists pings_delete on public.pings;
create policy pings_delete on public.pings
  for delete to authenticated
  using (public.is_group_member(group_id) and from_user = auth.uid());

/**
 * One tap: nudge one person, or the whole group when p_to_user is null.
 */
create or replace function public.send_ping(
  p_group_id uuid,
  p_to_user  uuid default null,
  p_note     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'not_a_group_member';
  end if;

  -- Pinging someone outside the group would leak the group's existence.
  if p_to_user is not null and not exists (
    select 1 from public.memberships m
    where m.group_id = p_group_id and m.user_id = p_to_user
  ) then
    raise exception 'recipient_not_in_group';
  end if;

  insert into public.pings (group_id, from_user, to_user, note)
  values (p_group_id, auth.uid(), p_to_user, nullif(btrim(p_note), ''))
  returning id into new_id;

  return new_id;
end;
$$;

/**
 * One tap back: "on my way", "soon", or "can't".
 *
 * Only the addressee may answer a direct ping. A group-wide ping can be
 * answered by any member, and holds a single answer — the first reply stands,
 * which is all "is anyone coming?" actually needs.
 */
create or replace function public.respond_to_ping(p_ping_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ping public.pings;
begin
  if p_response not in ('omw', 'soon', 'cant') then
    raise exception 'invalid_response';
  end if;

  select * into ping from public.pings where id = p_ping_id;
  if ping is null then
    raise exception 'ping_not_found';
  end if;
  if not public.is_group_member(ping.group_id) then
    raise exception 'not_a_group_member';
  end if;
  if ping.to_user is not null and ping.to_user <> auth.uid() then
    raise exception 'not_your_ping';
  end if;
  if ping.from_user = auth.uid() then
    raise exception 'cannot_answer_your_own_ping';
  end if;

  update public.pings
  set response = p_response, responded_at = now()
  where id = p_ping_id;
end;
$$;

revoke all on function public.send_ping(uuid, uuid, text) from public;
revoke all on function public.respond_to_ping(uuid, text) from public;
grant execute on function public.send_ping(uuid, uuid, text) to authenticated;
grant execute on function public.respond_to_ping(uuid, text) to authenticated;

-- ============================================================================
-- 3. REALTIME
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pings'
  ) then
    alter publication supabase_realtime add table public.pings;
  end if;
end
$$;

-- ============================================================================
-- 4. OPTIONAL — actually delete old pings
--    The app only ever reads recent ones, so this is about not hoarding data
--    rather than about correctness. Needs pg_cron enabled.
-- ============================================================================

create or replace function public.prune_old_pings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed int;
begin
  delete from public.pings where created_at < now() - interval '24 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_old_pings() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('roomledger-prune-pings')
    where exists (select 1 from cron.job where jobname = 'roomledger-prune-pings');

    perform cron.schedule(
      'roomledger-prune-pings',
      '17 * * * *',
      $cron$ select public.prune_old_pings(); $cron$
    );
  end if;
end
$$;

notify pgrst, 'reload schema';
