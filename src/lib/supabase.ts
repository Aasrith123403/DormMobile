import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env, isSupabaseConfigured } from './env';
import type { Database } from './database.types';

/**
 * A single shared client. Sessions persist in AsyncStorage so the app opens
 * straight to the balances — no login on every launch.
 */
export const supabase = createClient<Database>(
  isSupabaseConfigured ? env.supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? env.supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Native apps never carry the session in a URL fragment.
      detectSessionInUrl: false,
    },
  }
);

// Refresh tokens only while the app is in the foreground; otherwise the timer
// keeps the JS runtime awake in the background for nothing.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

/** Turns a PostgREST/Supabase error into something worth showing a roommate. */
export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong.';

  const message =
    typeof error === 'string'
      ? error
      : ((error as { message?: string }).message ?? 'Something went wrong.');

  if (/invalid_join_code/i.test(message)) return "That join code doesn't match any group.";
  if (/not_authenticated/i.test(message)) return 'Please sign in again.';
  if (/no_split_members/i.test(message)) return 'Include at least one person in the split.';
  if (/duplicate key|already exists/i.test(message)) return "That's already been added.";
  if (/Invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/User already registered/i.test(message)) {
    return 'That email already has an account — sign in instead.';
  }
  if (/Password should be/i.test(message)) return 'Password must be at least 6 characters.';

  // Supabase's built-in SMTP allows only a couple of messages per hour. The
  // account itself is usually already created, so signing in is the way out.
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(message)) {
    return "Supabase's email limit is used up for now. The account may already exist — try signing in. To stop sending confirmation emails entirely, turn off “Confirm email” in Authentication → Sign In / Providers.";
  }
  if (/For security purposes, you can only request this after/i.test(message)) {
    return 'Too many attempts just now. Wait a few seconds and try again.';
  }
  if (/Email not confirmed/i.test(message)) {
    return 'Confirm your email from the link we sent, or turn off “Confirm email” in Supabase for testing.';
  }
  // A missing function or relationship almost always means a migration in
  // supabase/migrations/ has not been applied yet.
  if (/could not find the function|could not find a relationship|could not find the table/i.test(message)) {
    return 'This needs a database update — apply the latest file in supabase/migrations/ and try again.';
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return "You don't have access to that group.";
  }
  if (/Failed to fetch|Network request failed/i.test(message)) {
    return 'No connection. Check your network and try again.';
  }

  return message;
}
