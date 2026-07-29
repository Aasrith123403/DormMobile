/**
 * Venmo hand-off. RoomLedger never touches money itself — it builds a link
 * that opens Venmo with the recipient, amount and note pre-filled, and the
 * user completes the payment in Venmo. Nothing here does any I/O, so the URL
 * construction is unit-testable on its own.
 */

export interface VenmoPaymentRequest {
  /** Venmo handle without the leading "@". */
  recipient: string;
  amountCents: number;
  note?: string;
  /** Venmo defaults to public; RoomLedger defaults to private. */
  audience?: 'private' | 'friends' | 'public';
}

export interface VenmoLinks {
  /** venmo:// scheme — opens the installed app directly. */
  appUrl: string;
  /** https fallback for when the app is not installed. */
  webUrl: string;
}

export class VenmoLinkError extends Error {}

/** Venmo handles: letters, numbers, dashes and underscores, 1-30 chars. */
const HANDLE = /^[A-Za-z0-9_-]{1,30}$/;

export function normalizeVenmoHandle(raw: string): string {
  return (raw ?? '').trim().replace(/^@+/, '');
}

export function isValidVenmoHandle(raw: string): boolean {
  return HANDLE.test(normalizeVenmoHandle(raw));
}

/** Cents -> the "12.34" string Venmo expects. */
export function formatVenmoAmount(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export function buildVenmoLinks(request: VenmoPaymentRequest): VenmoLinks {
  const recipient = normalizeVenmoHandle(request.recipient);

  if (!isValidVenmoHandle(recipient)) {
    throw new VenmoLinkError(
      'That Venmo username does not look right. Ask them to add it in their profile.'
    );
  }
  if (!Number.isFinite(request.amountCents) || Math.round(request.amountCents) <= 0) {
    throw new VenmoLinkError('Payment amount must be greater than zero.');
  }

  const params: Record<string, string> = {
    txn: 'pay',
    recipients: recipient,
    amount: formatVenmoAmount(request.amountCents),
    audience: request.audience ?? 'private',
  };

  const note = (request.note ?? '').trim();
  if (note) params.note = note.slice(0, 280);

  const query = new URLSearchParams(params).toString();

  return {
    appUrl: `venmo://paycharge?${query}`,
    webUrl: `https://venmo.com/?${query}`,
  };
}

/** Default memo on the payment, e.g. "RoomLedger · Dorm settle up". */
export function settleUpNote(groupName: string): string {
  return `RoomLedger · ${groupName} settle up`.slice(0, 280);
}
