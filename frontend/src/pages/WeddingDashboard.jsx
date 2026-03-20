import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function apiFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session?.access_token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed'); }
  return res.json();
}

function fmt(n) { return n ? '₹' + Number(n).toLocaleString('en-IN') : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : null; }

export default function WeddingDashboard({ onSelectWedding }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [weddings, setWeddings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]           = useState({ name:'', weddingDate:'', totalGuests:'', roomsBlocked:'' });
  const [creating, setCreating]   = useState(false);

  useEffect(() => {
    apiFetch('/api/weddings')
      .then(d => setWeddings(d.weddings ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const data = await apiFetch('/api/weddings', {
        method: 'POST',
        body: JSON.stringify({
          name:          form.name,
          weddingDate:   form.weddingDate || null,
          totalGuests:   form.totalGuests ? parseInt(form.totalGuests) : null,
          roomsBlocked:  form.roomsBlocked ? parseInt(form.roomsBlocked) : null,
        }),
      });
      setWeddings(w => [data.wedding, ...w]);
      setShowCreate(false);
      setForm({ name:'', weddingDate:'', totalGuests:'', roomsBlocked:'' });
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  }

  const S = {
    page: { minHeight:'100vh', background:'var(--cream)', fontFamily:"'Jost',sans-serif" },
    header: { background:'var(--maroon)', padding:'16px 28px', display:'flex', justifyContent:'space-between', alignItems:'center' },
    logo: { fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:'var(--gold)', fontWeight:700 },
    greeting: { fontSize:12, color:'rgba(232,201,122,0.6)', marginTop:2 },
    body: { maxWidth:900, margin:'0 auto', padding:'32px 20px' },
    title: { fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:'var(--maroon)', marginBottom:6 },
    sub: { color:'var(--muted)', fontSize:13, marginBottom:28 },
    card: (hover) => ({ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px', cursor:'pointer', transition:'all 0.15s', boxShadow: hover ? '0 4px 16px rgba(107,30,58,0.1)' : 'none', borderColor: hover ? 'var(--gold)' : 'var(--border)' }),
    newBtn: { padding:'13px 24px', background:'var(--maroon)', border:'none', borderRadius:8, color:'var(--gold)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Jost',sans-serif" },
    label: { display:'block', fontSize:10, letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--muted)', marginBottom:6, fontWeight:600 },
    input: { width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:14, outline:'none', fontFamily:"'Jost',sans-serif", boxSizing:'border-box', marginBottom:16 },
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.logo}>WeddingBudget<span>.ai</span></div>
          <div style={S.greeting}>Welcome back, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋</div>
        </div>
        <button onClick={signOut} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:7, color:'rgba(232,201,122,0.7)', fontSize:12, padding:'7px 14px', cursor:'pointer', fontFamily:"'Jost',sans-serif" }}>
          Sign out
        </button>
      </div>

      <div style={S.body}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={S.title}>Your Wedding Projects</h1>
            <p style={S.sub}>Select a wedding to build its budget estimate, or create a new one.</p>
          </div>
          <button style={S.newBtn} onClick={() => setShowCreate(true)}>+ New Wedding</button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'24px', marginBottom:24 }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)', marginBottom:20 }}>New Wedding Project</div>
            <form onSubmit={handleCreate}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={S.label}>Wedding Name *</label>
                  <input style={S.input} required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Priya & Arjun Wedding" />
                </div>
                <div>
                  <label style={S.label}>Wedding Date</label>
                  <input style={S.input} type="date" value={form.weddingDate} onChange={e => setForm(f => ({...f, weddingDate: e.target.value}))} />
                </div>
                <div>
                  <label style={S.label}>Total Guests (approx)</label>
                  <input style={S.input} type="number" value={form.totalGuests} onChange={e => setForm(f => ({...f, totalGuests: e.target.value}))} placeholder="300" />
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button type="submit" disabled={creating || !form.name} style={{ ...S.newBtn, opacity: creating || !form.name ? 0.5 : 1 }}>
                  {creating ? 'Creating…' : 'Create Wedding'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding:'13px 20px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', fontSize:13, cursor:'pointer', fontFamily:"'Jost',sans-serif" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Wedding list */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'48px', color:'var(--muted)', fontSize:14 }}>Loading your weddings…</div>
        ) : weddings.length === 0 && !showCreate ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>💒</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:'var(--maroon)', marginBottom:8 }}>No weddings yet</div>
            <div style={{ color:'var(--muted)', fontSize:13, marginBottom:24 }}>Create your first wedding project to start building a budget estimate.</div>
            <button style={S.newBtn} onClick={() => setShowCreate(true)}>+ Create Your First Wedding</button>
          </div>
        ) : (
          <div style={{ display:'grid', gap:16 }}>
            {weddings.map(w => {
              const estimate = w.budget_estimates?.find(e => e.is_current);
              return (
                <HoverCard key={w.id} style={S.card} onClick={() => onSelectWedding(w)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                    <div>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)', fontWeight:700 }}>{w.name}</div>
                      <div style={{ fontSize:12, color:'var(--muted)', marginTop:4, display:'flex', gap:12 }}>
                        {w.cities?.label && <span>📍 {w.cities.label}</span>}
                        {w.hotel_tiers?.label && <span>🏨 {w.hotel_tiers.label}</span>}
                        {w.total_guests && <span>👥 {w.total_guests} guests</span>}
                        {w.wedding_date && <span>📅 {fmtDate(w.wedding_date)}</span>}
                      </div>
                    </div>
                    {estimate ? (
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>Current estimate</div>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)', fontWeight:700 }}>
                          {fmt(estimate.total_min)} – {fmt(estimate.total_max)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>No estimate yet — click to start</div>
                    )}
                  </div>
                </HoverCard>
              );
            })}
          </div>
        )}

        {/* Quick-start without account */}
        <div style={{ marginTop:32, paddingTop:24, borderTop:'1px solid var(--border)', textAlign:'center' }}>
          <button onClick={() => onSelectWedding(null)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
            Continue without saving (guest mode)
          </button>
        </div>
      </div>
    </div>
  );
}

function HoverCard({ children, onClick, style }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={style(hover)}>
      {children}
    </div>
  );
}
