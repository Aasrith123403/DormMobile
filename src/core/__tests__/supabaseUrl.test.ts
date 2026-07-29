import { normalizeSupabaseUrl, supabaseUrlExtraPath } from '../supabaseUrl';

describe('normalizeSupabaseUrl', () => {
  it('leaves a correct project URL alone', () => {
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co')).toBe('https://abcd1234.supabase.co');
  });

  it('strips a trailing slash', () => {
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/')).toBe('https://abcd1234.supabase.co');
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co///')).toBe('https://abcd1234.supabase.co');
  });

  it('strips the REST endpoint path people paste by mistake', () => {
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/rest/v1/')).toBe(
      'https://abcd1234.supabase.co'
    );
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/auth/v1')).toBe(
      'https://abcd1234.supabase.co'
    );
  });

  it('trims stray whitespace from copy-paste', () => {
    expect(normalizeSupabaseUrl('  https://abcd1234.supabase.co  ')).toBe(
      'https://abcd1234.supabase.co'
    );
  });

  it('keeps a port for local development', () => {
    expect(normalizeSupabaseUrl('http://localhost:54321/rest/v1')).toBe('http://localhost:54321');
  });

  it('returns empty for empty input', () => {
    expect(normalizeSupabaseUrl('')).toBe('');
    expect(normalizeSupabaseUrl('   ')).toBe('');
  });
});

describe('supabaseUrlExtraPath', () => {
  it('reports the discarded path so the app can warn about it', () => {
    expect(supabaseUrlExtraPath('https://abcd1234.supabase.co/rest/v1/')).toBe('/rest/v1');
    expect(supabaseUrlExtraPath('https://abcd1234.supabase.co/auth/v1')).toBe('/auth/v1');
  });

  it('reports nothing for a clean origin', () => {
    expect(supabaseUrlExtraPath('https://abcd1234.supabase.co')).toBeNull();
    expect(supabaseUrlExtraPath('https://abcd1234.supabase.co/')).toBeNull();
    expect(supabaseUrlExtraPath('')).toBeNull();
  });
});
