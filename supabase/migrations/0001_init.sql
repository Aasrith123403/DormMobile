-- ============================================================================
-- RoomLedger — initial schema, row-level security, and helper routines
-- Apply in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Mirrors auth.users. Populated by the handle_new_user trigger below.
create table if not exists public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text        not null default '',
  avatar_url      text,
  -- Venmo handle (without the leading @). Used to build settle-up deep links.
  venmo_username  text,
  created_at      timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (length(btrim(name)) between 1 and 60),
  created_by  uuid        not null references public.users (id) on delete restrict,
  join_code   text        not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid        not null references public.groups (id) on delete cascade,
  user_id     uuid        not null references public.users (id) on delete cascade,
  role        text        not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists memberships_user_id_idx  on public.memberships (user_id);
create index if not exists memberships_group_id_idx on public.memberships (group_id);

create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid        not null references public.groups (id) on delete cascade,
  name              text        not null check (length(btrim(name)) between 1 and 80),
  monthly_cost      numeric(12, 2) not null check (monthly_cost > 0),
  paid_by           uuid        not null references public.users (id) on delete restrict,
  next_charge_date  date        not null,
  active            boolean     not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists subscriptions_group_id_idx on public.subscriptions (group_id);
create index if not exists subscriptions_due_idx      on public.subscriptions (next_charge_date)
  where active;

create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid        not null references public.groups (id) on delete cascade,
  paid_by         uuid        not null references public.users (id) on delete restrict,
  description     text        not null check (length(btrim(description)) between 1 and 140),
  amount          numeric(12, 2) not null check (amount > 0),
  receipt_url     text,
  created_by      uuid        references public.users (id) on delete set null,
  -- Set when this expense was auto-generated from a recurring subscription.
  subscription_id uuid        references public.subscriptions (id) on delete set null,
  charge_date     date,
  created_at      timestamptz not null default now()
);

create index if not exists expenses_group_created_idx on public.expenses (group_id, created_at desc);

-- Guarantees subscription catch-up can run repeatedly without duplicating charges.
create unique index if not exists expenses_subscription_period_uniq
  on public.expenses (subscription_id, charge_date)
  where subscription_id is not null;

create table if not exists public.splits (
  id            uuid primary key default gen_random_uuid(),
  expense_id    uuid        not null references public.expenses (id) on delete cascade,
  user_id       uuid        not null references public.users (id) on delete cascade,
  share_amount  numeric(12, 2) not null,
  unique (expense_id, user_id)
);

create index if not exists splits_expense_id_idx on public.splits (expense_id);
create index if not exists splits_user_id_idx    on public.splits (user_id);

create table if not exists public.subscription_members (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  primary key (subscription_id, user_id)
);

create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid        not null references public.groups (id) on delete cascade,
  from_user   uuid        not null references public.users (id) on delete restrict,
  to_user     uuid        not null references public.users (id) on delete restrict,
  amount      numeric(12, 2) not null check (amount > 0),
  note        text,
  settled_at  timestamptz not null default now(),
  check (from_user <> to_user)
);

create index if not exists settlements_group_idx on public.settlements (group_id, settled_at desc);

-- Stretch: whose turn it is to buy shared staples.
create table if not exists public.supply_items (
  id                    uuid primary key default gen_random_uuid(),
  group_id              uuid        not null references public.groups (id) on delete cascade,
  name                  text        not null check (length(btrim(name)) between 1 and 60),
  current_turn_user_id  uuid        references public.users (id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists supply_items_group_idx on public.supply_items (group_id);

-- Stretch: lightweight presence ("studying", "asleep", "friends over").
create table if not exists public.group_status (
  group_id    uuid        not null references public.groups (id) on delete cascade,
  user_id     uuid        not null references public.users (id) on delete cascade,
  status      text        not null check (length(btrim(status)) between 1 and 40),
  updated_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Realtime DELETE events carry the full old row.
alter table public.expenses      replica identity full;
alter table public.splits        replica identity full;
alter table public.settlements   replica identity full;
alter table public.subscriptions replica identity full;
alter table public.supply_items  replica identity full;
alter table public.group_status  replica identity full;
alter table public.memberships   replica identity full;

-- ============================================================================
-- 2. HELPER FUNCTIONS
--    SECURITY DEFINER so policies can consult memberships without recursing
--    back through the memberships policy.
-- ============================================================================

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = gid
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- True when the caller shares at least one group with the given user.
create or replace function public.shares_group_with(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid()
      and theirs.user_id = uid
  );
$$;

-- Unambiguous alphabet: no O/0, I/1, etc.
create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  for attempt in 1..20 loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from public.groups g where g.join_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'could_not_generate_unique_join_code';
end;
$$;

-- Splits a total into whole cents across members, handing the leftover cents
-- to the first members in the array so the shares always sum to the total.
create or replace function public.insert_even_splits(
  p_expense_id uuid,
  p_user_ids   uuid[],
  p_total      numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n           int    := coalesce(array_length(p_user_ids, 1), 0);
  total_cents bigint := round(p_total * 100);
  base        bigint;
  rem         bigint;
begin
  if n = 0 then
    raise exception 'no_split_members';
  end if;

  base := total_cents / n;
  rem  := total_cents - (base * n);

  insert into public.splits (expense_id, user_id, share_amount)
  select p_expense_id,
         u.uid,
         ((base + case when u.rn <= rem then 1 else 0 end)::numeric / 100)
  from (
    select uid, row_number() over () as rn
    from unnest(p_user_ids) as uid
  ) u
  on conflict (expense_id, user_id) do nothing;
end;
$$;

-- ============================================================================
-- 3. AUTH TRIGGER — mirror auth.users into public.users
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'roommate'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 4. RPCs — the only writes that must cross a group boundary
-- ============================================================================

-- Creating a group and its owner membership has to be atomic: without the
-- membership the creator could not read back the group they just made.
create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'group_name_required';
  end if;

  insert into public.groups (name, created_by, join_code)
  values (btrim(p_name), auth.uid(), public.generate_join_code())
  returning * into g;

  insert into public.memberships (group_id, user_id, role)
  values (g.id, auth.uid(), 'owner');

  return g;
end;
$$;

-- A prospective member cannot SELECT the group yet, so the lookup must run
-- as definer. Returns the group id; idempotent if already a member.
create or replace function public.join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id into g_id
  from public.groups
  where join_code = upper(btrim(coalesce(p_code, '')));

  if g_id is null then
    raise exception 'invalid_join_code';
  end if;

  insert into public.memberships (group_id, user_id, role)
  values (g_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return g_id;
end;
$$;

-- Internal worker: generates every missed charge and advances the dates.
-- Performs NO authorisation of its own, so it must never be granted to a
-- client role — the two wrappers below are the only supported entry points.
-- Passing null covers every group and is reserved for the scheduler.
create or replace function public.generate_subscription_charges_internal(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sub         public.subscriptions;
  member_ids  uuid[];
  new_expense uuid;
  due         date;
  created     int := 0;
  guard       int;
begin
  for sub in
    select s.*
    from public.subscriptions s
    where s.active
      and s.next_charge_date <= current_date
      and (p_group_id is null or s.group_id = p_group_id)
    order by s.next_charge_date
    for update of s skip locked
  loop
    -- Included members; fall back to the whole group if none were recorded.
    select coalesce(array_agg(sm.user_id order by sm.user_id), '{}')
      into member_ids
    from public.subscription_members sm
    join public.memberships m
      on m.group_id = sub.group_id and m.user_id = sm.user_id
    where sm.subscription_id = sub.id;

    if coalesce(array_length(member_ids, 1), 0) = 0 then
      select coalesce(array_agg(m.user_id order by m.user_id), '{}')
        into member_ids
      from public.memberships m
      where m.group_id = sub.group_id;
    end if;

    if coalesce(array_length(member_ids, 1), 0) = 0 then
      continue;
    end if;

    due   := sub.next_charge_date;
    guard := 0;

    while due <= current_date and guard < 60 loop
      insert into public.expenses (
        group_id, paid_by, description, amount,
        created_by, subscription_id, charge_date, created_at
      )
      values (
        sub.group_id, sub.paid_by, sub.name, sub.monthly_cost,
        sub.paid_by, sub.id, due, due::timestamptz
      )
      on conflict (subscription_id, charge_date) where subscription_id is not null
      do nothing
      returning id into new_expense;

      if new_expense is not null then
        perform public.insert_even_splits(new_expense, member_ids, sub.monthly_cost);
        created := created + 1;
        new_expense := null;
      end if;

      due   := due + interval '1 month';
      guard := guard + 1;
    end loop;

    update public.subscriptions
    set next_charge_date = due
    where id = sub.id;
  end loop;

  return created;
end;
$$;

-- Client entry point: one group, and only if the caller is a member of it.
-- The group id is required — without that, a signed-in user could trigger
-- generation across every group in the database, since the worker runs as
-- definer and bypasses RLS.
-- Definer so it can reach the internal worker; auth.uid() still resolves to
-- the real caller because it reads the request's JWT claims, not the
-- executing role, so the membership check below is genuine.
create or replace function public.generate_due_subscription_charges(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_group_id is null then
    raise exception 'group_id_required';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'not_a_group_member';
  end if;

  return public.generate_subscription_charges_internal(p_group_id);
end;
$$;

-- Scheduler entry point: every group. Never granted to a client role; pg_cron
-- runs it as the database owner.
create or replace function public.generate_all_due_subscription_charges()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.generate_subscription_charges_internal(null);
$$;

-- Records a purchase for a shared staple: logs an expense split across the
-- whole group and hands the turn to the next member.
create or replace function public.log_supply_purchase(
  p_item_id     uuid,
  p_amount      numeric,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item        public.supply_items;
  member_ids  uuid[];
  new_expense uuid;
  idx         int;
begin
  select * into item from public.supply_items where id = p_item_id;
  if item is null then
    raise exception 'supply_item_not_found';
  end if;
  if not public.is_group_member(item.group_id) then
    raise exception 'not_a_group_member';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select coalesce(array_agg(m.user_id order by m.created_at, m.user_id), '{}')
    into member_ids
  from public.memberships m
  where m.group_id = item.group_id;

  insert into public.expenses (group_id, paid_by, description, amount, created_by)
  values (
    item.group_id,
    auth.uid(),
    coalesce(nullif(btrim(p_description), ''), item.name),
    p_amount,
    auth.uid()
  )
  returning id into new_expense;

  perform public.insert_even_splits(new_expense, member_ids, p_amount);

  -- Advance the turn to the member after whoever just bought.
  idx := coalesce(array_position(member_ids, auth.uid()), 0);
  update public.supply_items
  set current_turn_user_id = member_ids[(idx % array_length(member_ids, 1)) + 1]
  where id = item.id;

  return new_expense;
end;
$$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
--    Rule: you may only touch rows belonging to a group you are a member of.
-- ============================================================================

alter table public.users                enable row level security;
alter table public.groups               enable row level security;
alter table public.memberships          enable row level security;
alter table public.expenses             enable row level security;
alter table public.splits               enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.subscription_members enable row level security;
alter table public.settlements          enable row level security;
alter table public.supply_items         enable row level security;
alter table public.group_status         enable row level security;

-- ---------------------------------------------------------------- users ----
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- --------------------------------------------------------------- groups ----
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id));

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated
  using (public.is_group_owner(id));

-- ---------------------------------------------------------- memberships ----
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_group_member(group_id));

-- Only a group's creator self-inserts directly; everyone else arrives through
-- join_group_by_code(), which runs as definer.
drop policy if exists memberships_insert_creator on public.memberships;
create policy memberships_insert_creator on public.memberships
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (user_id = auth.uid() or public.is_group_owner(group_id));

-- ------------------------------------------------------------- expenses ----
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_owner(group_id))
  )
  with check (public.is_group_member(group_id));

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or paid_by = auth.uid() or public.is_group_owner(group_id))
  );

-- --------------------------------------------------------------- splits ----
drop policy if exists splits_select on public.splits;
create policy splits_select on public.splits
  for select to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists splits_write on public.splits;
create policy splits_write on public.splits
  for all to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id and public.is_group_member(e.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = splits.expense_id and public.is_group_member(e.group_id)
    )
  );

-- -------------------------------------------------------- subscriptions ----
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions
  for all to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- ------------------------------------------------- subscription_members ----
drop policy if exists subscription_members_all on public.subscription_members;
create policy subscription_members_all on public.subscription_members
  for all to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_members.subscription_id
        and public.is_group_member(s.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_members.subscription_id
        and public.is_group_member(s.group_id)
    )
  );

-- ---------------------------------------------------------- settlements ----
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and (from_user = auth.uid() or to_user = auth.uid())
  );

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements
  for delete to authenticated
  using (public.is_group_member(group_id) and from_user = auth.uid());

-- --------------------------------------------------------- supply_items ----
drop policy if exists supply_items_all on public.supply_items;
create policy supply_items_all on public.supply_items
  for all to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- --------------------------------------------------------- group_status ----
drop policy if exists group_status_select on public.group_status;
create policy group_status_select on public.group_status
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists group_status_write on public.group_status;
create policy group_status_write on public.group_status
  for all to authenticated
  using (public.is_group_member(group_id) and user_id = auth.uid())
  with check (public.is_group_member(group_id) and user_id = auth.uid());

-- ============================================================================
-- 6. FUNCTION GRANTS
-- ============================================================================

grant execute on function public.is_group_member(uuid)   to authenticated;
grant execute on function public.is_group_owner(uuid)    to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;

revoke all on function public.create_group(text)                       from public;
revoke all on function public.join_group_by_code(text)                 from public;
revoke all on function public.generate_due_subscription_charges(uuid)  from public;
revoke all on function public.log_supply_purchase(uuid, numeric, text) from public;
revoke all on function public.insert_even_splits(uuid, uuid[], numeric) from public;
revoke all on function public.generate_join_code()                     from public;

-- Never reachable from a client: these bypass RLS with no membership check.
revoke all on function public.generate_subscription_charges_internal(uuid) from public;
revoke all on function public.generate_all_due_subscription_charges()      from public;

grant execute on function public.create_group(text)                       to authenticated;
grant execute on function public.join_group_by_code(text)                 to authenticated;
grant execute on function public.generate_due_subscription_charges(uuid)  to authenticated;
grant execute on function public.log_supply_purchase(uuid, numeric, text) to authenticated;

-- ============================================================================
-- 7. STORAGE — private "receipts" bucket, read via signed URLs
--    Object path convention: <group_id>/<uuid>.jpg
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and public.is_group_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and public.is_group_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and public.is_group_member((split_part(name, '/', 1))::uuid)
  );

-- ============================================================================
-- 8. REALTIME
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'splits', 'settlements', 'subscriptions',
    'subscription_members', 'memberships', 'supply_items', 'group_status', 'users'
  ]
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

-- ============================================================================
-- 9. OPTIONAL — nightly subscription charge generation via pg_cron
--    The app also catches up on open, so this is belt-and-braces.
--    Enable pg_cron under Database -> Extensions first, then run this block.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('roomledger-subscription-charges')
    where exists (
      select 1 from cron.job where jobname = 'roomledger-subscription-charges'
    );

    perform cron.schedule(
      'roomledger-subscription-charges',
      '5 7 * * *',
      $cron$ select public.generate_all_due_subscription_charges(); $cron$
    );
  end if;
end
$$;
