export type CategoryId =
  | 'groceries'
  | 'dining'
  | 'household'
  | 'utilities'
  | 'transport'
  | 'entertainment'
  | 'travel'
  | 'other';

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
  softColor: string;
}

export const CATEGORIES: Category[] = [
  { id: 'groceries', label: 'Groceries', icon: 'cart', color: '#34D399', softColor: '#12352C' },
  { id: 'dining', label: 'Dining', icon: 'restaurant', color: '#FB923C', softColor: '#3A2415' },
  { id: 'household', label: 'Household', icon: 'home', color: '#A78BFA', softColor: '#2A2350' },
  { id: 'utilities', label: 'Utilities', icon: 'flash', color: '#22D3EE', softColor: '#0E3038' },
  { id: 'transport', label: 'Transport', icon: 'car', color: '#60A5FA', softColor: '#16294D' },
  { id: 'entertainment', label: 'Fun', icon: 'game-controller', color: '#F472B6', softColor: '#3A1F3D' },
  { id: 'travel', label: 'Travel', icon: 'airplane', color: '#FBBF24', softColor: '#3A2F16' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#94A3B8', softColor: '#242236' },
];

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export const DEFAULT_CATEGORY: Category = BY_ID.get('other')!;

export function getCategory(id: string | null | undefined): Category {
  if (!id) return DEFAULT_CATEGORY;
  return BY_ID.get(id as CategoryId) ?? DEFAULT_CATEGORY;
}

export function isCategoryId(value: string | null | undefined): value is CategoryId {
  return Boolean(value) && BY_ID.has(value as CategoryId);
}

const KEYWORDS: { category: CategoryId; words: string[] }[] = [
  {
    category: 'groceries',
    words: [
      'grocer', 'groceries', 'supermarket', 'trader joe', 'whole foods', 'safeway', 'kroger',
      'aldi', 'costco', 'walmart', 'produce', 'market', 'milk', 'eggs', 'bread',
    ],
  },
  {
    category: 'dining',
    words: [
      'restaurant', 'dinner', 'lunch', 'breakfast', 'brunch', 'takeout', 'take out', 'delivery',
      'pizza', 'sushi', 'burger', 'taco', 'chipotle', 'mcdonald', 'starbucks', 'coffee', 'cafe',
      'doordash', 'ubereats', 'uber eats', 'grubhub', 'thai', 'ramen', 'boba', 'snacks', 'bar tab',
    ],
  },
  {
    category: 'household',
    words: [
      'toilet paper', 'paper towel', 'trash bag', 'detergent', 'dish soap', 'soap', 'sponge',
      'cleaning', 'cleaner', 'supplies', 'target', 'ikea', 'furniture', 'lightbulb', 'batteries',
      'laundry',
    ],
  },
  {
    category: 'utilities',
    words: [
      'electric', 'electricity', 'gas bill', 'water bill', 'internet', 'wifi', 'wi-fi', 'utility',
      'utilities', 'comcast', 'xfinity', 'verizon', 'at&t', 'heating', 'rent',
    ],
  },
  {
    category: 'transport',
    words: [
      'uber', 'lyft', 'taxi', 'cab', 'bus', 'train', 'metro', 'subway', 'parking', 'gas station',
      'fuel', 'petrol', 'toll', 'bike', 'scooter', 'flight to',
    ],
  },
  {
    category: 'entertainment',
    words: [
      'movie', 'cinema', 'concert', 'ticket', 'netflix', 'spotify', 'hulu', 'disney', 'game',
      'bowling', 'museum', 'party', 'drinks', 'beer', 'wine',
    ],
  },
  {
    category: 'travel',
    words: [
      'hotel', 'airbnb', 'hostel', 'flight', 'airline', 'airfare', 'baggage', 'resort', 'lift ticket',
      'ski pass', 'rental car', 'trip',
    ],
  },
];

export function detectCategory(text: string | null | undefined): CategoryId | null {
  const haystack = (text ?? '').toLowerCase().trim();
  if (!haystack) return null;
  let best: { category: CategoryId; length: number } | null = null;
  for (const entry of KEYWORDS) {
    for (const word of entry.words) {
      if (!haystack.includes(word)) continue;
      if (!best || word.length > best.length) {
        best = { category: entry.category, length: word.length };
      }
    }
  }

  return best?.category ?? null;
}

export interface CategoryTotal {
  category: Category;
  totalCents: number;
  count: number;
  percent: number;
}

export function summarizeByCategory(
  expenses: { amountCents: number; category?: string | null }[]
): CategoryTotal[] {
  const totals = new Map<CategoryId, { totalCents: number; count: number }>();
  for (const expense of expenses) {
    const id = getCategory(expense.category).id;
    const current = totals.get(id) ?? { totalCents: 0, count: 0 };
    current.totalCents += expense.amountCents;
    current.count += 1;
    totals.set(id, current);
  }

  const grandTotal = [...totals.values()].reduce((sum, entry) => sum + entry.totalCents, 0);
  return [...totals.entries()]
    .map(([id, entry]) => ({
      category: getCategory(id),
      totalCents: entry.totalCents,
      count: entry.count,
      percent: grandTotal === 0 ? 0 : Math.round((entry.totalCents / grandTotal) * 100),
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.label.localeCompare(b.category.label));
}
