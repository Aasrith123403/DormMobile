const ORIGIN_AND_PATH = /^(https?:\/\/[^/]+)(\/.*)?$/;

export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const match = ORIGIN_AND_PATH.exec(trimmed);
  return match ? match[1] : trimmed;
}

export function supabaseUrlExtraPath(raw: string): string | null {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const match = ORIGIN_AND_PATH.exec(trimmed);
  return match?.[2] ? match[2] : null;
}
