export interface Place {
  id: string;
  label: string;
  icon: string;
}

export const PLACES: Place[] = [
  { id: 'in the room', label: 'In the room', icon: 'bed-outline' },
  { id: 'in the building', label: 'In the building', icon: 'business-outline' },
  { id: 'at the library', label: 'At the library', icon: 'library-outline' },
  { id: 'in class', label: 'In class', icon: 'school-outline' },
  { id: 'out', label: 'Out', icon: 'walk-outline' },
];

export const STATUSES: { id: string; label: string; emoji: string }[] = [
  { id: 'Free', label: 'Free', emoji: '🟢' },
  { id: 'Studying — quiet', label: 'Studying — quiet', emoji: '📚' },
  { id: 'Asleep', label: 'Asleep', emoji: '😴' },
  { id: 'Friends over', label: 'Friends over', emoji: '👋' },
];

export function statusEmoji(status: string | null | undefined): string {
  if (!status) return '·';
  return STATUSES.find((entry) => entry.id === status)?.emoji ?? '💬';
}

const PLACE_BY_ID = new Map(PLACES.map((place) => [place.id, place]));

export function getPlace(id: string | null | undefined): Place | null {
  if (!id) return null;
  return PLACE_BY_ID.get(id) ?? null;
}

export function isPlaceId(value: string | null | undefined): boolean {
  return Boolean(value) && PLACE_BY_ID.has(value as string);
}

export type PingResponse = 'omw' | 'soon' | 'cant';

export interface PingResponseOption {
  id: PingResponse;
  label: string;
  icon: string;
}

export const PING_RESPONSES: PingResponseOption[] = [
  { id: 'omw', label: 'On my way', icon: 'walk' },
  { id: 'soon', label: '5 min', icon: 'time-outline' },
  { id: 'cant', label: "Can't", icon: 'close-circle-outline' },
];

export function responseLabel(response: string | null | undefined): string | null {
  return PING_RESPONSES.find((option) => option.id === response)?.label ?? null;
}

export interface Ping {
  id: string;
  fromUser: string;
  toUser: string | null;
  note: string | null;
  createdAt: string;
  response: PingResponse | null;
  respondedAt: string | null;
}

export const PING_WINDOW_MINUTES = 90;

export function isPingRecent(
  createdAt: string,
  now: Date = new Date(),
  windowMinutes: number = PING_WINDOW_MINUTES
): boolean {
  const age = now.getTime() - Date.parse(createdAt);
  if (Number.isNaN(age)) return false;
  return age >= 0 && age <= windowMinutes * 60_000;
}

export function recentPings(
  pings: Ping[],
  now: Date = new Date(),
  windowMinutes: number = PING_WINDOW_MINUTES
): Ping[] {
  return pings
    .filter((ping) => isPingRecent(ping.createdAt, now, windowMinutes))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface PingInbox {
  needsReply: Ping[];
  sent: Ping[];
  other: Ping[];
}

export function inboxFor(pings: Ping[], viewerId: string | null, now: Date = new Date()): PingInbox {
  const recent = recentPings(pings, now);
  const needsReply: Ping[] = [];
  const sent: Ping[] = [];
  const other: Ping[] = [];
  for (const ping of recent) {
    if (viewerId && ping.fromUser === viewerId) {
      sent.push(ping);
      continue;
    }

    const addressedToViewer = ping.toUser === null || ping.toUser === viewerId;
    if (viewerId && addressedToViewer && ping.response === null) {
      needsReply.push(ping);
    } else {
      other.push(ping);
    }
  }

  return { needsReply, sent, other };
}

export function describePing(
  ping: Ping,
  viewerId: string | null,
  nameOf: (userId: string | null | undefined) => string
): string {
  const mine = viewerId !== null && ping.fromUser === viewerId;
  const toMe = ping.toUser !== null && ping.toUser === viewerId;
  const toEveryone = ping.toUser === null;
  if (mine) {
    return toEveryone
      ? 'You asked everyone to come'
      : `You asked ${nameOf(ping.toUser)} to come`;
  }

  if (toMe) return `${nameOf(ping.fromUser)} wants you`;
  if (toEveryone) return `${nameOf(ping.fromUser)} wants everyone`;
  return `${nameOf(ping.fromUser)} wants ${nameOf(ping.toUser)}`;
}

export function canRespond(ping: Ping, viewerId: string | null): boolean {
  if (!viewerId) return false;
  if (ping.fromUser === viewerId) return false;
  if (ping.response !== null) return false;
  return ping.toUser === null || ping.toUser === viewerId;
}
