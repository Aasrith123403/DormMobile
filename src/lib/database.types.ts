/**
 * Hand-maintained mirror of supabase/migrations/0001_init.sql.
 *
 * Regenerate instead of editing once the CLI is set up:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * Row shapes must be `type` aliases, never `interface`. postgrest-js requires
 * each Row to satisfy `Record<string, unknown>`, and interfaces get no
 * implicit index signature — an interface here silently degrades every query
 * result to `never`.
 */

export type Uuid = string;
/** Postgres `numeric` arrives over the wire as a string like "12.34". */
export type Numeric = string;
export type IsoDateString = string;
export type IsoTimestamp = string;

export type UserRow = {
  id: Uuid;
  name: string;
  avatar_url: string | null;
  venmo_username: string | null;
  created_at: IsoTimestamp;
}

export type GroupRow = {
  id: Uuid;
  name: string;
  created_by: Uuid;
  join_code: string;
  created_at: IsoTimestamp;
}

export type MembershipRow = {
  id: Uuid;
  group_id: Uuid;
  user_id: Uuid;
  role: 'owner' | 'member';
  created_at: IsoTimestamp;
}

export type ExpenseRow = {
  id: Uuid;
  group_id: Uuid;
  paid_by: Uuid;
  description: string;
  amount: Numeric;
  receipt_url: string | null;
  created_by: Uuid | null;
  subscription_id: Uuid | null;
  charge_date: IsoDateString | null;
  created_at: IsoTimestamp;
}

export type SplitRow = {
  id: Uuid;
  expense_id: Uuid;
  user_id: Uuid;
  share_amount: Numeric;
}

export type SubscriptionRow = {
  id: Uuid;
  group_id: Uuid;
  name: string;
  monthly_cost: Numeric;
  paid_by: Uuid;
  next_charge_date: IsoDateString;
  active: boolean;
  created_at: IsoTimestamp;
}

export type SubscriptionMemberRow = {
  subscription_id: Uuid;
  user_id: Uuid;
}

export type SettlementRow = {
  id: Uuid;
  group_id: Uuid;
  from_user: Uuid;
  to_user: Uuid;
  amount: Numeric;
  note: string | null;
  settled_at: IsoTimestamp;
}

export type SupplyItemRow = {
  id: Uuid;
  group_id: Uuid;
  name: string;
  current_turn_user_id: Uuid | null;
  created_at: IsoTimestamp;
}

export type GroupStatusRow = {
  group_id: Uuid;
  user_id: Uuid;
  status: string;
  updated_at: IsoTimestamp;
}

/**
 * Numeric columns come back from PostgREST as strings but are sent as JSON
 * numbers, so writes accept either.
 */
type NumericIn = number | string;

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>, Rels extends unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Rels;
};

type UserInsert = { id: Uuid; name?: string; avatar_url?: string | null; venmo_username?: string | null };

type ExpenseInsert = {
  group_id: Uuid;
  paid_by: Uuid;
  description: string;
  amount: NumericIn;
  id?: Uuid;
  receipt_url?: string | null;
  created_by?: Uuid | null;
  subscription_id?: Uuid | null;
  charge_date?: IsoDateString | null;
  created_at?: IsoTimestamp;
};

type SplitInsert = { expense_id: Uuid; user_id: Uuid; share_amount: NumericIn; id?: Uuid };

type SubscriptionInsert = {
  group_id: Uuid;
  name: string;
  monthly_cost: NumericIn;
  paid_by: Uuid;
  next_charge_date: IsoDateString;
  id?: Uuid;
  active?: boolean;
};

type SettlementInsert = {
  group_id: Uuid;
  from_user: Uuid;
  to_user: Uuid;
  amount: NumericIn;
  id?: Uuid;
  note?: string | null;
  settled_at?: IsoTimestamp;
};

type GroupStatusInsert = {
  group_id: Uuid;
  user_id: Uuid;
  status: string;
  updated_at?: IsoTimestamp;
};

/**
 * PostgREST resolves `expenses.select('*, splits(*)')` from the child's
 * foreign key, so the embeds used by the app need their relationship
 * declared here or the select-string parser rejects them.
 */
type SplitToExpense = {
  foreignKeyName: 'splits_expense_id_fkey';
  columns: ['expense_id'];
  isOneToOne: false;
  referencedRelation: 'expenses';
  referencedColumns: ['id'];
};

type SubscriptionMemberToSubscription = {
  foreignKeyName: 'subscription_members_subscription_id_fkey';
  columns: ['subscription_id'];
  isOneToOne: false;
  referencedRelation: 'subscriptions';
  referencedColumns: ['id'];
};

export type Database = {
  public: {
    Tables: {
      users: Table<UserRow, UserInsert>;
      groups: Table<GroupRow>;
      memberships: Table<MembershipRow, Pick<MembershipRow, 'group_id' | 'user_id'> & Partial<MembershipRow>>;
      expenses: Table<ExpenseRow, ExpenseInsert>;
      splits: Table<SplitRow, SplitInsert, Partial<SplitInsert>, [SplitToExpense]>;
      subscriptions: Table<SubscriptionRow, SubscriptionInsert>;
      subscription_members: Table<
        SubscriptionMemberRow,
        SubscriptionMemberRow,
        Partial<SubscriptionMemberRow>,
        [SubscriptionMemberToSubscription]
      >;
      settlements: Table<SettlementRow, SettlementInsert>;
      supply_items: Table<SupplyItemRow, Pick<SupplyItemRow, 'group_id' | 'name'> & Partial<SupplyItemRow>>;
      group_status: Table<GroupStatusRow, GroupStatusInsert>;
    };
    // Empty object literals (not Record<string, never>) so these still
    // satisfy postgrest-js's GenericSchema constraint.
    Views: {};
    Functions: {
      create_group: { Args: { p_name: string }; Returns: GroupRow };
      join_group_by_code: { Args: { p_code: string }; Returns: Uuid };
      // Group id is required: the all-groups variant is scheduler-only and is
      // deliberately not executable by client roles.
      generate_due_subscription_charges: { Args: { p_group_id: Uuid }; Returns: number };
      log_supply_purchase: {
        Args: { p_item_id: Uuid; p_amount: number; p_description?: string | null };
        Returns: Uuid;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
