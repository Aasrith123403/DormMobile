import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { parseRecoveryUrl } from '../core/recoveryLink';
import type { UserRow } from '../lib/database.types';
import { passwordResetRedirectTo, supabase } from '../lib/supabase';
import { clearGroupCache } from './groupStore';

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  profile: UserRow | null;
  initializing: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  recovering: boolean;
  recoveryError: string | null;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  cancelRecovery: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<UserRow, 'name' | 'venmo_username' | 'avatar_url'>>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (!next) {
        setProfile(null);
        setRecovering(false);
        clearGroupCache();
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const handle = async (url: string | null) => {
      const link = parseRecoveryUrl(url);
      if (!active || link.kind === 'none') return;
      if (link.kind === 'error') {
        setRecoveryError(link.message);
        setRecovering(true);
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
      if (!active) return;
      if (error) {
        setRecoveryError('That reset link is no longer valid. Request a new one.');
        setRecovering(true);
        return;
      }

      setRecoveryError(null);
      setRecovering(true);
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', ({ url }) => void handle(url));
    return () => {
      active = false;
      subscription.remove();
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
    });
  }, [userId, refreshProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId,
      profile,
      initializing,
      recovering,
      recoveryError,
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
        setRecovering(false);
        setRecoveryError(null);
        clearGroupCache();
      },

      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: passwordResetRedirectTo(),
        });

        if (error) throw error;
      },

      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecoveryError(null);
        setRecovering(false);
      },

      async cancelRecovery() {
        setRecoveryError(null);
        setRecovering(false);
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
    [session, userId, profile, initializing, recovering, recoveryError, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
