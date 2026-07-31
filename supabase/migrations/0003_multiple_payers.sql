-- ============================================================================
-- RoomLedger — expenses paid by more than one person
-- Apply after 0002_categories.sql. Safe to re-run.
--
-- `expenses.paid_by` stays as the single/primary payer so every existing row
-- keeps working untouched. When two or more people chip in, one row per payer
-- goes into `expense_payers` and the balance maths uses those instead. An
-- expense therefore has payer rows or it does not — there is no half state to
-- reconcile.
-- ============================================================================

create table if not exists public.expense_payers (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete restrict,
  amount     numeric(12, 2) not null check (amount > 0),
  primary key (expense_id, user_id)
);

create index if not exists expense_payers_expense_idx on public.expense_payers (expense_id);
create index if not exists expense_payers_user_idx    on public.expense_payers (user_id);

alter table public.expense_payers enable row level security;
alter table public.expense_payers replica identity full;

-- Same rule as splits: reachable only through an expense in one of your groups.
drop policy if exists expense_payers_select on public.expense_payers;
create policy expense_payers_select on public.expense_payers
  for select to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_payers.expense_id and public.is_group_member(e.group_id)
    )
  );

drop policy if exists expense_payers_write on public.expense_payers;
create policy expense_payers_write on public.expense_payers
  for all to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_payers.expense_id and public.is_group_member(e.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_payers.expense_id and public.is_group_member(e.group_id)
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expense_payers'
  ) then
    alter publication supabase_realtime add table public.expense_payers;
  end if;
end
$$;

notify pgrst, 'reload schema';
