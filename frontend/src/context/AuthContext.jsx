import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { setToken } from '../lib/tokenStore.js';

const AuthContext = createContext(null);

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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    setToken(null);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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
