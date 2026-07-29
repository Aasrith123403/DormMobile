import {
  buildVenmoLinks,
  formatVenmoAmount,
  isValidVenmoHandle,
  normalizeVenmoHandle,
  settleUpNote,
  VenmoLinkError,
} from '../../venmo/deepLink';

describe('handle normalisation', () => {
  it('strips the @ and surrounding whitespace', () => {
    expect(normalizeVenmoHandle('  @ana-lopez ')).toBe('ana-lopez');
    expect(normalizeVenmoHandle('ana-lopez')).toBe('ana-lopez');
  });

  it('validates realistic handles', () => {
    expect(isValidVenmoHandle('@Ana-Lopez')).toBe(true);
    expect(isValidVenmoHandle('ben_92')).toBe(true);
    expect(isValidVenmoHandle('')).toBe(false);
    expect(isValidVenmoHandle('has spaces')).toBe(false);
    expect(isValidVenmoHandle('nope!')).toBe(false);
  });
});

describe('formatVenmoAmount', () => {
  it('always emits two decimal places', () => {
    expect(formatVenmoAmount(1234)).toBe('12.34');
    expect(formatVenmoAmount(500)).toBe('5.00');
    expect(formatVenmoAmount(5)).toBe('0.05');
    expect(formatVenmoAmount(123_456)).toBe('1234.56');
  });
});

describe('buildVenmoLinks', () => {
  it('builds an app link with recipient, amount and private audience', () => {
    const { appUrl } = buildVenmoLinks({ recipient: '@ana-lopez', amountCents: 1750 });

    expect(appUrl.startsWith('venmo://paycharge?')).toBe(true);
    expect(appUrl).toContain('txn=pay');
    expect(appUrl).toContain('recipients=ana-lopez');
    expect(appUrl).toContain('amount=17.50');
    expect(appUrl).toContain('audience=private');
  });

  it('builds a matching https fallback', () => {
    const { webUrl } = buildVenmoLinks({ recipient: 'ana', amountCents: 100 });
    expect(webUrl.startsWith('https://venmo.com/?')).toBe(true);
    expect(webUrl).toContain('amount=1.00');
  });

  it('url-encodes the note', () => {
    const { appUrl } = buildVenmoLinks({
      recipient: 'ana',
      amountCents: 100,
      note: 'RoomLedger · Ski Trip settle up',
    });

    expect(appUrl).toContain('note=');
    expect(appUrl).not.toContain('Ski Trip');
    expect(decodeURIComponent(appUrl.split('note=')[1].replace(/\+/g, ' '))).toBe(
      'RoomLedger · Ski Trip settle up'
    );
  });

  it('honours a non-default audience', () => {
    const { appUrl } = buildVenmoLinks({ recipient: 'ana', amountCents: 100, audience: 'friends' });
    expect(appUrl).toContain('audience=friends');
  });

  it('rejects a missing or malformed handle', () => {
    expect(() => buildVenmoLinks({ recipient: '', amountCents: 100 })).toThrow(VenmoLinkError);
    expect(() => buildVenmoLinks({ recipient: 'not a handle', amountCents: 100 })).toThrow(
      /does not look right/i
    );
  });

  it('rejects a non-positive amount', () => {
    expect(() => buildVenmoLinks({ recipient: 'ana', amountCents: 0 })).toThrow(/greater than zero/i);
    expect(() => buildVenmoLinks({ recipient: 'ana', amountCents: -100 })).toThrow(VenmoLinkError);
  });
});

describe('settleUpNote', () => {
  it('names the group', () => {
    expect(settleUpNote('Dorm')).toBe('RoomLedger · Dorm settle up');
  });
});
