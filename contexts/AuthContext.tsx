import React, { createContext, useContext, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { setCurrentUserId } from '../lib/session';
import type { User, Session } from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('[auth] getSession timed out — proceeding with no session');
      setLoading(false);
    }, 6000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setCurrentUserId(session?.user?.id ?? null);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(async (err) => {
        clearTimeout(timeout);
        console.error('[auth] getSession error:', err?.message ?? err);

        // Handle invalid refresh token errors
        if (err?.message?.includes('Invalid Refresh Token') ||
            err?.message?.includes('Refresh Token Not Found')) {
          console.log('[auth] Invalid refresh token detected, clearing session and redirecting to login');
          try {
            await supabase.auth.signOut();
            setCurrentUserId(null);
            setSession(null);
            setUser(null);
            router.replace('/(auth)/login');
          } catch (signOutError) {
            console.error('[auth] Error during signOut:', signOutError);
            // Still redirect to login even if signOut fails
            router.replace('/(auth)/login');
          }
        }

        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        setCurrentUserId(session?.user?.id ?? null);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === 'SIGNED_OUT') {
          router.replace('/(auth)/login');
        }
        // SIGNED_IN navigation is intentionally not handled here.
        // Email/password: login.tsx navigates after signIn() resolves.
        // Google OAuth: signInWithGoogle() navigates after exchangeCodeForSession() succeeds.
        // This prevents a dismissed OAuth browser from triggering login via the
        // SIGNED_IN event that Supabase fires before openAuthSessionAsync returns.
      } catch (err: any) {
        console.error('[auth] onAuthStateChange error:', err?.message ?? err);

        // Handle invalid refresh token errors
        if (err?.message?.includes('Invalid Refresh Token') ||
            err?.message?.includes('Refresh Token Not Found')) {
          console.log('[auth] Invalid refresh token in auth state change, clearing session and redirecting to login');
          try {
            await supabase.auth.signOut();
            setCurrentUserId(null);
            setSession(null);
            setUser(null);
            router.replace('/(auth)/login');
          } catch (signOutError) {
            console.error('[auth] Error during signOut in auth state change:', signOutError);
            // Still redirect to login even if signOut fails
            router.replace('/(auth)/login');
          }
        }

        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    setCurrentUserId(null);
    await supabase.auth.signOut();
    await AsyncStorage.removeItem('supabase.auth.token');
    setUser(null);
    setSession(null);
  };

  const signInWithGoogle = async () => {
    const redirectTo = makeRedirectUri({ native: 'scandinordic://auth/callback' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    if (!data.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, 'scandinordic://');
    console.log('[auth] openAuthSessionAsync result.type:', result.type);

    if (result.type !== 'success') {
      // User dismissed the browser — clear any partial session Supabase may have set
      await supabase.auth.signOut();
      return; // caller (login.tsx) does NOT navigate after this returns
    }

    if (result.url) {
      const url = result.url;

      // Supabase v2 uses PKCE by default — the callback carries a one-time 'code' query param.
      // Implicit flow (access_token in URL fragment) is kept as a fallback for legacy configs.
      const code = url.match(/[?&]code=([^&]+)/)?.[1];

      if (code) {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.exchangeCodeForSession(decodeURIComponent(code));
        if (sessionError) {
          console.error('[auth] exchangeCodeForSession failed:', sessionError.message);
          throw sessionError;
        }
        const uid = sessionData.session?.user?.id ?? null;
        console.log('[auth] PKCE session — user.id:', uid);
        if (!uid) { await supabase.auth.signOut(); return; }
        setCurrentUserId(uid);
      } else {
        // Implicit flow fallback — tokens in URL fragment (only used if Supabase project
        // is explicitly configured for implicit flow in the dashboard)
        const accessToken  = url.match(/[#&?]access_token=([^&]+)/)?.[1];
        const refreshToken = url.match(/[#&?]refresh_token=([^&]+)/)?.[1];
        console.log('[auth] implicit flow | access_token:', !!accessToken, '| refresh_token:', !!refreshToken);
        if (!accessToken || !refreshToken) {
          console.error('[auth] no code or tokens in callback URL:', url);
          await supabase.auth.signOut();
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: decodeURIComponent(accessToken),
          refresh_token: decodeURIComponent(refreshToken),
        });
        if (sessionError) {
          console.error('[auth] setSession failed:', sessionError.message);
          throw sessionError;
        }
        const uid = sessionData.session?.user?.id ?? null;
        console.log('[auth] implicit setSession — user.id:', uid);
        if (!uid) { await supabase.auth.signOut(); return; }
        setCurrentUserId(uid);
      }
    }

    router.replace('/(tabs)');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
