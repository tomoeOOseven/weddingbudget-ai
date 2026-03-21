import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { setToken } from '../lib/tokenStore.js';

const AuthContext = createContext(null);
let authOpQueue = Promise.resolve();

function isSupabaseLockRace(error) {
  const msg = error?.message ?? '';
  return /Lock broken by another request with the 'steal' option/i.test(msg);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function isTimeoutError(error) {
  const msg = error?.message ?? '';
  return /timed out/i.test(msg);
}

function clearLocalAuthState() {
  try {
    localStorage.removeItem('wdtch-web-auth');
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.includes('auth-token'))
      .forEach(k => localStorage.removeItem(k));
  } catch {
    // ignore storage cleanup errors
  }
}

function runAuthOp(task) {
  const next = authOpQueue.then(
    () => withTimeout(task(), 12000, 'Auth operation timed out. Please retry.'),
    () => withTimeout(task(), 12000, 'Auth operation timed out. Please retry.')
  );
  authOpQueue = next.catch(() => {});
  return next;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(authUser) {
    if (!authUser) { setProfile(null); return; }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (error) console.error('Profile fetch error:', error.message);
      else setProfile(data);
    } catch (err) {
      console.error('Profile fetch exception:', err.message);
    }
  }

  useEffect(() => {
    // Supabase v2: onAuthStateChange fires INITIAL_SESSION synchronously on
    // subscription setup. This is the ONLY place we read session state.
    //
    // Never call getSession() alongside this — it races for the same internal
    // storage lock and causes "Lock broken by another request with the 'steal'
    // option", which also blocks the loading spinner from ever clearing.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setToken(session?.access_token ?? null);
        const u = session?.user ?? null;
        setUser(u);
        await fetchProfile(u);

        // INITIAL_SESSION is always the first event fired — safe to clear loading here
        if (event === 'INITIAL_SESSION') {
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    return runAuthOp(async () => {
      // Supabase auth lock can race in local dev/browser-tab contention.
      // Retry once on the known transient lock-steal error.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let data;
        let error;
        try {
          const res = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            10000,
            'Sign-in request timed out. Please retry.'
          );
          data = res?.data;
          error = res?.error;
        } catch (err) {
          if (attempt === 0 && isTimeoutError(err)) {
            clearLocalAuthState();
            await sleep(250);
            continue;
          }
          return { data: null, error: { message: err?.message || 'Sign-in failed. Please retry.' } };
        }

        if (!error) return { data, error: null };
        if (attempt === 0 && isSupabaseLockRace(error)) {
          clearLocalAuthState();
          await sleep(200);
          continue;
        }
        return { data: null, error };
      }

      return { data: null, error: { message: 'Sign-in failed. Please retry.' } };
    });
  }

  async function signOut() {
    return runAuthOp(async () => {
      setToken(null);
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    });
  }

  const isAdmin      = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  const isClient     = profile?.role === 'client';
  const role         = profile?.role ?? null;

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, isAdmin, isSuperAdmin, isClient, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
