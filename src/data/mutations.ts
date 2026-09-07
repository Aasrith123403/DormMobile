import { SplitLine, sumShares } from '../core/splits';
import { fromCents } from '../core/money';
import type {
  ChoreRow,
  EventRow,
  ExpenseRow,
  SettlementRow,
  SubscriptionRow,
  SupplyItemRow,
} from '../lib/database.types';
import { supabase } from '../lib/supabase';

export interface NewExpense {
  groupId: string;
  paidBy: string;
  createdBy: string;
  description: string;
  amountCents: number;
  splits: SplitLine[];
  receiptPath?: string | null;
  category?: string | null;
  payers?: { userId: string; paidCents: number }[] | null;
  repeatMonthly?: boolean;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function addOneMonth(from: Date): string {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();
  const lastOfNext = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(year, month + 1, Math.min(day, lastOfNext)));
  return shifted.toISOString().slice(0, 10);
}

function isUnknownColumnError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? '';
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message)
  );
}

export async function addExpense(input: NewExpense): Promise<ExpenseRow> {
  if (input.splits.length === 0) throw new Error('no_split_members');
  if (sumShares(input.splits) !== input.amountCents) {
    throw new Error('Split shares must add up to the expense total.');
  }

  const row = {
    group_id: input.groupId,
    paid_by: input.paidBy,
    created_by: input.createdBy,
    description: input.description.trim(),
    amount: fromCents(input.amountCents),
    receipt_url: input.receiptPath ?? null,
  };

  const optional = {
    category: input.category ?? null,
    ...(input.repeatMonthly
      ? {
          repeat_interval: 'monthly' as const,
          repeat_next_date: addOneMonth(new Date()),
        }
      : {}),
  };

  let { data: expense, error } = await supabase
    .from('expenses')
    .insert({ ...row, ...optional })
    .select()
    .single();

  if (error && isUnknownColumnError(error)) {
    warnOnce(
      'expense-columns',
      '[RoomLedger] optional expense columns missing — run supabase/apply_all.sql to enable categories and repeating expenses.'
    );
    ({ data: expense, error } = await supabase.from('expenses').insert(row).select().single());
  }

  if (error) throw error;
  if (input.payers && input.payers.length > 1) {
    const total = input.payers.reduce((sum, p) => sum + p.paidCents, 0);
    if (total !== input.amountCents) {
      await supabase.from('expenses').delete().eq('id', (expense as ExpenseRow).id);
      throw new Error('Payer amounts must add up to the expense total.');
    }

    const { error: payerError } = await supabase.from('expense_payers').insert(
      input.payers.map((payer) => ({
        expense_id: (expense as ExpenseRow).id,
        user_id: payer.userId,
        amount: fromCents(payer.paidCents),
      }))
    );

    if (payerError) {
      await supabase.from('expenses').delete().eq('id', (expense as ExpenseRow).id);
      throw payerError;
    }
  }

  const { error: splitError } = await supabase.from('splits').insert(
    input.splits.map((split) => ({
      expense_id: (expense as ExpenseRow).id,
      user_id: split.userId,
      share_amount: fromCents(split.shareCents),
    }))
  );

  if (splitError) {
    await supabase.from('expenses').delete().eq('id', (expense as ExpenseRow).id);
    throw splitError;
  }

  return expense as ExpenseRow;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

export async function recordSettlement(input: {
  groupId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  note?: string | null;
}): Promise<SettlementRow> {
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: input.groupId,
      from_user: input.fromUser,
      to_user: input.toUser,
      amount: fromCents(input.amountCents),
      note: input.note ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SettlementRow;
}

export async function addSubscription(input: {
  groupId: string;
  name: string;
  monthlyCostCents: number;
  paidBy: string;
  nextChargeDate: string;
  memberIds: string[];
  category?: string | null;
}): Promise<SubscriptionRow> {
  if (input.memberIds.length === 0) throw new Error('no_split_members');
  const row = {
    group_id: input.groupId,
    name: input.name.trim(),
    monthly_cost: fromCents(input.monthlyCostCents),
    paid_by: input.paidBy,
    next_charge_date: input.nextChargeDate,
  };

  let { data: subscription, error } = await supabase
    .from('subscriptions')
    .insert({ ...row, category: input.category ?? null })
    .select()
    .single();

  if (error && isUnknownColumnError(error)) {
    ({ data: subscription, error } = await supabase
      .from('subscriptions')
      .insert(row)
      .select()
      .single());
  }

  if (error) throw error;
  const { error: memberError } = await supabase.from('subscription_members').insert(
    input.memberIds.map((userId) => ({
      subscription_id: (subscription as SubscriptionRow).id,
      user_id: userId,
    }))
  );

  if (memberError) {
    await supabase.from('subscriptions').delete().eq('id', (subscription as SubscriptionRow).id);
    throw memberError;
  }

  return subscription as SubscriptionRow;
}

export async function setSubscriptionActive(subscriptionId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ active }).eq('id', subscriptionId);
  if (error) throw error;
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').delete().eq('id', subscriptionId);
  if (error) throw error;
}

export async function catchUpRepeatingExpenses(groupId: string): Promise<number> {
  const { data, error } = await supabase.rpc('generate_due_repeating_expenses', {
    p_group_id: groupId,
  });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

export async function catchUpSubscriptions(groupId: string): Promise<number> {
  const { data, error } = await supabase.rpc('generate_due_subscription_charges', {
    p_group_id: groupId,
  });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

export async function addSupplyItem(input: {
  groupId: string;
  name: string;
}): Promise<SupplyItemRow> {
  const { data, error } = await supabase
    .from('supply_items')
    .insert({ group_id: input.groupId, name: input.name.trim() })
    .select()
    .single();

  if (error) throw error;
  return data as SupplyItemRow;
}

export async function markSupplyNeeded(itemId: string, needed = true): Promise<void> {
  const { error } = await supabase.rpc('mark_supply_needed', {
    p_item_id: itemId,
    p_needed: needed,
  });
  if (error) throw error;
}

export async function buySupplyItem(input: {
  itemId: string;
  amountCents: number;
  description?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('buy_supply_item', {
    p_item_id: input.itemId,
    p_amount: fromCents(input.amountCents),
    p_description: input.description ?? null,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function addChore(input: {
  groupId: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  assignedTo?: string | null;
}): Promise<ChoreRow> {
  const row = {
    group_id: input.groupId,
    name: input.name.trim(),
    frequency: input.frequency,
  };

  let { data, error } = await supabase
    .from('chores')
    .insert({ ...row, assigned_to: input.assignedTo ?? null })
    .select()
    .single();

  if (error && isUnknownColumnError(error)) {
    warnOnce(
      'chore-assign',
      '[RoomLedger] chores.assigned_to missing — run supabase/apply_all.sql to assign chores to people.'
    );
    ({ data, error } = await supabase.from('chores').insert(row).select().single());
  }

  if (error) throw error;
  return data as ChoreRow;
}

export async function assignChore(choreId: string, userId: string | null): Promise<void> {
  const { error } = await supabase.rpc('assign_chore', {
    p_chore_id: choreId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function assignChores(
  pairs: { choreId: string; userId: string | null }[]
): Promise<number> {
  if (pairs.length === 0) return 0;
  const { data, error } = await supabase.rpc('assign_chores', {
    p_chore_ids: pairs.map((pair) => pair.choreId),
    p_user_ids: pairs.map((pair) => pair.userId),
  });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

export async function completeChore(choreId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_chore', { p_chore_id: choreId });
  if (error) throw error;
}

export async function deleteChore(choreId: string): Promise<void> {
  const { error } = await supabase.from('chores').delete().eq('id', choreId);
  if (error) throw error;
}

export async function deleteSupplyItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('supply_items').delete().eq('id', itemId);
  if (error) throw error;
}

export interface NewEvent {
  groupId: string;
  createdBy: string;
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  note?: string | null;
}

export async function addEvent(input: NewEvent): Promise<EventRow> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      group_id: input.groupId,
      created_by: input.createdBy,
      title: input.title.trim(),
      event_date: input.date,
      start_time: input.startTime ?? null,
      end_time: input.startTime ? (input.endTime ?? null) : null,
      location: input.location?.trim() || null,
      note: input.note?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as EventRow;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

export async function sendPing(input: {
  groupId: string;
  toUser?: string | null;
  note?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('send_ping', {
    p_group_id: input.groupId,
    p_to_user: input.toUser ?? null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function respondToPing(pingId: string, response: string): Promise<void> {
  const { error } = await supabase.rpc('respond_to_ping', {
    p_ping_id: pingId,
    p_response: response,
  });
  if (error) throw error;
}

export async function cancelPing(pingId: string): Promise<void> {
  const { error } = await supabase.from('pings').delete().eq('id', pingId);
  if (error) throw error;
}

export async function setGroupStatus(input: {
  groupId: string;
  userId: string;
  status: string;
  note?: string | null;
  place?: string | null;
  clearsInHours?: number | null;
}): Promise<void> {
  const clearsAt =
    input.clearsInHours && input.clearsInHours > 0
      ? new Date(Date.now() + input.clearsInHours * 3_600_000).toISOString()
      : null;

  const { error } = await supabase.from('group_status').upsert(
    {
      group_id: input.groupId,
      user_id: input.userId,
      status: input.status,
      note: input.note?.trim() || null,
      place: input.place ?? null,
      clears_at: clearsAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'group_id,user_id' }
  );
  if (error) throw error;
}
