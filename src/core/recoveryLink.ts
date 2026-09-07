export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }

  | { kind: 'error'; message: string }

  | { kind: 'none' };

function describeError(code: string | null, description: string | null): string {
  const normalized = (code ?? '').toLowerCase();
  if (normalized.includes('expired') || /expired/i.test(description ?? '')) {
    return 'That reset link has expired. Request a new one.';
  }
  if (normalized.includes('used') || /already/i.test(description ?? '')) {
    return 'That reset link has already been used. Request a new one.';
  }

  const readable = (description ?? '').replace(/\+/g, ' ').trim();
  return readable || 'That reset link is not valid. Request a new one.';
}

export function parseRecoveryUrl(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: 'none' };
  const params = new URLSearchParams();
  const hashAt = url.indexOf('#');
  if (hashAt !== -1) {
    for (const [key, value] of new URLSearchParams(url.slice(hashAt + 1))) {
      params.set(key, value);
    }
  }

  const queryAt = url.indexOf('?');
  if (queryAt !== -1) {
    const end = hashAt !== -1 && hashAt > queryAt ? hashAt : url.length;
    for (const [key, value] of new URLSearchParams(url.slice(queryAt + 1, end))) {
      if (!params.has(key)) params.set(key, value);
    }
  }

  const error = params.get('error') ?? params.get('error_code');
  if (error) {
    return { kind: 'error', message: describeError(error, params.get('error_description')) };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  if (!accessToken || !refreshToken) return { kind: 'none' };
  if (type && type !== 'recovery') return { kind: 'none' };
  return { kind: 'tokens', accessToken, refreshToken };
}

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordProblem = 'too-short' | 'mismatch' | null;

export function checkNewPassword(password: string, confirmation: string): PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too-short';
  if (password !== confirmation) return 'mismatch';
  return null;
}

export function describePasswordProblem(problem: PasswordProblem): string | null {
  switch (problem) {
    case 'too-short':
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'mismatch':
      return 'Those two do not match.';
    default:
      return null;
  }
}
