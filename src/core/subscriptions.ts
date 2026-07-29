/**
 * Recurring-charge date maths. Pure, and deliberately string-based
 * (YYYY-MM-DD) so nothing depends on the device timezone — a subscription due
 * on the 1st must not fire a day early for someone in UTC+13.
 *
 * Month arithmetic clamps to the end of the target month, matching Postgres'
 * `date + interval '1 month'`, so the client-side preview and the
 * `generate_due_subscription_charges` SQL function always agree.
 */

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds whole months, clamping the day to the last day of the target month. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const zeroBased = (year * 12 + (month - 1)) + months;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return toIsoDate(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today in the device's local calendar, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Hard stop so a subscription with a badly wrong date cannot spin forever. */
export const MAX_CATCHUP_CHARGES = 60;

/**
 * Every charge date that is due on or before `today`, starting at
 * `nextChargeDate`. Empty when nothing is due yet.
 */
export function dueChargeDates(nextChargeDate: IsoDate, today: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  let cursor = nextChargeDate;
  while (compareIsoDates(cursor, today) <= 0 && dates.length < MAX_CATCHUP_CHARGES) {
    dates.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return dates;
}

/** The date to store back on the subscription after generating due charges. */
export function advanceChargeDate(nextChargeDate: IsoDate, today: IsoDate): IsoDate {
  const due = dueChargeDates(nextChargeDate, today);
  return due.length === 0 ? nextChargeDate : addMonths(due[due.length - 1], 1);
}

export function isDue(nextChargeDate: IsoDate, today: IsoDate): boolean {
  return compareIsoDates(nextChargeDate, today) <= 0;
}

/** "in 3 days" / "today" / "2 days late" for the subscription list. */
export function describeNextCharge(nextChargeDate: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, nextChargeDate);
  if (diff === 0) return 'Charges today';
  if (diff === 1) return 'Charges tomorrow';
  if (diff > 1) return `Charges in ${diff} days`;
  return `${Math.abs(diff)} day${diff === -1 ? '' : 's'} overdue`;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const msPerDay = 86_400_000;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / msPerDay
  );
}
