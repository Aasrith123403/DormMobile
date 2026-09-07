import {
  BoardChore,
  assignmentCounts,
  balanceAssignments,
  boardByPerson,
  choreOwner,
  describeChoreLoad,
  unassignedChores,
} from '../chores';

const TODAY = '2026-08-01';

const chore = (overrides: Partial<BoardChore> & { id: string }): BoardChore => ({
  name: overrides.id,
  nextDue: '2026-08-10',
  assignedTo: null,
  ownerId: null,
  ...overrides,
});

describe('choreOwner', () => {
  it('uses the explicit assignment when there is one', () => {
    expect(choreOwner('ana', 'ben')).toBe('ana');
  });

  it('falls back to the rotation when nobody has decided', () => {
    expect(choreOwner(null, 'ben')).toBe('ben');
  });

  it('is null when there is neither', () => {
    expect(choreOwner(null, null)).toBeNull();
  });
});

describe('boardByPerson', () => {
  it('gives every member a column, including the empty ones', () => {
    const board = boardByPerson(
      [chore({ id: 'c1', assignedTo: 'ana', ownerId: 'ana' })],
      ['ana', 'ben', 'cass'],
      TODAY
    );

    expect(board.map((s) => s.userId)).toEqual(['ana', 'ben', 'cass']);
    expect(board[1].chores).toEqual([]);
  });

  it('adds an unassigned column only when something is ownerless', () => {
    const assigned = boardByPerson(
      [chore({ id: 'c1', assignedTo: 'ana', ownerId: 'ana' })],
      ['ana'],
      TODAY
    );
    expect(assigned).toHaveLength(1);
    const withOrphan = boardByPerson(
      [chore({ id: 'c1', assignedTo: null, ownerId: null })],
      ['ana'],
      TODAY
    );
    expect(withOrphan[withOrphan.length - 1].userId).toBeNull();
  });

  it('files a chore owned by someone who left under unassigned', () => {
    const board = boardByPerson(
      [chore({ id: 'c1', assignedTo: 'gone', ownerId: 'gone' })],
      ['ana'],
      TODAY
    );

    expect(board[0].chores).toEqual([]);
    expect(board[1].userId).toBeNull();
    expect(board[1].chores.map((c) => c.id)).toEqual(['c1']);
  });

  it('counts overdue and rotating chores per person', () => {
    const board = boardByPerson(
      [
        chore({ id: 'late', nextDue: '2026-07-20', assignedTo: 'ana', ownerId: 'ana' }),
        chore({ id: 'soon', nextDue: '2026-08-09', assignedTo: null, ownerId: 'ana' }),
      ],
      ['ana'],
      TODAY
    );

    expect(board[0].overdueCount).toBe(1);
    expect(board[0].rotatingCount).toBe(1);
  });

  it('orders a column by due date, then name', () => {
    const board = boardByPerson(
      [
        chore({ id: 'c2', name: 'Bathroom', nextDue: '2026-08-05', ownerId: 'ana' }),
        chore({ id: 'c1', name: 'Trash', nextDue: '2026-08-02', ownerId: 'ana' }),
        chore({ id: 'c3', name: 'Attic', nextDue: '2026-08-05', ownerId: 'ana' }),
      ],
      ['ana'],
      TODAY
    );

    expect(board[0].chores.map((c) => c.name)).toEqual(['Trash', 'Attic', 'Bathroom']);
  });
});

describe('unassignedChores', () => {
  it('returns only the ones nobody decided on, even if a rotation named someone', () => {
    const list = unassignedChores([
      chore({ id: 'c1', assignedTo: 'ana', ownerId: 'ana' }),
      chore({ id: 'c2', assignedTo: null, ownerId: 'ben' }),
    ]);

    expect(list.map((c) => c.id)).toEqual(['c2']);
  });
});

describe('assignmentCounts', () => {
  it('counts explicit assignments and ignores rotations', () => {
    const counts = assignmentCounts(
      [
        chore({ id: 'c1', assignedTo: 'ana', ownerId: 'ana' }),
        chore({ id: 'c2', assignedTo: 'ana', ownerId: 'ana' }),
        chore({ id: 'c3', assignedTo: null, ownerId: 'ben' }),
      ],
      ['ana', 'ben']
    );

    expect(counts).toEqual({ ana: 2, ben: 0 });
  });

  it('ignores an assignee who is no longer in the group', () => {
    const counts = assignmentCounts([chore({ id: 'c1', assignedTo: 'gone', ownerId: 'gone' })], ['ana']);
    expect(counts).toEqual({ ana: 0 });
  });
});

describe('balanceAssignments', () => {
  it('spreads unassigned chores evenly', () => {
    const result = balanceAssignments(
      [chore({ id: 'c1' }), chore({ id: 'c2' }), chore({ id: 'c3' }), chore({ id: 'c4' })],
      ['ana', 'ben']
    );

    const perPerson = result.reduce<Record<string, number>>((acc, row) => {
      acc[row.userId] = (acc[row.userId] ?? 0) + 1;
      return acc;
    }, {});

    expect(perPerson).toEqual({ ana: 2, ben: 2 });
  });

  it('levels up against what people already have', () => {
    const result = balanceAssignments(
      [
        chore({ id: 'has1', assignedTo: 'ana', ownerId: 'ana' }),
        chore({ id: 'has2', assignedTo: 'ana', ownerId: 'ana' }),
        chore({ id: 'new1' }),
        chore({ id: 'new2' }),
      ],
      ['ana', 'ben']
    );

    expect(result).toEqual([
      { choreId: 'new1', userId: 'ben' },
      { choreId: 'new2', userId: 'ben' },
    ]);
  });

  it('never moves a chore somebody already agreed to', () => {
    const result = balanceAssignments(
      [chore({ id: 'c1', assignedTo: 'ana', ownerId: 'ana' })],
      ['ana', 'ben']
    );

    expect(result).toEqual([]);
  });

  it('is deterministic, so two phones produce the same split', () => {
    const chores = [chore({ id: 'c1' }), chore({ id: 'c2' }), chore({ id: 'c3' })];
    const members = ['ana', 'ben', 'cass'];
    expect(balanceAssignments(chores, members)).toEqual(balanceAssignments(chores, members));
  });

  it('does nothing in an empty group', () => {
    expect(balanceAssignments([chore({ id: 'c1' })], [])).toEqual([]);
  });
});

describe('describeChoreLoad', () => {
  it('leads with overdue, then with what needs assigning', () => {
    expect(describeChoreLoad([], TODAY)).toBe('No chores yet');
    expect(
      describeChoreLoad([chore({ id: 'c1', nextDue: '2026-07-30', assignedTo: 'ana' })], TODAY)
    ).toBe('1 overdue');

    expect(describeChoreLoad([chore({ id: 'c1' })], TODAY)).toBe('1 to assign');
    expect(
      describeChoreLoad([chore({ id: 'c1', assignedTo: 'ana', ownerId: 'ana' })], TODAY)
    ).toBe('1 chore assigned');
  });
});
