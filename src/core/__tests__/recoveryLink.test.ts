import {
  MIN_PASSWORD_LENGTH,
  checkNewPassword,
  describePasswordProblem,
  parseRecoveryUrl,
} from '../recoveryLink';

describe('parseRecoveryUrl', () => {
  it('reads tokens out of the fragment, which is where the web redirect puts them', () => {
    const result = parseRecoveryUrl(
      'https://roomledger.app/#access_token=abc&refresh_token=def&type=recovery&expires_in=3600'
    );

    expect(result).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def' });
  });

  it('reads them out of a native deep link', () => {
    const result = parseRecoveryUrl(
      'roomledger://reset-password#access_token=abc&refresh_token=def&type=recovery'
    );

    expect(result).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def' });
  });

  it('falls back to the query string when there is no fragment', () => {
    const result = parseRecoveryUrl(
      'roomledger://reset-password?access_token=abc&refresh_token=def&type=recovery'
    );

    expect(result).toEqual({ kind: 'tokens', accessToken: 'abc', refreshToken: 'def' });
  });

  it('prefers the fragment when a URL carries both', () => {
    const result = parseRecoveryUrl(
      'https://x.app/?access_token=old&refresh_token=old#access_token=new&refresh_token=fresh&type=recovery'
    );

    expect(result).toEqual({ kind: 'tokens', accessToken: 'new', refreshToken: 'fresh' });
  });

  it('explains an expired link instead of failing silently', () => {
    const result = parseRecoveryUrl(
      'https://x.app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );

    expect(result.kind).toBe('error');
    expect(result).toHaveProperty('message', 'That reset link has expired. Request a new one.');
  });

  it('explains a link that was already used', () => {
    const result = parseRecoveryUrl('https://x.app/#error_code=otp_already_used');
    expect(result).toHaveProperty('message', 'That reset link has already been used. Request a new one.');
  });

  it('falls back to the description for an error it does not recognise', () => {
    const result = parseRecoveryUrl(
      'https://x.app/#error=server_error&error_description=Something+broke'
    );
    expect(result).toHaveProperty('message', 'Something broke');
  });

  it('always gives an error a usable message, even with no description', () => {
    const result = parseRecoveryUrl('https://x.app/#error=weird');
    expect(result).toHaveProperty('message', 'That reset link is not valid. Request a new one.');
  });

  it('ignores a signup confirmation carrying the same token pair', () => {
    const result = parseRecoveryUrl(
      'https://x.app/#access_token=abc&refresh_token=def&type=signup'
    );

    expect(result).toEqual({ kind: 'none' });
  });

  it('accepts tokens with no type, which some redirects omit', () => {
    expect(parseRecoveryUrl('https://x.app/#access_token=a&refresh_token=b').kind).toBe('tokens');
  });

  it('is none for ordinary links and rubbish', () => {
    expect(parseRecoveryUrl('https://roomledger.app/groups')).toEqual({ kind: 'none' });
    expect(parseRecoveryUrl('roomledger://')).toEqual({ kind: 'none' });
    expect(parseRecoveryUrl('')).toEqual({ kind: 'none' });
    expect(parseRecoveryUrl(null)).toEqual({ kind: 'none' });
    expect(parseRecoveryUrl(undefined)).toEqual({ kind: 'none' });
  });

  it('needs both tokens, not just one', () => {
    expect(parseRecoveryUrl('https://x.app/#access_token=abc&type=recovery')).toEqual({ kind: 'none' });
    expect(parseRecoveryUrl('https://x.app/#refresh_token=def&type=recovery')).toEqual({ kind: 'none' });
  });
});

describe('checkNewPassword', () => {
  const long = 'a'.repeat(MIN_PASSWORD_LENGTH);
  it('accepts a long enough, matching pair', () => {
    expect(checkNewPassword(long, long)).toBeNull();
  });

  it('rejects a short password before it ever reaches the server', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(checkNewPassword(short, short)).toBe('too-short');
  });

  it('rejects a mismatch', () => {
    expect(checkNewPassword(long, `${long}x`)).toBe('mismatch');
  });

  it('reports length before mismatch, so people fix one thing at a time', () => {
    expect(checkNewPassword('abc', 'xyz')).toBe('too-short');
  });

  it('has a message for every problem and none for success', () => {
    expect(describePasswordProblem('too-short')).toContain(String(MIN_PASSWORD_LENGTH));
    expect(describePasswordProblem('mismatch')).toBeTruthy();
    expect(describePasswordProblem(null)).toBeNull();
  });
});
