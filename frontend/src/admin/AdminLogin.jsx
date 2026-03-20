import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const S = {
  page: {
    minHeight: '100vh', background: '#1a0a0a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Jost', sans-serif", padding: 20,
  },
  card: {
    background: '#2a1010', border: '1px solid rgba(232,201,122,0.2)',
    borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 420,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },
  logo: {
    fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700,
    color: '#E8C97A', textAlign: 'center', marginBottom: 4, letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase',
    color: 'rgba(232,201,122,0.45)', textAlign: 'center', marginBottom: 36,
  },
  label: {
    display: 'block', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'rgba(232,201,122,0.6)', marginBottom: 8, fontWeight: 600,
  },
  input: {
    width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(232,201,122,0.2)', borderRadius: 8, color: '#E8C97A',
    fontSize: 15, outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s',
    fontFamily: "'Jost', sans-serif",
  },
  inputFocus: { border: '1px solid rgba(232,201,122,0.6)' },
  fieldWrap: { marginBottom: 20 },
  btn: {
    width: '100%', padding: '14px', marginTop: 8,
    background: 'linear-gradient(135deg, #7a1c1c, #a02828)',
    border: 'none', borderRadius: 8, color: '#E8C97A',
    fontSize: 14, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
    cursor: 'pointer', transition: 'opacity 0.2s', fontFamily: "'Jost', sans-serif",
  },
  error: {
    background: 'rgba(220,53,69,0.12)', border: '1px solid rgba(220,53,69,0.3)',
    borderRadius: 8, padding: '12px 16px', color: '#ff8080',
    fontSize: 13, marginBottom: 20, lineHeight: 1.5,
  },
  badge: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(232,201,122,0.1)',
    fontSize: 11, color: 'rgba(232,201,122,0.3)', letterSpacing: '1px',
  },
};

export default function AdminLogin() {
  const { signIn, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focusField, setFocusField] = useState('');

  // If already logged in as admin, redirect immediately
  useEffect(() => {
    if (!loading && isAdmin) {
      const dest = location.state?.from?.pathname ?? '/admin';
      navigate(dest, { replace: true });
    }
  }, [loading, isAdmin]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { data, error: signInError } = await signIn(email.trim(), password);

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    // After sign-in, AuthContext fetches profile. Give it a moment then check role.
    // (onAuthStateChange will update isAdmin, which triggers the useEffect above.)
    // If the user signed in but isn't an admin, show a clear message.
    setTimeout(() => {
      // This runs after the auth state update cycle
      setSubmitting(false);
    }, 500);
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          WeddingBudget<span style={{ color: '#E8C97A' }}>.ai</span>
        </div>
        <div style={S.subtitle}>Admin Portal</div>

        {error && (
          <div style={S.error}>
            ⚠️ {error === 'Invalid login credentials'
              ? 'Incorrect email or password. Make sure your account has admin access.'
              : error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={S.fieldWrap}>
            <label style={S.label}>Email address</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setFocusField('email')}
              onBlur={() => setFocusField('')}
              style={{
                ...S.input,
                ...(focusField === 'email' ? S.inputFocus : {}),
              }}
              placeholder="admin@eventsbyathea.com"
            />
          </div>

          <div style={S.fieldWrap}>
            <label style={S.label}>Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocusField('password')}
              onBlur={() => setFocusField('')}
              style={{
                ...S.input,
                ...(focusField === 'password' ? S.inputFocus : {}),
              }}
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            style={{ ...S.btn, opacity: (submitting || !email || !password) ? 0.5 : 1 }}
          >
            {submitting ? 'Signing in…' : 'Sign in to Admin Panel'}
          </button>
        </form>

        <div style={S.badge}>
          <span>🔒</span>
          <span>Restricted to Events by Athea team</span>
        </div>
      </div>
    </div>
  );
}
