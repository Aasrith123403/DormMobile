import {
  AgendaInput,
  addDays,
  agendaFor,
  buildAgenda,
  buildMonthGrid,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatClock,
  formatDayHeading,
  formatShortDate,
  formatTimeRange,
  minutesOf,
  monthKeyOf,
  monthLabel,
  shiftMonth,
  upcomingAgenda,
} from '../calendar';

const NAMES: Record<string, string> = { ana: 'Ana', ben: 'Ben' };
const nameOf = (id: string | null | undefined) => NAMES[id ?? ''] ?? 'Someone';

const input = (overrides: Partial<AgendaInput> = {}): AgendaInput => ({
  events: [],
  chores: [],
  money: [],
  nameOf,
  ...overrides,
});

describe('date math', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('adds days across a leap day without drifting', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts days between dates in both directions', () => {
    expect(daysBetween('2026-08-01', '2026-08-15')).toBe(14);
    expect(daysBetween('2026-08-15', '2026-08-01')).toBe(-14);
  });

  it('knows the day of the week', () => {
    expect(dayOfWeek('2026-08-01')).toBe(6);
    expect(dayOfWeek('2026-08-02')).toBe(0);
  });

  it('shifts months without landing on an invalid date', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2026-02');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('measures months, including February', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-08')).toBe(31);
  });

  it('labels months and dates for people', () => {
    expect(monthKeyOf('2026-08-14')).toBe('2026-08');
    expect(monthLabel('2026-08')).toBe('August 2026');
    expect(formatShortDate('2026-08-14')).toBe('Aug 14');
  });
});

describe('buildMonthGrid', () => {
  it('covers whole weeks starting on Sunday', () => {
    const grid = buildMonthGrid('2026-08', '2026-08-01');
    expect(grid.length % 7).toBe(0);
    expect(dayOfWeek(grid[0].date)).toBe(0);
    expect(dayOfWeek(grid[grid.length - 1].date)).toBe(6);
  });

  it('includes every day of the month exactly once', () => {
    const grid = buildMonthGrid('2026-08', '2026-08-01');
    const inMonth = grid.filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth.map((d) => d.date)).size).toBe(31);
  });

  it('pads with the neighbouring months, marked as outside', () => {
    const grid = buildMonthGrid('2026-08', '2026-08-01');
    expect(grid.slice(0, 6).every((day) => !day.inMonth)).toBe(true);
    expect(grid[6].date).toBe('2026-08-01');
  });

  it('uses only the weeks it needs', () => {
    expect(buildMonthGrid('2027-02', '2027-02-01')).toHaveLength(35);
  });

  it('marks today and the past', () => {
    const grid = buildMonthGrid('2026-08', '2026-08-14');
    const today = grid.find((day) => day.date === '2026-08-14')!;
    const earlier = grid.find((day) => day.date === '2026-08-13')!;
    const later = grid.find((day) => day.date === '2026-08-15')!;
    expect(today.isToday).toBe(true);
    expect(today.isPast).toBe(false);
    expect(earlier.isPast).toBe(true);
    expect(later.isPast).toBe(false);
  });
});

describe('clock formatting', () => {
  it('converts a Postgres time to a 12-hour clock', () => {
    expect(formatClock('19:00:00')).toBe('7:00 PM');
    expect(formatClock('09:05')).toBe('9:05 AM');
  });

  it('gets midnight and noon right', () => {
    expect(formatClock('00:00:00')).toBe('12:00 AM');
    expect(formatClock('12:00:00')).toBe('12:00 PM');
    expect(formatClock('12:30:00')).toBe('12:30 PM');
  });

  it('treats a missing time as all-day rather than midnight', () => {
    expect(formatClock(null)).toBeNull();
    expect(minutesOf(null)).toBeNull();
  });

  it('builds a range only when there is a start', () => {
    expect(formatTimeRange('19:00', '21:30')).toBe('7:00 PM – 9:30 PM');
    expect(formatTimeRange('19:00', null)).toBe('7:00 PM');
    expect(formatTimeRange(null, '21:00')).toBeNull();
  });
});

describe('buildAgenda', () => {
  it('places an event on its date with its time range', () => {
    const agenda = buildAgenda(
      input({
        events: [
          {
            id: 'e1',
            title: 'House dinner',
            date: '2026-08-14',
            startTime: '19:00:00',
            endTime: '21:00:00',
            location: 'Kitchen',
            createdBy: 'ana',
          },
        ],
      })
    );

    const [item] = agendaFor(agenda, '2026-08-14');
    expect(item.title).toBe('House dinner');
    expect(item.time).toBe('7:00 PM – 9:00 PM');
    expect(item.detail).toBe('Kitchen');
    expect(item.kind).toBe('event');
  });

  it('names the person who added an event when there is no location', () => {
    const agenda = buildAgenda(
      input({
        events: [
          {
            id: 'e1',
            title: 'Movie night',
            date: '2026-08-14',
            startTime: null,
            endTime: null,
            location: null,
            createdBy: 'ben',
          },
        ],
      })
    );

    expect(agendaFor(agenda, '2026-08-14')[0].detail).toBe('Added by Ben');
  });

  it('shows chores on their due date, with whose they are', () => {
    const agenda = buildAgenda(
      input({ chores: [{ id: 'c1', name: 'Bathroom', nextDue: '2026-08-16', ownerId: 'ana' }] })
    );

    const [item] = agendaFor(agenda, '2026-08-16');
    expect(item.kind).toBe('chore');
    expect(item.detail).toBe("Ana's chore");
  });

  it('says so when a chore on the calendar has no owner', () => {
    const agenda = buildAgenda(
      input({ chores: [{ id: 'c1', name: 'Bathroom', nextDue: '2026-08-16', ownerId: null }] })
    );

    expect(agendaFor(agenda, '2026-08-16')[0].detail).toBe('Nobody assigned');
  });

  it('shows recurring money on its charge date', () => {
    const agenda = buildAgenda(
      input({ money: [{ id: 'r1', name: 'Rent', dueDate: '2026-09-01', amountCents: 120_000 }] })
    );

    const [item] = agendaFor(agenda, '2026-09-01');
    expect(item.kind).toBe('money');
    expect(item.detail).toBe('$1200.00 posts');
  });

  it('puts all-day entries before timed ones', () => {
    const agenda = buildAgenda(
      input({
        events: [
          {
            id: 'e1',
            title: 'Dinner',
            date: '2026-08-14',
            startTime: '19:00',
            endTime: null,
            location: null,
            createdBy: null,
          },
          {
            id: 'e2',
            title: 'Move-out day',
            date: '2026-08-14',
            startTime: null,
            endTime: null,
            location: null,
            createdBy: null,
          },
        ],
        chores: [{ id: 'c1', name: 'Trash', nextDue: '2026-08-14', ownerId: 'ana' }],
      })
    );

    expect(agendaFor(agenda, '2026-08-14').map((i) => i.title)).toEqual([
      'Move-out day',
      'Trash',
      'Dinner',
    ]);
  });

  it('orders timed entries by the clock', () => {
    const agenda = buildAgenda(
      input({
        events: [
          { id: 'late', title: 'Late', date: '2026-08-14', startTime: '21:00', endTime: null, location: null, createdBy: null },
          { id: 'early', title: 'Early', date: '2026-08-14', startTime: '08:00', endTime: null, location: null, createdBy: null },
        ],
      })
    );

    expect(agendaFor(agenda, '2026-08-14').map((i) => i.title)).toEqual(['Early', 'Late']);
  });

  it('returns an empty list for a day with nothing on it', () => {
    expect(agendaFor(buildAgenda(input()), '2026-08-14')).toEqual([]);
  });
});

describe('upcomingAgenda', () => {
  const agenda = buildAgenda(
    input({
      events: [
        { id: 'past', title: 'Past', date: '2026-08-01', startTime: null, endTime: null, location: null, createdBy: null },
        { id: 'today', title: 'Today', date: '2026-08-14', startTime: null, endTime: null, location: null, createdBy: null },
        { id: 'soon', title: 'Soon', date: '2026-08-18', startTime: null, endTime: null, location: null, createdBy: null },
        { id: 'far', title: 'Far', date: '2027-01-01', startTime: null, endTime: null, location: null, createdBy: null },
      ],
    })
  );

  it('starts today and runs forward', () => {
    expect(upcomingAgenda(agenda, '2026-08-14').map((i) => i.title)).toEqual(['Today', 'Soon']);
  });

  it('respects the horizon and the limit', () => {
    expect(upcomingAgenda(agenda, '2026-08-14', { withinDays: 2 }).map((i) => i.title)).toEqual([
      'Today',
    ]);
    expect(upcomingAgenda(agenda, '2026-08-14', { limit: 1 })).toHaveLength(1);
  });
});

describe('formatDayHeading', () => {
  it('uses words for the days people care about', () => {
    expect(formatDayHeading('2026-08-14', '2026-08-14')).toBe('Today');
    expect(formatDayHeading('2026-08-15', '2026-08-14')).toBe('Tomorrow');
    expect(formatDayHeading('2026-08-13', '2026-08-14')).toBe('Yesterday');
  });

  it('falls back to a dated weekday', () => {
    expect(formatDayHeading('2026-08-22', '2026-08-14')).toBe('Sat, Aug 22');
  });
});
