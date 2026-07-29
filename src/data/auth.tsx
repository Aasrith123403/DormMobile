import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { UserRow } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { clearGroupCache } from './groupStore';

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  profile: UserRow | null;
  /** True until the persisted session has been read from storage. */
  initializing: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<UserRow, 'name' | 'venmo_username' | 'avatar_url'>>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        // Covers expiry and sign-out from another tab, not just the button.
        clearGroupCache();
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;

    if (data) {
      setProfile(data as UserRow);
      return;
    }

    // The handle_new_user trigger normally creates this row. If the trigger
    // was never installed, fall back to creating it from the client so the
    // app still works — users.id is locked to auth.uid() by RLS either way.
    const fallbackName =
      (session?.user.user_metadata?.name as string | undefined)?.trim() ||
      session?.user.email?.split('@')[0] ||
      'Roommate';

    const { data: created, error: insertError } = await supabase
      .from('users')
      .upsert({ id: userId, name: fallbackName }, { onConflict: 'id' })
      .select()
      .single();

    if (insertError) throw insertError;
    setProfile(created as UserRow);
  }, [userId, session?.user]);

  useEffect(() => {
    if (!userId) return;
    void refreshProfile().catch(() => {
      /* surfaced by the screens that need the profile */
    });
  }, [userId, refreshProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId,
      profile,
      initializing,

      async signUp(email, password, name) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (error) throw error;
      },

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signOut() {
        await supabase.auth.signOut();
        setProfile(null);
        clearGroupCache();
      },

      async updateProfile(patch) {
        if (!userId) throw new Error('not_authenticated');
        const { data, error } = await supabase
          .from('users')
          .update(patch)
          .eq('id', userId)
          .select()
          .single();
        if (error) throw error;
        setProfile(data as UserRow);
      },

      refreshProfile,
    }),
    [session, userId, profile, initializing, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
