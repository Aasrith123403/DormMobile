// Row shapes must be `type`, not `interface`: postgrest-js requires each Row
// to satisfy Record<string, unknown>, and an interface silently degrades every
// query result to `never`.
export type Uuid = string;

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
  category: string | null;
  supply_item_id: Uuid | null;
  repeat_interval: 'monthly' | null;
  repeat_next_date: IsoDateString | null;
  repeat_parent_id: Uuid | null;
  created_at: IsoTimestamp;
}

export type ExpensePayerRow = {
  expense_id: Uuid;
  user_id: Uuid;
  amount: Numeric;
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
  category: string | null;
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
  is_needed: boolean;
  needed_at: IsoTimestamp | null;
  needed_by: Uuid | null;
  last_bought_by: Uuid | null;
  last_bought_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

export type ChoreRow = {
  id: Uuid;
  group_id: Uuid;
  name: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  next_due: IsoDateString;
  assigned_to: Uuid | null;
  created_at: IsoTimestamp;
}

export type TimeString = string;

export type EventRow = {
  id: Uuid;
  group_id: Uuid;
  title: string;
  event_date: IsoDateString;
  start_time: TimeString | null;
  end_time: TimeString | null;
  location: string | null;
  note: string | null;
  created_by: Uuid | null;
  created_at: IsoTimestamp;
}

export type ChoreCompletionRow = {
  id: Uuid;
  chore_id: Uuid;
  user_id: Uuid;
  completed_at: IsoTimestamp;
}

export type GroupStatusRow = {
  group_id: Uuid;
  user_id: Uuid;
  status: string;
  note: string | null;
  place: string | null;
  clears_at: IsoTimestamp | null;
  updated_at: IsoTimestamp;
}

export type PingRow = {
  id: Uuid;
  group_id: Uuid;
  from_user: Uuid;
  to_user: Uuid | null;
  note: string | null;
  created_at: IsoTimestamp;
  response: 'omw' | 'soon' | 'cant' | null;
  responded_at: IsoTimestamp | null;
}

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
  category?: string | null;
  supply_item_id?: Uuid | null;
  repeat_interval?: 'monthly' | null;
  repeat_next_date?: IsoDateString | null;
  repeat_parent_id?: Uuid | null;
  created_at?: IsoTimestamp;
};

type SplitInsert = { expense_id: Uuid; user_id: Uuid; share_amount: NumericIn; id?: Uuid };

type ExpensePayerInsert = { expense_id: Uuid; user_id: Uuid; amount: NumericIn };

type ExpensePayerToExpense = {
  foreignKeyName: 'expense_payers_expense_id_fkey';
  columns: ['expense_id'];
  isOneToOne: false;
  referencedRelation: 'expenses';
  referencedColumns: ['id'];
};

type SubscriptionInsert = {
  group_id: Uuid;
  name: string;
  monthly_cost: NumericIn;
  paid_by: Uuid;
  next_charge_date: IsoDateString;
  id?: Uuid;
  active?: boolean;
  category?: string | null;
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
  note?: string | null;
  place?: string | null;
  clears_at?: IsoTimestamp | null;
  updated_at?: IsoTimestamp;
};

type EventInsert = {
  group_id: Uuid;
  title: string;
  event_date: IsoDateString;
  id?: Uuid;
  start_time?: TimeString | null;
  end_time?: TimeString | null;
  location?: string | null;
  note?: string | null;
  created_by?: Uuid | null;
};

type ChoreCompletionToChore = {
  foreignKeyName: 'chore_completions_chore_id_fkey';
  columns: ['chore_id'];
  isOneToOne: false;
  referencedRelation: 'chores';
  referencedColumns: ['id'];
};

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
      expense_payers: Table<
        ExpensePayerRow,
        ExpensePayerInsert,
        Partial<ExpensePayerInsert>,
        [ExpensePayerToExpense]
      >;
      subscriptions: Table<SubscriptionRow, SubscriptionInsert>;
      subscription_members: Table<
        SubscriptionMemberRow,
        SubscriptionMemberRow,
        Partial<SubscriptionMemberRow>,
        [SubscriptionMemberToSubscription]
      >;
      settlements: Table<SettlementRow, SettlementInsert>;
      supply_items: Table<SupplyItemRow, Pick<SupplyItemRow, 'group_id' | 'name'> & Partial<SupplyItemRow>>;
      chores: Table<ChoreRow, Pick<ChoreRow, 'group_id' | 'name'> & Partial<ChoreRow>>;
      chore_completions: Table<
        ChoreCompletionRow,
        Pick<ChoreCompletionRow, 'chore_id' | 'user_id'> & Partial<ChoreCompletionRow>,
        Partial<ChoreCompletionRow>,
        [ChoreCompletionToChore]
      >;
      group_status: Table<GroupStatusRow, GroupStatusInsert>;
      pings: Table<PingRow, Pick<PingRow, 'group_id' | 'from_user'> & Partial<PingRow>>;
      events: Table<EventRow, EventInsert>;
    };

    Views: {};
    Functions: {
      create_group: { Args: { p_name: string }; Returns: GroupRow };
      join_group_by_code: { Args: { p_code: string }; Returns: Uuid };
      generate_due_subscription_charges: { Args: { p_group_id: Uuid }; Returns: number };
      mark_supply_needed: { Args: { p_item_id: Uuid; p_needed?: boolean }; Returns: undefined };
      buy_supply_item: {
        Args: { p_item_id: Uuid; p_amount: number; p_description?: string | null };
        Returns: Uuid;
      };
      complete_chore: { Args: { p_chore_id: Uuid }; Returns: undefined };
      assign_chore: { Args: { p_chore_id: Uuid; p_user_id?: Uuid | null }; Returns: undefined };
      assign_chores: { Args: { p_chore_ids: Uuid[]; p_user_ids: (Uuid | null)[] }; Returns: number };
      send_ping: {
        Args: { p_group_id: Uuid; p_to_user?: Uuid | null; p_note?: string | null };
        Returns: Uuid;
      };
      respond_to_ping: { Args: { p_ping_id: Uuid; p_response: string }; Returns: undefined };
      generate_due_repeating_expenses: { Args: { p_group_id: Uuid }; Returns: number };
      get_my_group_summaries: {
        Args: Record<string, never>;
        Returns: {
          group_id: Uuid;
          name: string;
          join_code: string;
          created_at: IsoTimestamp;
          role: 'owner' | 'member';
          member_count: number;
          expense_count: number;
          my_net: Numeric;
          members: { id: Uuid; name: string }[];
        }[];
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
