import {
  addMonths,
  advanceChargeDate,
  daysBetween,
  describeNextCharge,
  dueChargeDates,
  isDue,
  MAX_CATCHUP_CHARGES,
  todayIso,
} from '../subscriptions';

describe('addMonths', () => {
  it('adds a month within the same year', () => {
    expect(addMonths('2026-03-15', 1)).toBe('2026-04-15');
  });

  it('rolls over the year boundary', () => {
    expect(addMonths('2026-12-05', 1)).toBe('2027-01-05');
    expect(addMonths('2026-01-05', -1)).toBe('2025-12-05');
  });

  it('clamps to the last day of a shorter month, matching Postgres', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('handles leap years', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('does not restore the original day after clamping (Postgres behaviour)', () => {
    const feb = addMonths('2026-01-31', 1);
    expect(addMonths(feb, 1)).toBe('2026-03-28');
  });

  it('adds several months at once', () => {
    expect(addMonths('2026-07-28', 6)).toBe('2027-01-28');
  });
});

describe('dueChargeDates', () => {
  it('is empty when the next charge is still in the future', () => {
    expect(dueChargeDates('2026-08-01', '2026-07-28')).toEqual([]);
  });

  it('includes a charge due today', () => {
    expect(dueChargeDates('2026-07-28', '2026-07-28')).toEqual(['2026-07-28']);
  });

  it('catches up every missed month after a long absence', () => {
    expect(dueChargeDates('2026-04-10', '2026-07-28')).toEqual([
      '2026-04-10',
      '2026-05-10',
      '2026-06-10',
      '2026-07-10',
    ]);
  });

  it('stops before generating an unbounded backlog', () => {
    expect(dueChargeDates('1990-01-01', '2026-07-28')).toHaveLength(MAX_CATCHUP_CHARGES);
  });
});

describe('advanceChargeDate', () => {
  it('leaves the date alone when nothing is due', () => {
    expect(advanceChargeDate('2026-08-01', '2026-07-28')).toBe('2026-08-01');
  });

  it('moves past the last generated charge', () => {
    expect(advanceChargeDate('2026-04-10', '2026-07-28')).toBe('2026-08-10');
  });

  it('is idempotent — a second catch-up on the same day generates nothing', () => {
    const advanced = advanceChargeDate('2026-04-10', '2026-07-28');
    expect(dueChargeDates(advanced, '2026-07-28')).toEqual([]);
    expect(advanceChargeDate(advanced, '2026-07-28')).toBe(advanced);
  });

  it('generates exactly one charge per month over a simulated year', () => {
    let nextCharge = '2026-01-15';
    let generated = 0;

    for (let month = 0; month < 12; month += 1) {
      const today = addMonths('2026-01-20', month);
      generated += dueChargeDates(nextCharge, today).length;
      nextCharge = advanceChargeDate(nextCharge, today);
    }

    expect(generated).toBe(12);
  });
});

describe('isDue and describeNextCharge', () => {
  it('flags dates on or before today as due', () => {
    expect(isDue('2026-07-28', '2026-07-28')).toBe(true);
    expect(isDue('2026-07-27', '2026-07-28')).toBe(true);
    expect(isDue('2026-07-29', '2026-07-28')).toBe(false);
  });

  it('describes the next charge in plain language', () => {
    expect(describeNextCharge('2026-07-28', '2026-07-28')).toBe('Charges today');
    expect(describeNextCharge('2026-07-29', '2026-07-28')).toBe('Charges tomorrow');
    expect(describeNextCharge('2026-08-01', '2026-07-28')).toBe('Charges in 4 days');
    expect(describeNextCharge('2026-07-27', '2026-07-28')).toBe('1 day overdue');
    expect(describeNextCharge('2026-07-25', '2026-07-28')).toBe('3 days overdue');
  });
});

describe('date helpers', () => {
  it('counts days across a month boundary', () => {
    expect(daysBetween('2026-07-28', '2026-08-02')).toBe(5);
    expect(daysBetween('2026-08-02', '2026-07-28')).toBe(-5);
  });

  it('formats today without timezone drift', () => {
    // Late-evening local time must still report the local calendar day.
    expect(todayIso(new Date(2026, 6, 28, 23, 59))).toBe('2026-07-28');
    expect(todayIso(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
});
