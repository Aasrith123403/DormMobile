-- ============================================================================
-- RoomLedger — household features
--
-- NOTE ON THE FILENAME: this was specified as 0002_household.sql, but 0002,
-- 0003 and 0004 are already taken (categories, multiple payers, group
-- summaries). Numbering it 0005 keeps the apply order unambiguous.
--
-- Apply after 0004_group_summaries.sql, in the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent.
--
-- Design rule throughout: nothing here stores a schedule or a "whose turn"
-- pointer. Turns are DERIVED from what has already happened (who did it last,
-- who has done it least), so the roster can change and people can act out of
-- turn without anyone editing anything.
-- ============================================================================

-- ============================================================================
-- 1. SUPPLIES — "we're out" / "bought it"
-- ============================================================================

alter table public.supply_items
  add column if not exists is_needed      boolean     not null default false,
  add column if not exists needed_at      timestamptz,
  add column if not exists needed_by      uuid references public.users (id) on delete set null,
  add column if not exists last_bought_by uuid references public.users (id) on delete set null,
  add column if not exists last_bought_at timestamptz;

-- The old denormalised pointer is gone: the turn is computed from
-- last_bought_by plus each member's overall purchase count, so a stored
-- pointer could only ever disagree with reality.
alter table public.supply_items drop column if exists current_turn_user_id;

create index if not exists supply_items_needed_idx
  on public.supply_items (group_id) where is_needed;

-- Links a purchase back to the staple it was for. This is what makes "who has
-- bought least overall" derivable without a separate history table, and what
-- lets the feed say "Jay bought trash bags".
alter table public.expenses
  add column if not exists supply_item_id uuid references public.supply_items (id) on delete set null;

create index if not exists expenses_supply_item_idx
  on public.expenses (supply_item_id) where supply_item_id is not null;

-- One tap: flag a staple as out. Idempotent — tapping twice is harmless.
create or replace function public.mark_supply_needed(p_item_id uuid, p_needed boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item public.supply_items;
begin
  select * into item from public.supply_items where id = p_item_id;
  if item is null then
    raise exception 'supply_item_not_found';
  end if;
  if not public.is_group_member(item.group_id) then
    raise exception 'not_a_group_member';
  end if;

  update public.supply_items
  set is_needed = p_needed,
      needed_at = case when p_needed then now() else null end,
      needed_by = case when p_needed then auth.uid() else null end
  where id = p_item_id;
end;
$$;

-- The old single-purpose version is replaced by one that also clears the
-- needed flag and records the buyer, so "bought it" stays one tap.
drop function if exists public.log_supply_purchase(uuid, numeric, text);

/**
 * One tap: log the purchase as a group expense split evenly, clear the
 * "we're out" flag, and record who bought it so the rotation advances.
 */
create or replace function public.buy_supply_item(
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

  if coalesce(array_length(member_ids, 1), 0) = 0 then
    raise exception 'no_split_members';
  end if;

  insert into public.expenses (
    group_id, paid_by, description, amount, created_by, category, supply_item_id
  )
  values (
    item.group_id,
    auth.uid(),
    coalesce(nullif(btrim(p_description), ''), item.name),
    p_amount,
    auth.uid(),
    'household',
    item.id
  )
  returning id into new_expense;

  perform public.insert_even_splits(new_expense, member_ids, p_amount);

  update public.supply_items
  set is_needed      = false,
      needed_at      = null,
      needed_by      = null,
      last_bought_by = auth.uid(),
      last_bought_at = now()
  where id = item.id;

  return new_expense;
end;
$$;

revoke all on function public.mark_supply_needed(uuid, boolean) from public;
revoke all on function public.buy_supply_item(uuid, numeric, text) from public;
grant execute on function public.mark_supply_needed(uuid, boolean) to authenticated;
grant execute on function public.buy_supply_item(uuid, numeric, text) to authenticated;

-- ============================================================================
-- 2. CHORES — whose turn, shown not managed
-- ============================================================================

create table if not exists public.chores (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  frequency  text not null default 'weekly'
             check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  next_due   date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists chores_group_idx on public.chores (group_id);

create table if not exists public.chore_completions (
  id           uuid primary key default gen_random_uuid(),
  chore_id     uuid not null references public.chores (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  completed_at timestamptz not null default now()
);

create index if not exists chore_completions_chore_idx
  on public.chore_completions (chore_id, completed_at desc);

alter table public.chores            enable row level security;
alter table public.chore_completions enable row level security;
alter table public.chores            replica identity full;
alter table public.chore_completions replica identity full;

drop policy if exists chores_all on public.chores;
create policy chores_all on public.chores
  for all to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists chore_completions_all on public.chore_completions;
create policy chore_completions_all on public.chore_completions
  for all to authenticated
  using (
    exists (
      select 1 from public.chores c
      where c.id = chore_completions.chore_id and public.is_group_member(c.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.chores c
      where c.id = chore_completions.chore_id and public.is_group_member(c.group_id)
    )
  );

/**
 * One tap: record the completion and move the due date on. Whose turn it is
 * next is derived on read, so nothing here needs to decide it.
 */
create or replace function public.complete_chore(p_chore_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chore public.chores;
  step  int;
begin
  select * into chore from public.chores where id = p_chore_id;
  if chore is null then
    raise exception 'chore_not_found';
  end if;
  if not public.is_group_member(chore.group_id) then
    raise exception 'not_a_group_member';
  end if;

  insert into public.chore_completions (chore_id, user_id)
  values (chore.id, auth.uid());

  step := case chore.frequency
            when 'daily'    then 1
            when 'weekly'   then 7
            when 'biweekly' then 14
            when 'monthly'  then 30
            else 7
          end;

  -- From today, not from the old due date: a chore done late should not stay
  -- permanently behind.
  update public.chores
  set next_due = current_date + step
  where id = chore.id;
end;
$$;

revoke all on function public.complete_chore(uuid) from public;
grant execute on function public.complete_chore(uuid) to authenticated;

-- ============================================================================
-- 3. PRESENCE — extends the existing group_status
--    (specified as a new `member_status` table; group_status already is that
--     table in all but name, so it is extended rather than duplicated.)
-- ============================================================================

alter table public.group_status
  add column if not exists note      text,
  add column if not exists clears_at timestamptz;

-- Statuses that have aged out are simply not shown; nobody has to unset them.
create index if not exists group_status_clears_idx
  on public.group_status (clears_at) where clears_at is not null;

-- ============================================================================
-- 4. SELF-REPEATING EXPENSES
--    Mirrors the subscription catch-up: generate on open, made idempotent by
--    a partial unique index rather than by remembering what ran.
-- ============================================================================

alter table public.expenses
  add column if not exists repeat_interval   text
    check (repeat_interval is null or repeat_interval in ('monthly')),
  add column if not exists repeat_next_date  date,
  add column if not exists repeat_parent_id  uuid references public.expenses (id) on delete set null;

-- The template is the row the user marked "repeats"; copies point back at it.
create index if not exists expenses_repeat_template_idx
  on public.expenses (group_id, repeat_next_date) where repeat_interval is not null;

-- Two people opening the app on the 1st must not post the rent twice.
create unique index if not exists expenses_repeat_period_uniq
  on public.expenses (repeat_parent_id, charge_date)
  where repeat_parent_id is not null;

/**
 * Posts every missed copy of the group's repeating expenses and moves their
 * dates forward. Copies reuse the template's own split shares and payers, so
 * an unevenly split rent stays unevenly split.
 */
create or replace function public.generate_due_repeating_expenses(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  template  public.expenses;
  new_id    uuid;
  due       date;
  created   int := 0;
  guard     int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_group_id is null or not public.is_group_member(p_group_id) then
    raise exception 'not_a_group_member';
  end if;

  for template in
    select e.*
    from public.expenses e
    where e.group_id = p_group_id
      and e.repeat_interval is not null
      and e.repeat_next_date is not null
      and e.repeat_next_date <= current_date
    order by e.repeat_next_date
    for update of e skip locked
  loop
    due   := template.repeat_next_date;
    guard := 0;

    while due <= current_date and guard < 60 loop
      insert into public.expenses (
        group_id, paid_by, description, amount, created_by,
        category, charge_date, created_at, repeat_parent_id
      )
      values (
        template.group_id, template.paid_by, template.description, template.amount,
        template.created_by, template.category, due, due::timestamptz, template.id
      )
      on conflict (repeat_parent_id, charge_date) where repeat_parent_id is not null
      do nothing
      returning id into new_id;

      if new_id is not null then
        -- Same shares as the original, not an even re-split.
        insert into public.splits (expense_id, user_id, share_amount)
        select new_id, s.user_id, s.share_amount
        from public.splits s
        where s.expense_id = template.id;

        insert into public.expense_payers (expense_id, user_id, amount)
        select new_id, p.user_id, p.amount
        from public.expense_payers p
        where p.expense_id = template.id;

        created := created + 1;
        new_id  := null;
      end if;

      due   := due + interval '1 month';
      guard := guard + 1;
    end loop;

    update public.expenses set repeat_next_date = due where id = template.id;
  end loop;

  return created;
end;
$$;

revoke all on function public.generate_due_repeating_expenses(uuid) from public;
grant execute on function public.generate_due_repeating_expenses(uuid) to authenticated;

-- ============================================================================
-- 5. REALTIME
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['chores', 'chore_completions']
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
