/**
 * Expense categories. Pure: the catalogue, the auto-detection heuristic, and
 * the grouping maths all live here so they can be unit tested without a
 * database or a renderer.
 *
 * Categories exist to make logging faster, not to make it bureaucratic:
 * picking one is optional, and `detectCategory` guesses from what the user
 * already typed (or what OCR read off the receipt) so most expenses need no
 * extra tap at all.
 */

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
  /** Ionicons glyph name. */
  icon: string;
  /** Strong colour for the icon chip. */
  color: string;
  /** Tinted background behind the icon. */
  softColor: string;
}

export const CATEGORIES: Category[] = [
  { id: 'groceries', label: 'Groceries', icon: 'cart', color: '#059669', softColor: '#E6F5EF' },
  { id: 'dining', label: 'Dining', icon: 'restaurant', color: '#EA580C', softColor: '#FEF0E7' },
  { id: 'household', label: 'Household', icon: 'home', color: '#7C3AED', softColor: '#F1EBFE' },
  { id: 'utilities', label: 'Utilities', icon: 'flash', color: '#0891B2', softColor: '#E3F5F9' },
  { id: 'transport', label: 'Transport', icon: 'car', color: '#2563EB', softColor: '#E8EFFD' },
  { id: 'entertainment', label: 'Fun', icon: 'game-controller', color: '#DB2777', softColor: '#FDEBF3' },
  { id: 'travel', label: 'Travel', icon: 'airplane', color: '#B45309', softColor: '#FBF0E2' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#64748B', softColor: '#EFF1F5' },
];

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export const DEFAULT_CATEGORY: Category = BY_ID.get('other')!;

/** Always returns a category, so callers never branch on null. */
export function getCategory(id: string | null | undefined): Category {
  if (!id) return DEFAULT_CATEGORY;
  return BY_ID.get(id as CategoryId) ?? DEFAULT_CATEGORY;
}

export function isCategoryId(value: string | null | undefined): value is CategoryId {
  return Boolean(value) && BY_ID.has(value as CategoryId);
}

/**
 * Keyword hints, checked longest-first so "ice cream" beats "ice" and
 * "grocery store" beats "store".
 */
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

/**
 * Guesses a category from free text. Returns null when nothing matches, so
 * the caller can leave the choice to the user rather than mislabel it.
 */
export function detectCategory(text: string | null | undefined): CategoryId | null {
  const haystack = (text ?? '').toLowerCase().trim();
  if (!haystack) return null;

  let best: { category: CategoryId; length: number } | null = null;

  for (const entry of KEYWORDS) {
    for (const word of entry.words) {
      if (!haystack.includes(word)) continue;
      // Longer keyword = more specific match, so it wins.
      if (!best || word.length > best.length) {
        best = { category: entry.category, length: word.length };
      }
    }
  }

  return best?.category ?? null;
}

/* ------------------------------------------------------------ grouping -- */

export interface CategoryTotal {
  category: Category;
  totalCents: number;
  count: number;
  /** 0-100, share of the grand total. */
  percent: number;
}

/**
 * Totals per category, largest first. Percentages are rounded for display but
 * derived from exact cents, so the ordering never disagrees with the amounts.
 */
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
