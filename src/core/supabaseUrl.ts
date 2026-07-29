/**
 * Supabase project URL normalisation. Pure, so it can be unit tested.
 *
 * supabase-js appends its own paths (`/auth/v1/…`, `/rest/v1/…`) to the URL it
 * is given, so anything beyond the origin breaks every request with "Invalid
 * path specified in request URL". The Supabase dashboard displays the REST
 * endpoint immediately beside the Project URL, and pasting the wrong one is an
 * easy mistake with a completely unhelpful error — so it is corrected here
 * rather than left as a debugging exercise.
 */

const ORIGIN_AND_PATH = /^(https?:\/\/[^/]+)(\/.*)?$/;

/** Reduces a configured URL to its bare origin. */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  const match = ORIGIN_AND_PATH.exec(trimmed);
  return match ? match[1] : trimmed;
}

/** The path that normalisation discarded, or null. Used to warn in dev. */
export function supabaseUrlExtraPath(raw: string): string | null {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  const match = ORIGIN_AND_PATH.exec(trimmed);
  return match?.[2] ? match[2] : null;
}
