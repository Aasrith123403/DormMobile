import { FeedInput, buildFeed, feedTimeAgo } from '../feed';

const NAMES: Record<string, string> = { ana: 'Ana', ben: 'Ben', cass: 'Cass' };

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const input = (overrides: Partial<FeedInput> = {}): FeedInput => ({
  viewerId: 'ana',
  nameOf: (id) => (id === 'ana' ? 'You' : (NAMES[id ?? ''] ?? 'Someone')),
  expenses: [],
  supplyItems: [],
  chores: [],
  statuses: [],
  settlements: [],
  upcoming: [],
  lastMonth: null,
  today: '2026-07-15',
  ...overrides,
});

describe('buildFeed', () => {
  it('produces nothing for a brand new group', () => {
    expect(buildFeed(input())).toEqual([]);
  });

  it('reports an expense in plain language', () => {
    const feed = buildFeed(
      input({
        expenses: [
          {
            id: 'e1',
            description: 'Pizza',
            amountCents: 2400,
            paidBy: 'ben',
            createdAt: hoursAgo(2),
          },
        ],
      })
    );

    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('Ben paid for Pizza');
    expect(feed[0].amountCents).toBe(2400);
    expect(feed[0].kind).toBe('expense');
  });

  it('phrases a supply run as buying the thing', () => {
    const feed = buildFeed(
      input({
        supplyItems: [
          { id: 's1', name: 'Trash bags', isNeeded: false, neededAt: null, neededBy: null, turnUserId: 'ana' },
        ],
        expenses: [
          {
            id: 'e1',
            description: 'Trash bags',
            amountCents: 900,
            paidBy: 'ben',
            createdAt: hoursAgo(3),
            supplyItemId: 's1',
          },
        ],
      })
    );

    expect(feed[0].title).toBe('Ben bought trash bags');
    expect(feed[0].kind).toBe('supply-bought');
  });

  it('tells the viewer when a needed staple is their turn', () => {
    const feed = buildFeed(
      input({
        supplyItems: [
          {
            id: 's1',
            name: 'Dish soap',
            isNeeded: true,
            neededAt: hoursAgo(1),
            neededBy: 'ben',
            turnUserId: 'ana',
          },
        ],
      })
    );

    expect(feed[0].title).toBe("Out of dish soap — you're up");
    expect(feed[0].actionable).toBe(true);
  });

  it('names the right person when it is not the viewer', () => {
    const feed = buildFeed(
      input({
        supplyItems: [
          {
            id: 's1',
            name: 'Dish soap',
            isNeeded: true,
            neededAt: hoursAgo(1),
            neededBy: 'ana',
            turnUserId: 'ben',
          },
        ],
      })
    );

    expect(feed[0].title).toBe('Out of dish soap');
    expect(feed[0].detail).toBe("Ben's turn to buy.");
    expect(feed[0].actionable).toBe(false);
  });

  it('reports a completed chore', () => {
    const feed = buildFeed(
      input({
        chores: [
          {
            id: 'c1',
            name: 'Bathroom',
            nextDue: '2026-07-22',
            turnUserId: 'ben',
            completions: [{ id: 'x1', userId: 'cass', completedAt: hoursAgo(5) }],
          },
        ],
      })
    );

    expect(feed.map((e) => e.title)).toContain('Cass did bathroom');
  });

  it('surfaces an overdue chore as actionable for whoever is up', () => {
    const feed = buildFeed(
      input({
        chores: [
          { id: 'c1', name: 'Trash', nextDue: '2026-07-13', turnUserId: 'ana', completions: [] },
        ],
      })
    );

    const entry = feed.find((e) => e.id === 'chore-due-c1')!;
    expect(entry.title).toBe('Trash is yours');
    expect(entry.detail).toBe('2 days overdue');
    expect(entry.actionable).toBe(true);
  });

  it('does not surface a chore that is not due yet', () => {
    const feed = buildFeed(
      input({
        chores: [
          { id: 'c1', name: 'Trash', nextDue: '2026-07-20', turnUserId: 'ana', completions: [] },
        ],
      })
    );

    expect(feed.find((e) => e.id === 'chore-due-c1')).toBeUndefined();
  });

  it('previews recurring money that is about to post', () => {
    const feed = buildFeed(
      input({
        upcoming: [{ id: 'r1', name: 'Rent', amountCents: 120_000, dueDate: '2026-07-18' }],
      })
    );

    expect(feed[0].title).toBe('Rent posts in 3 days');
    expect(feed[0].amountCents).toBe(120_000);
  });

  it('ignores recurring money further out than a week', () => {
    const feed = buildFeed(
      input({ upcoming: [{ id: 'r1', name: 'Rent', amountCents: 1000, dueDate: '2026-08-30' }] })
    );
    expect(feed).toEqual([]);
  });

  it('includes a settlement', () => {
    const feed = buildFeed(
      input({
        settlements: [
          { id: 'st1', fromUser: 'ben', toUser: 'cass', amountCents: 1500, settledAt: hoursAgo(6) },
        ],
      })
    );

    expect(feed[0].title).toBe('Ben paid Cass');
    expect(feed[0].detail).toBe('Settled up');
  });

  it('shows housemates statuses but not the viewer own', () => {
    const feed = buildFeed(
      input({
        statuses: [
          { userId: 'ben', status: 'Asleep', updatedAt: hoursAgo(1) },
          { userId: 'ana', status: 'Free', updatedAt: hoursAgo(1) },
        ],
      })
    );

    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('Ben is asleep');
  });

  it('reports last month spend once', () => {
    const feed = buildFeed(
      input({
        lastMonth: { month: '2026-06', label: 'Jun 2026', totalCents: 31_200, byCategory: [] },
      })
    );

    expect(feed[0].title).toBe('The house spent $312.00 in Jun 2026');
  });

  it('omits a month summary when nothing was spent', () => {
    const feed = buildFeed(
      input({ lastMonth: { month: '2026-06', label: 'Jun 2026', totalCents: 0, byCategory: [] } })
    );
    expect(feed).toEqual([]);
  });

  it('puts anything the viewer can act on first', () => {
    const feed = buildFeed(
      input({
        expenses: [
          { id: 'e1', description: 'Pizza', amountCents: 2400, paidBy: 'ben', createdAt: hoursAgo(1) },
        ],
        supplyItems: [
          {
            id: 's1',
            name: 'Dish soap',
            isNeeded: true,
            neededAt: hoursAgo(20),
            neededBy: 'ben',
            turnUserId: 'ana',
          },
        ],
      })
    );

    expect(feed[0].actionable).toBe(true);
    expect(feed[0].kind).toBe('supply-needed');
  });

  it('orders history newest first', () => {
    const feed = buildFeed(
      input({
        expenses: [
          { id: 'old', description: 'Old', amountCents: 100, paidBy: 'ben', createdAt: hoursAgo(48) },
          { id: 'new', description: 'New', amountCents: 100, paidBy: 'ben', createdAt: hoursAgo(1) },
        ],
      })
    );

    expect(feed.map((e) => e.id)).toEqual(['expense-new', 'expense-old']);
  });

  it('drops anything older than the window', () => {
    const feed = buildFeed(
      input({
        expenses: [
          {
            id: 'ancient',
            description: 'Ancient',
            amountCents: 100,
            paidBy: 'ben',
            createdAt: hoursAgo(24 * 45),
          },
        ],
      })
    );

    expect(feed).toEqual([]);
  });

  it('produces stable ids so rows do not remount on refresh', () => {
    const args = input({
      expenses: [
        { id: 'e1', description: 'Pizza', amountCents: 2400, paidBy: 'ben', createdAt: hoursAgo(1) },
      ],
    });

    expect(buildFeed(args).map((e) => e.id)).toEqual(buildFeed(args).map((e) => e.id));
  });

  it('marks a repeating copy as such', () => {
    const feed = buildFeed(
      input({
        expenses: [
          {
            id: 'e1',
            description: 'Rent',
            amountCents: 120_000,
            paidBy: 'ben',
            createdAt: hoursAgo(2),
            repeatParentId: 'template',
          },
        ],
      })
    );

    expect(feed[0].detail).toBe('Repeating expense');
  });
});

describe('feedTimeAgo', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  it('reads naturally at each scale', () => {
    expect(feedTimeAgo('2026-07-15T11:59:40.000Z', now)).toBe('now');
    expect(feedTimeAgo('2026-07-15T11:30:00.000Z', now)).toBe('30m');
    expect(feedTimeAgo('2026-07-15T09:00:00.000Z', now)).toBe('3h');
    expect(feedTimeAgo('2026-07-13T12:00:00.000Z', now)).toBe('2d');
    expect(feedTimeAgo('2026-07-01T12:00:00.000Z', now)).toBe('2w');
  });
});
