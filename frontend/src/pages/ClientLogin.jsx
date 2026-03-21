import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

const S = {
  page: { minHeight:'100vh', background:'var(--cream)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Jost',sans-serif", padding:20 },
  card: { background:'#fff', border:'1px solid var(--border)', borderRadius:16, padding:'44px 40px', width:'100%', maxWidth:420, boxShadow:'0 12px 40px rgba(107,30,58,0.08)' },
  logo: { fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:700, color:'var(--maroon)', textAlign:'center', marginBottom:4 },
  sub:  { fontSize:11, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', textAlign:'center', marginBottom:32 },
  tabs: { display:'flex', background:'#f5f0eb', borderRadius:8, padding:4, marginBottom:24 },
  tab:  (a) => ({ flex:1, padding:'8px', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'Jost',sans-serif", background:a?'#fff':'transparent', color:a?'var(--maroon)':'var(--muted)', boxShadow:a?'0 1px 4px rgba(0,0,0,0.08)':'none' }),
  label:{ display:'block', fontSize:10, letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--muted)', marginBottom:6, fontWeight:600 },
  input:{ width:'100%', padding:'11px 14px', border:'1px solid var(--border)', borderRadius:8, fontSize:14, outline:'none', fontFamily:"'Jost',sans-serif", color:'var(--text)', boxSizing:'border-box', marginBottom:16 },
  btn:  (dis) => ({ width:'100%', padding:'13px', background:'var(--maroon)', border:'none', borderRadius:8, color:'var(--gold)', fontSize:14, fontWeight:700, cursor:dis?'default':'pointer', opacity:dis?0.5:1, fontFamily:"'Jost',sans-serif", letterSpacing:'0.5px', marginTop:4 }),
  err:  { background:'rgba(220,53,69,0.08)', border:'1px solid rgba(220,53,69,0.2)', borderRadius:8, padding:'10px 14px', color:'#dc2626', fontSize:12, marginBottom:16, lineHeight:1.5 },
  ok:   { background:'rgba(22,163,74,0.08)', border:'1px solid rgba(22,163,74,0.2)', borderRadius:8, padding:'10px 14px', color:'#15803d', fontSize:12, marginBottom:16 },
  linkBtn: { background:'none', border:'none', color:'var(--maroon)', fontSize:12, cursor:'pointer', textDecoration:'underline', padding:0, marginBottom:14, fontFamily:"'Jost',sans-serif" },
};

export default function ClientLogin() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [ok, setOk]           = useState('');
  const navigate = useNavigate();

  // Redirect if already logged in — uses AuthContext, no extra getSession() call
  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true });
  }, [authLoading, user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setOk(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate('/', { replace: true });
      } else {
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        });
        if (err) throw err;
        setOk('Account created! Check your email to confirm, then log in.');
        setMode('login');
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleForgotPassword() {
    setError('');
    setOk('');
    if (!email.trim()) {
      setError('Enter your email first, then click Forgot password.');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (err) throw err;
      setOk('Password reset email sent. Check your inbox.');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>WeddingBudget<span style={{ color:'var(--gold)' }}>.ai</span></div>
        <div style={S.sub}>India's Intelligent Wedding Cost Estimator</div>

        <div style={S.tabs}>
          <button style={S.tab(mode==='login')} onClick={() => { setMode('login'); setError(''); setOk(''); }}>Sign In</button>
          <button style={S.tab(mode==='signup')} onClick={() => { setMode('signup'); setError(''); setOk(''); }}>Create Account</button>
        </div>

        {error && <div style={S.err}>{error}</div>}
        {ok    && <div style={S.ok}>{ok}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div>
              <label style={S.label}>Your Name</label>
              <input style={S.input} type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Priya Sharma" />
            </div>
          )}
          <label style={S.label}>Email Address</label>
          <input style={S.input} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'login' && (
            <button type="button" style={S.linkBtn} onClick={handleForgotPassword} disabled={loading}>
              Forgot password?
            </button>
          )}
          <button type="submit" style={S.btn(loading || !email || !password)} disabled={loading || !email || !password}>
            {loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:20, fontSize:11, color:'var(--muted)' }}>
          Are you the Events by Athea team?{' '}
          <a href="/admin/login" style={{ color:'var(--maroon)', textDecoration:'none', fontWeight:600 }}>Admin Login →</a>
        </div>
      </div>
    </div>
  );
}
