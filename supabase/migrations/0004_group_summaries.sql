-- ============================================================================
-- RoomLedger — one-query home screen
-- Apply after 0003_multiple_payers.sql. Safe to re-run.
--
-- The group list used to download every expense, every split and every
-- settlement across all of the user's groups and net them on the device.
-- That is six round trips and a payload that grows with the entire history,
-- just to render a handful of numbers.
--
-- This computes the same figures in Postgres and returns one row per group.
-- SECURITY INVOKER, so row-level security still applies exactly as before —
-- the function can only ever see what the caller could already read.
-- ============================================================================

create or replace function public.get_my_group_summaries()
returns table (
  group_id      uuid,
  name          text,
  join_code     text,
  created_at    timestamptz,
  role          text,
  member_count  integer,
  expense_count integer,
  my_net        numeric,
  members       jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with my_groups as (
    select m.group_id, m.role
    from public.memberships m
    where m.user_id = auth.uid()
  ),
  -- What each person put in. An expense with payer rows uses those; one
  -- without falls back to paid_by covering the whole amount, which the left
  -- join expresses directly.
  paid as (
    select e.group_id,
           coalesce(p.user_id, e.paid_by) as user_id,
           coalesce(p.amount, e.amount)   as amount
    from public.expenses e
    left join public.expense_payers p on p.expense_id = e.id
    where e.group_id in (select g.group_id from my_groups g)
  ),
  owed as (
    select e.group_id, s.user_id, s.share_amount as amount
    from public.expenses e
    join public.splits s on s.expense_id = e.id
    where e.group_id in (select g.group_id from my_groups g)
  ),
  -- Settlements move real money: paying counts like paying, being paid
  -- counts like consuming.
  settled as (
    select s.group_id, s.from_user as user_id, s.amount as amount from public.settlements s
    where s.group_id in (select g.group_id from my_groups g)
    union all
    select s.group_id, s.to_user, -s.amount from public.settlements s
    where s.group_id in (select g.group_id from my_groups g)
  ),
  totals as (
    select g.group_id,
           coalesce((select sum(p.amount) from paid p
                     where p.group_id = g.group_id and p.user_id = auth.uid()), 0)
         - coalesce((select sum(o.amount) from owed o
                     where o.group_id = g.group_id and o.user_id = auth.uid()), 0)
         + coalesce((select sum(s.amount) from settled s
                     where s.group_id = g.group_id and s.user_id = auth.uid()), 0) as my_net
    from my_groups g
  )
  select
    gr.id,
    gr.name,
    gr.join_code,
    gr.created_at,
    mg.role,
    (select count(*)::int from public.memberships m2 where m2.group_id = gr.id),
    (select count(*)::int from public.expenses e2 where e2.group_id = gr.id),
    t.my_net,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by m3.created_at, u.id)
        from public.memberships m3
        join public.users u on u.id = m3.user_id
        where m3.group_id = gr.id
      ),
      '[]'::jsonb
    )
  from my_groups mg
  join public.groups gr on gr.id = mg.group_id
  join totals t on t.group_id = mg.group_id
  order by gr.created_at desc;
$$;

revoke all on function public.get_my_group_summaries() from public;
grant execute on function public.get_my_group_summaries() to authenticated;

-- Supporting indexes for the aggregates above.
create index if not exists expenses_group_idx    on public.expenses (group_id);
create index if not exists settlements_from_idx  on public.settlements (from_user);
create index if not exists settlements_to_idx    on public.settlements (to_user);
create index if not exists splits_user_expense_idx on public.splits (user_id, expense_id);

notify pgrst, 'reload schema';
