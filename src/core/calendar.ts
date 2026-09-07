import { formatMoney } from './money';

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toUtc(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(dateIso: string, days: number): string {
  return fromUtc(toUtc(dateIso) + days * 86_400_000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

export function dayOfWeek(dateIso: string): number {
  return new Date(toUtc(dateIso)).getUTCDay();
}

export function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function firstOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
}

export function buildMonthGrid(monthKey: string, today: string): CalendarDay[] {
  const first = firstOfMonth(monthKey);
  const lead = dayOfWeek(first);
  const length = daysInMonth(monthKey);
  const cells = Math.ceil((lead + length) / 7) * 7;
  const start = addDays(first, -lead);
  return Array.from({ length: cells }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      day: Number(date.slice(8)),
      inMonth: monthKeyOf(date) === monthKey,
      isToday: date === today,
      isPast: date < today,
    };
  });
}

export type AgendaKind = 'event' | 'chore' | 'money';

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  date: string;
  title: string;
  detail: string | null;
  time: string | null;
  minutes: number | null;
  icon: string;
  ownerId: string | null;
}

export interface AgendaInput {
  events: {
    id: string;
    title: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    createdBy: string | null;
  }[];
  chores: { id: string; name: string; nextDue: string; ownerId: string | null }[];
  money: { id: string; name: string; dueDate: string; amountCents: number }[];
  nameOf: (userId: string | null | undefined) => string;
}

export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function formatClock(time: string | null | undefined): string | null {
  const total = minutesOf(time);
  if (total === null) return null;
  const hours24 = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  const from = formatClock(start);
  if (!from) return null;
  const to = formatClock(end);
  return to ? `${from} – ${to}` : from;
}

export function buildAgenda(input: AgendaInput): Map<string, AgendaItem[]> {
  const byDate = new Map<string, AgendaItem[]>();
  const push = (item: AgendaItem) => {
    const day = byDate.get(item.date);
    if (day) day.push(item);
    else byDate.set(item.date, [item]);
  };

  for (const event of input.events) {
    const range = formatTimeRange(event.startTime, event.endTime);
    push({
      id: `event-${event.id}`,
      kind: 'event',
      date: event.date,
      title: event.title,
      detail: event.location ?? (event.createdBy ? `Added by ${input.nameOf(event.createdBy)}` : null),
      time: range,
      minutes: minutesOf(event.startTime),
      icon: 'calendar',
      ownerId: event.createdBy,
    });
  }

  for (const chore of input.chores) {
    push({
      id: `chore-${chore.id}`,
      kind: 'chore',
      date: chore.nextDue,
      title: chore.name,
      detail: chore.ownerId ? `${input.nameOf(chore.ownerId)}'s chore` : 'Nobody assigned',
      time: null,
      minutes: null,
      icon: 'checkbox-outline',
      ownerId: chore.ownerId,
    });
  }

  for (const charge of input.money) {
    push({
      id: `money-${charge.id}`,
      kind: 'money',
      date: charge.dueDate,
      title: charge.name,
      detail: `${formatMoney(charge.amountCents)} posts`,
      time: null,
      minutes: null,
      icon: 'repeat',
      ownerId: null,
    });
  }

  for (const items of byDate.values()) {
    items.sort(
      (a, b) => (a.minutes ?? -1) - (b.minutes ?? -1) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
    );
  }

  return byDate;
}

export function agendaFor(agenda: Map<string, AgendaItem[]>, date: string): AgendaItem[] {
  return agenda.get(date) ?? [];
}

export function upcomingAgenda(
  agenda: Map<string, AgendaItem[]>,
  today: string,
  options: { withinDays?: number; limit?: number } = {}
): AgendaItem[] {
  const { withinDays = 30, limit = 5 } = options;
  const horizon = addDays(today, withinDays);
  return [...agenda.entries()]
    .filter(([date]) => date >= today && date <= horizon)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, items]) => items)
    .slice(0, limit);
}

export function formatDayHeading(dateIso: string, today: string): string {
  const delta = daysBetween(today, dateIso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  const day = Number(dateIso.slice(8));
  const month = MONTH_SHORT[Number(dateIso.slice(5, 7)) - 1];
  return `${WEEKDAY_SHORT[dayOfWeek(dateIso)]}, ${month} ${day}`;
}

export function formatShortDate(dateIso: string): string {
  return `${MONTH_SHORT[Number(dateIso.slice(5, 7)) - 1]} ${Number(dateIso.slice(8))}`;
}
