export interface VenmoPaymentRequest {
  recipient: string;
  amountCents: number;
  note?: string;
  audience?: 'private' | 'friends' | 'public';
}

export interface VenmoLinks {
  appUrl: string;
  webUrl: string;
}

export class VenmoLinkError extends Error {}

const HANDLE = /^[A-Za-z0-9_-]{1,30}$/;

export function normalizeVenmoHandle(raw: string): string {
  return (raw ?? '').trim().replace(/^@+/, '');
}

export function isValidVenmoHandle(raw: string): boolean {
  return HANDLE.test(normalizeVenmoHandle(raw));
}

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

export function settleUpNote(groupName: string): string {
  return `RoomLedger · ${groupName} settle up`.slice(0, 280);
}
