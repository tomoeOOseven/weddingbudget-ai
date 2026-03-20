import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // Supabase auth user
  const [profile, setProfile] = useState(null);   // public.profiles row
  const [loading, setLoading] = useState(true);

  // Fetch profile (role, name, etc.) for a given auth user
  async function fetchProfile(authUser) {
    if (!authUser) { setProfile(null); return; }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (error) console.error('Profile fetch error:', error.message);
    else setProfile(data);
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      fetchProfile(u).finally(() => setLoading(false));
    });

    // Listen for sign-in / sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        await fetchProfile(u);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Auth actions ────────────────────────────────────────────

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  // ── Role helpers ────────────────────────────────────────────

  const isAdmin      = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  const isClient     = profile?.role === 'client';
  const role         = profile?.role ?? null;

  const value = {
    user,
    profile,
    role,
    loading,
    isAdmin,
    isSuperAdmin,
    isClient,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook — use anywhere in the app
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
