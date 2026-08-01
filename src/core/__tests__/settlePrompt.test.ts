import {
  NEW_MONTH_WINDOW_DAYS,
  SETTLE_THRESHOLD_CENTS,
  evaluateSettlePrompt,
} from '../settlePrompt';

const base = {
  myNetCents: 0,
  today: '2026-07-15',
  lastSettledAt: null as string | null,
  hasOutstanding: true,
};

describe('evaluateSettlePrompt', () => {
  it('stays quiet when nothing is outstanding', () => {
    const result = evaluateSettlePrompt({ ...base, myNetCents: 9999, hasOutstanding: false });
    expect(result.show).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('stays quiet for a small balance mid-month', () => {
    expect(evaluateSettlePrompt({ ...base, myNetCents: -500 }).show).toBe(false);
  });

  it('prompts once the balance crosses the threshold', () => {
    const result = evaluateSettlePrompt({ ...base, myNetCents: -SETTLE_THRESHOLD_CENTS });
    expect(result.show).toBe(true);
    expect(result.reason).toBe('threshold');
    expect(result.headline).toBe('You owe $25.00');
  });

  it('phrases it the other way round when the viewer is owed', () => {
    const result = evaluateSettlePrompt({ ...base, myNetCents: 4000 });
    expect(result.headline).toBe("You're owed $40.00");
  });

  it('does not prompt just below the threshold', () => {
    expect(evaluateSettlePrompt({ ...base, myNetCents: -(SETTLE_THRESHOLD_CENTS - 1) }).show).toBe(
      false
    );
  });

  it('prompts early in a new month even for a small balance', () => {
    const result = evaluateSettlePrompt({
      ...base,
      myNetCents: -600,
      today: '2026-07-02',
      lastSettledAt: '2026-06-20T10:00:00.000Z',
    });

    expect(result.show).toBe(true);
    expect(result.reason).toBe('new-month');
  });

  it('does not repeat the monthly nudge once the group has settled this month', () => {
    expect(
      evaluateSettlePrompt({
        ...base,
        myNetCents: -600,
        today: '2026-07-02',
        lastSettledAt: '2026-07-01T10:00:00.000Z',
      }).show
    ).toBe(false);
  });

  it('closes the monthly window after a few days', () => {
    const inside = evaluateSettlePrompt({
      ...base,
      myNetCents: -600,
      today: `2026-07-0${NEW_MONTH_WINDOW_DAYS}`,
    });
    const outside = evaluateSettlePrompt({
      ...base,
      myNetCents: -600,
      today: `2026-07-0${NEW_MONTH_WINDOW_DAYS + 1}`,
    });

    expect(inside.show).toBe(true);
    expect(outside.show).toBe(false);
  });

  it('says nothing when the viewer is exactly square', () => {
    expect(evaluateSettlePrompt({ ...base, myNetCents: 0, today: '2026-07-02' }).show).toBe(false);
  });

  it('prefers the threshold reason over the monthly one', () => {
    const result = evaluateSettlePrompt({
      ...base,
      myNetCents: -9000,
      today: '2026-07-02',
    });
    expect(result.reason).toBe('threshold');
  });
});
