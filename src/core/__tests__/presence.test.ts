import {
  PING_RESPONSES,
  PING_WINDOW_MINUTES,
  PLACES,
  Ping,
  canRespond,
  describePing,
  getPlace,
  inboxFor,
  isPingRecent,
  isPlaceId,
  recentPings,
  responseLabel,
  STATUSES,
  statusEmoji,
} from '../presence';

const NAMES: Record<string, string> = { ana: 'Ana', ben: 'Ben', cass: 'Cass' };
const nameOf = (id?: string | null) => NAMES[id ?? ''] ?? 'Someone';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const ping = (overrides: Partial<Ping> = {}): Ping => ({
  id: 'p1',
  fromUser: 'ben',
  toUser: 'ana',
  note: null,
  createdAt: minutesAgo(5),
  response: null,
  respondedAt: null,
  ...overrides,
});

describe('places', () => {
  it('offers a short fixed list, not free text', () => {
    expect(PLACES.length).toBeGreaterThan(2);
    expect(PLACES.length).toBeLessThanOrEqual(6);
    for (const place of PLACES) {
      expect(place.label).not.toBe('');
      expect(place.icon).not.toBe('');
    }
  });

  it('has unique ids', () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows nothing for a member who has declared nothing', () => {
    expect(getPlace(null)).toBeNull();
    expect(getPlace(undefined)).toBeNull();
    expect(getPlace('')).toBeNull();
  });

  it('does not invent a place for an unknown value', () => {
    expect(getPlace('at the moon')).toBeNull();
  });

  it('resolves a known place', () => {
    expect(getPlace('at the library')?.label).toBe('At the library');
  });

  it('validates ids', () => {
    expect(isPlaceId('in class')).toBe(true);
    expect(isPlaceId('nope')).toBe(false);
    expect(isPlaceId(null)).toBe(false);
  });
});

describe('ping responses', () => {
  it('offers exactly the three one-tap answers', () => {
    expect(PING_RESPONSES.map((r) => r.id)).toEqual(['omw', 'soon', 'cant']);
  });

  it('labels a stored response', () => {
    expect(responseLabel('omw')).toBe('On my way');
    expect(responseLabel('cant')).toBe("Can't");
    expect(responseLabel(null)).toBeNull();
    expect(responseLabel('shrug')).toBeNull();
  });
});

describe('isPingRecent', () => {
  it('accepts something just sent', () => {
    expect(isPingRecent(minutesAgo(0), NOW)).toBe(true);
    expect(isPingRecent(minutesAgo(5), NOW)).toBe(true);
  });

  it('drops anything past the window', () => {
    expect(isPingRecent(minutesAgo(PING_WINDOW_MINUTES + 1), NOW)).toBe(false);
  });

  it('keeps the boundary itself', () => {
    expect(isPingRecent(minutesAgo(PING_WINDOW_MINUTES), NOW)).toBe(true);
  });

  it('ignores a future timestamp and unparseable input', () => {
    expect(isPingRecent(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe(false);
    expect(isPingRecent('not a date', NOW)).toBe(false);
  });
});

describe('recentPings', () => {
  it('returns newest first and drops stale ones', () => {
    const result = recentPings(
      [
        ping({ id: 'old', createdAt: minutesAgo(200) }),
        ping({ id: 'mid', createdAt: minutesAgo(30) }),
        ping({ id: 'new', createdAt: minutesAgo(1) }),
      ],
      NOW
    );

    expect(result.map((p) => p.id)).toEqual(['new', 'mid']);
  });

  it('is empty when nothing is recent', () => {
    expect(recentPings([ping({ createdAt: minutesAgo(999) })], NOW)).toEqual([]);
  });
});

describe('inboxFor', () => {
  it('puts a direct ping to the viewer in needsReply', () => {
    const inbox = inboxFor([ping({ toUser: 'ana' })], 'ana', NOW);
    expect(inbox.needsReply).toHaveLength(1);
    expect(inbox.sent).toHaveLength(0);
  });

  it('treats a group-wide ping as needing a reply from everyone but the sender', () => {
    const group = ping({ id: 'g', fromUser: 'ben', toUser: null });
    expect(inboxFor([group], 'ana', NOW).needsReply).toHaveLength(1);
    expect(inboxFor([group], 'cass', NOW).needsReply).toHaveLength(1);
    expect(inboxFor([group], 'ben', NOW).sent).toHaveLength(1);
    expect(inboxFor([group], 'ben', NOW).needsReply).toHaveLength(0);
  });

  it('stops asking once a group ping has been answered', () => {
    const answered = ping({ toUser: null, response: 'omw', respondedAt: minutesAgo(1) });
    const inbox = inboxFor([answered], 'ana', NOW);
    expect(inbox.needsReply).toHaveLength(0);
    expect(inbox.other).toHaveLength(1);
  });

  it('does not ask the viewer about a ping aimed at someone else', () => {
    const inbox = inboxFor([ping({ fromUser: 'ben', toUser: 'cass' })], 'ana', NOW);
    expect(inbox.needsReply).toHaveLength(0);
    expect(inbox.other).toHaveLength(1);
  });

  it('separates what the viewer sent', () => {
    const inbox = inboxFor([ping({ fromUser: 'ana', toUser: 'ben' })], 'ana', NOW);
    expect(inbox.sent).toHaveLength(1);
    expect(inbox.needsReply).toHaveLength(0);
  });

  it('asks nothing of a signed-out viewer', () => {
    const inbox = inboxFor([ping({ toUser: null })], null, NOW);
    expect(inbox.needsReply).toHaveLength(0);
  });

  it('excludes stale pings entirely', () => {
    const inbox = inboxFor([ping({ createdAt: minutesAgo(500) })], 'ana', NOW);
    expect(inbox.needsReply).toHaveLength(0);
    expect(inbox.other).toHaveLength(0);
    expect(inbox.sent).toHaveLength(0);
  });
});

describe('describePing', () => {
  it('speaks in the second person to the recipient', () => {
    expect(describePing(ping({ fromUser: 'ben', toUser: 'ana' }), 'ana', nameOf)).toBe(
      'Ben wants you'
    );
  });

  it('speaks in the first person to the sender', () => {
    expect(describePing(ping({ fromUser: 'ana', toUser: 'ben' }), 'ana', nameOf)).toBe(
      'You asked Ben to come'
    );
    expect(describePing(ping({ fromUser: 'ana', toUser: null }), 'ana', nameOf)).toBe(
      'You asked everyone to come'
    );
  });

  it('handles a group-wide ping from someone else', () => {
    expect(describePing(ping({ fromUser: 'ben', toUser: null }), 'ana', nameOf)).toBe(
      'Ben wants everyone'
    );
  });

  it('describes a ping between two other people', () => {
    expect(describePing(ping({ fromUser: 'ben', toUser: 'cass' }), 'ana', nameOf)).toBe(
      'Ben wants Cass'
    );
  });
});

describe('canRespond', () => {
  it('lets the addressee answer', () => {
    expect(canRespond(ping({ fromUser: 'ben', toUser: 'ana' }), 'ana')).toBe(true);
  });

  it('lets anyone answer a group ping', () => {
    expect(canRespond(ping({ fromUser: 'ben', toUser: null }), 'cass')).toBe(true);
  });

  it('never lets the sender answer their own', () => {
    expect(canRespond(ping({ fromUser: 'ana', toUser: null }), 'ana')).toBe(false);
    expect(canRespond(ping({ fromUser: 'ana', toUser: 'ben' }), 'ana')).toBe(false);
  });

  it('refuses once it has been answered', () => {
    expect(
      canRespond(ping({ fromUser: 'ben', toUser: 'ana', response: 'omw' }), 'ana')
    ).toBe(false);
  });

  it('refuses a ping aimed at someone else', () => {
    expect(canRespond(ping({ fromUser: 'ben', toUser: 'cass' }), 'ana')).toBe(false);
  });

  it('refuses when signed out', () => {
    expect(canRespond(ping({ toUser: null }), null)).toBe(false);
  });
});

describe('statuses and places do not overlap', () => {
  it('never offers the same word in both lists', () => {
    const statusLabels = new Set(STATUSES.map((s) => s.label.toLowerCase()));
    const clash = PLACES.filter((p) => statusLabels.has(p.label.toLowerCase()));
    expect(clash).toEqual([]);
  });

  it('gives every status an emoji', () => {
    for (const status of STATUSES) {
      expect(statusEmoji(status.id)).toBe(status.emoji);
    }
  });

  it('falls back rather than blanking for an unknown or missing status', () => {
    expect(statusEmoji('Something a previous build wrote')).toBe('💬');
    expect(statusEmoji(null)).toBe('·');
  });
});
