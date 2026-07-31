import { SplitLine, sumShares } from '../core/splits';
import { fromCents } from '../core/money';
import type { ExpenseRow, SettlementRow, SubscriptionRow, SupplyItemRow } from '../lib/database.types';
import { supabase } from '../lib/supabase';

/* ------------------------------------------------------------- expenses -- */

export interface NewExpense {
  groupId: string;
  paidBy: string;
  createdBy: string;
  description: string;
  amountCents: number;
  splits: SplitLine[];
  /** Storage object path, e.g. "<group_id>/<uuid>.jpg". */
  receiptPath?: string | null;
  category?: string | null;
  /**
   * Set only when several people chipped in; their amounts must sum to the
   * total. A single payer just uses `paidBy`.
   */
  payers?: { userId: string; paidCents: number }[] | null;
}

/**
 * True when PostgREST reports a column the server does not have — i.e.
 * migration 0002 has not been applied yet. Categories are optional metadata,
 * so an expense should still save without one rather than fail outright.
 */
function isUnknownColumnError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? '';
  return code === 'PGRST204' || /column .*category.* does not exist/i.test(message);
}

/**
 * Writes the expense and one split row per included member.
 *
 * Postgres has no client-visible transaction here, so if the split insert
 * fails we delete the orphaned expense rather than leave a row that would
 * skew every balance in the group.
 */
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

  let { data: expense, error } = await supabase
    .from('expenses')
    .insert({ ...row, category: input.category ?? null })
    .select()
    .single();

  if (error && isUnknownColumnError(error)) {
    console.warn('[RoomLedger] expenses.category missing — apply 0002_categories.sql');
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
      // Same reasoning as the split rollback below: a half-written expense
      // would silently skew every balance in the group.
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
  // splits cascade with the expense.
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

/* ---------------------------------------------------------- settlements -- */

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

/* -------------------------------------------------------- subscriptions -- */

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

/** Generates any charges that came due while the app was closed. */
export async function catchUpSubscriptions(groupId: string): Promise<number> {
  const { data, error } = await supabase.rpc('generate_due_subscription_charges', {
    p_group_id: groupId,
  });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

/* -------------------------------------------------------------- supplies -- */

export async function addSupplyItem(input: {
  groupId: string;
  name: string;
  firstTurnUserId: string | null;
}): Promise<SupplyItemRow> {
  const { data, error } = await supabase
    .from('supply_items')
    .insert({
      group_id: input.groupId,
      name: input.name.trim(),
      current_turn_user_id: input.firstTurnUserId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SupplyItemRow;
}

/**
 * Logs the purchase as a group expense and advances the turn, in one
 * server-side step so the two can never drift apart.
 */
export async function logSupplyPurchase(input: {
  itemId: string;
  amountCents: number;
  description?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('log_supply_purchase', {
    p_item_id: input.itemId,
    p_amount: fromCents(input.amountCents),
    p_description: input.description ?? null,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function deleteSupplyItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('supply_items').delete().eq('id', itemId);
  if (error) throw error;
}

/* ---------------------------------------------------------------- status -- */

export async function setGroupStatus(input: {
  groupId: string;
  userId: string;
  status: string;
}): Promise<void> {
  const { error } = await supabase.from('group_status').upsert(
    {
      group_id: input.groupId,
      user_id: input.userId,
      status: input.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'group_id,user_id' }
  );
  if (error) throw error;
}
