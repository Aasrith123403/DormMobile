-- ============================================================================
-- RoomLedger — expense categories
-- Apply after 0001_init.sql. Safe to re-run.
--
-- Categories are optional metadata: the column is nullable and everything
-- without one is treated as "Other" by the app, so existing rows need no
-- backfill and nothing breaks if a client is on an older build.
-- ============================================================================

alter table public.expenses
  add column if not exists category text;

-- Keeps the app's catalogue and the database in agreement. Adding a category
-- later means updating this constraint and src/core/categories.ts together.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_category_check'
  ) then
    alter table public.expenses
      add constraint expenses_category_check
      check (
        category is null
        or category in (
          'groceries', 'dining', 'household', 'utilities',
          'transport', 'entertainment', 'travel', 'other'
        )
      );
  end if;
end
$$;

-- Insights group by category within a group, most-recent first.
create index if not exists expenses_group_category_idx
  on public.expenses (group_id, category);

-- Subscriptions carry a category through to the expenses they generate.
alter table public.subscriptions
  add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_category_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_category_check
      check (
        category is null
        or category in (
          'groceries', 'dining', 'household', 'utilities',
          'transport', 'entertainment', 'travel', 'other'
        )
      );
  end if;
end
$$;

-- Auto-generated charges inherit the plan's category. Replaces the worker
-- from 0001 with an identical body apart from the category passthrough.
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
        created_by, subscription_id, charge_date, created_at, category
      )
      values (
        sub.group_id, sub.paid_by, sub.name, sub.monthly_cost,
        sub.paid_by, sub.id, due, due::timestamptz, sub.category
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

revoke all on function public.generate_subscription_charges_internal(uuid) from public;

-- Supply purchases are household spending by definition.
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

  insert into public.expenses (group_id, paid_by, description, amount, created_by, category)
  values (
    item.group_id,
    auth.uid(),
    coalesce(nullif(btrim(p_description), ''), item.name),
    p_amount,
    auth.uid(),
    'household'
  )
  returning id into new_expense;

  perform public.insert_even_splits(new_expense, member_ids, p_amount);

  idx := coalesce(array_position(member_ids, auth.uid()), 0);
  update public.supply_items
  set current_turn_user_id = member_ids[(idx % array_length(member_ids, 1)) + 1]
  where id = item.id;

  return new_expense;
end;
$$;

revoke all on function public.log_supply_purchase(uuid, numeric, text) from public;
grant execute on function public.log_supply_purchase(uuid, numeric, text) to authenticated;

-- PostgREST caches the schema; nudge it so the new column is visible at once.
notify pgrst, 'reload schema';
