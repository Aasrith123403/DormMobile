/**
 * Environment access. Expo inlines `process.env.EXPO_PUBLIC_*` at build time,
 * so these must be referenced as full static property paths — destructuring
 * `process.env` would leave them undefined in a release bundle.
 */

import { normalizeSupabaseUrl, supabaseUrlExtraPath } from '../core/supabaseUrl';

export type OcrProviderName = 'google' | 'ocrspace' | 'none';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const OCR_PROVIDER = process.env.EXPO_PUBLIC_OCR_PROVIDER ?? 'none';
const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY ?? '';
const OCRSPACE_API_KEY = process.env.EXPO_PUBLIC_OCRSPACE_API_KEY ?? '';

function isPlaceholder(value: string): boolean {
  return value === '' || value.includes('your-project-ref') || value.startsWith('your-');
}

const extraPath = supabaseUrlExtraPath(SUPABASE_URL);
if (extraPath && __DEV__) {
  console.warn(
    `[RoomLedger] EXPO_PUBLIC_SUPABASE_URL should be the project origin only — ignoring "${extraPath}". ` +
      'Copy the Project URL, not the REST endpoint, from Project Settings → Data API.'
  );
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(SUPABASE_URL),
  supabaseAnonKey: SUPABASE_ANON_KEY,
  ocrProvider: (['google', 'ocrspace', 'none'].includes(OCR_PROVIDER)
    ? OCR_PROVIDER
    : 'none') as OcrProviderName,
  googleVisionApiKey: GOOGLE_VISION_API_KEY,
  ocrSpaceApiKey: OCRSPACE_API_KEY,
};

/** True once real Supabase credentials are present in .env. */
export const isSupabaseConfigured =
  !isPlaceholder(env.supabaseUrl) && !isPlaceholder(env.supabaseAnonKey);

export const missingEnvMessage =
  'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env (copy .env.example), then restart the dev server.';
