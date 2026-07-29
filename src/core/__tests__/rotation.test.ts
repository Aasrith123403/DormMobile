import { nextTurn, reconcileTurn } from '../rotation';

describe('nextTurn', () => {
  const members = ['ana', 'ben', 'cass'];

  it('moves to the following member', () => {
    expect(nextTurn(members, 'ana')).toBe('ben');
    expect(nextTurn(members, 'ben')).toBe('cass');
  });

  it('wraps around at the end of the list', () => {
    expect(nextTurn(members, 'cass')).toBe('ana');
  });

  it('advances from whoever actually bought, not whose turn it was', () => {
    // Cass buys out of turn -> the turn passes to ana, not back to ben.
    expect(nextTurn(members, 'cass')).toBe('ana');
  });

  it('starts the rotation when nobody holds the turn', () => {
    expect(nextTurn(members, null)).toBe('ana');
  });

  it('falls back to the first member for an unknown buyer', () => {
    expect(nextTurn(members, 'stranger')).toBe('ana');
  });

  it('handles a one-person group and an empty group', () => {
    expect(nextTurn(['solo'], 'solo')).toBe('solo');
    expect(nextTurn([], 'ana')).toBeNull();
  });

  it('visits everyone exactly once per cycle', () => {
    const seen: string[] = [];
    let current: string | null = 'ana';
    for (let i = 0; i < members.length; i += 1) {
      seen.push(current!);
      current = nextTurn(members, current);
    }
    expect([...seen].sort()).toEqual([...members].sort());
    expect(current).toBe('ana');
  });
});

describe('reconcileTurn', () => {
  it('keeps the turn when the member is still around', () => {
    expect(reconcileTurn(['ana', 'ben'], ['ana', 'ben'], 'ben')).toBe('ben');
  });

  it('passes the turn on when the holder has left', () => {
    expect(reconcileTurn(['ana', 'ben', 'cass'], ['ana', 'cass'], 'ben')).toBe('cass');
  });

  it('wraps when the departed member was last', () => {
    expect(reconcileTurn(['ana', 'ben', 'cass'], ['ana', 'ben'], 'cass')).toBe('ana');
  });

  it('seeds the turn for a group that never had one', () => {
    expect(reconcileTurn([], ['ana', 'ben'], null)).toBe('ana');
  });

  it('returns null once the group is empty', () => {
    expect(reconcileTurn(['ana'], [], 'ana')).toBeNull();
  });
});
