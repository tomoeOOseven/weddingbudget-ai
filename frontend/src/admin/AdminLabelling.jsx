import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const FUNCTIONS    = ['haldi','mehendi','sangeet','baraat','pheras','reception','other'];
const STYLES       = ['Traditional','Boho','Modern','Contemporary','Romantic','Opulent','Rustic','Vintage'];
const COMPLEXITIES = ['low','medium','high','ultra'];
const FN_EMOJI     = { haldi:'💛', mehendi:'🌿', sangeet:'🎵', baraat:'🐴', pheras:'🔥', reception:'✨', other:'📷' };
const COMPLEXITY_COLOR = { low:'#16a34a', medium:'#d97706', high:'#dc2626', ultra:'#7c3aed' };

async function apiFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

function formatINR(n) {
  if (!n) return '—';
  return '₹' + Number(n).toLocaleString('en-IN');
}

// ── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color = '#7a1c1c' }) {
  return (
    <div style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:10, padding:'14px 20px', minWidth:120 }}>
      <div style={{ fontSize:24, fontWeight:700, color, fontFamily:"'Cormorant Garamond',serif" }}>{value ?? '—'}</div>
      <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{label}</div>
    </div>
  );
}

// ── Image Card ───────────────────────────────────────────────────────────────
function ImageCard({ image, onClick, selected }) {
  const hasPendingSuggestion = image.ai_label_suggestions?.some(s => s.status === 'pending');
  const isLabelled           = image.status === 'labelled';

  return (
    <div
      onClick={() => onClick(image)}
      style={{
        background:'#fff', borderRadius:10, overflow:'hidden', cursor:'pointer',
        border: selected ? '2px solid #7a1c1c' : '2px solid transparent',
        boxShadow: selected ? '0 0 0 3px rgba(122,28,28,0.15)' : '0 1px 4px rgba(0,0,0,0.08)',
        transition:'all 0.15s', position:'relative',
      }}
    >
      <div style={{ height:160, background:'#f5f0eb', overflow:'hidden', position:'relative' }}>
        <img src={image.publicUrl} alt={image.title ?? 'Decor image'} loading="lazy"
          style={{ width:'100%', height:'100%', objectFit:'cover' }}
          onError={e => { e.target.style.display='none'; }} />
        {hasPendingSuggestion && (
          <div style={{ position:'absolute', top:8, right:8, background:'#d97706', color:'#fff',
            fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:20, letterSpacing:'1px' }}>
            REVIEW PENDING
          </div>
        )}
        {isLabelled && (
          <div style={{ position:'absolute', top:8, right:8, background:'#16a34a', color:'#fff',
            fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:20, letterSpacing:'1px' }}>
            ✓ LABELLED
          </div>
        )}
      </div>
      <div style={{ padding:'10px 12px' }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#1a0a0a', lineHeight:1.3,
          overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
          {image.title ?? 'Untitled'}
        </div>
        <div style={{ fontSize:10, color:'#999', marginTop:4 }}>{image.scrape_sources?.name ?? 'Unknown source'}</div>
      </div>
    </div>
  );
}

// ── Label Form ───────────────────────────────────────────────────────────────
function LabelForm({ initial = {}, onSubmit, submitting, submitLabel = 'Save Label' }) {
  const [form, setForm] = useState({
    function_type: initial.function_type ?? '',
    style:         initial.style         ?? '',
    complexity:    initial.complexity    ?? '',
    cost_seed_min: initial.cost_seed_min ?? '',
    cost_seed_max: initial.cost_seed_max ?? '',
    notes:         initial.notes         ?? '',
  });

  const set   = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.function_type && form.style && form.complexity &&
    form.cost_seed_min !== '' && form.cost_seed_max !== '';

  const S = {
    row:   { display:'flex', gap:12, marginBottom:14 },
    label: { fontSize:10, letterSpacing:'1.5px', textTransform:'uppercase', color:'#888', fontWeight:600, marginBottom:5, display:'block' },
    sel:   { width:'100%', padding:'8px 10px', border:'1px solid #e0d5c5', borderRadius:7, fontSize:13,
             fontFamily:"'Jost',sans-serif", background:'#fff', color:'#1a0a0a', outline:'none' },
    input: { width:'100%', padding:'8px 10px', border:'1px solid #e0d5c5', borderRadius:7, fontSize:13,
             fontFamily:"'Jost',sans-serif", color:'#1a0a0a', outline:'none', boxSizing:'border-box' },
    btn:   { padding:'10px 20px', background:'#7a1c1c', border:'none', borderRadius:7, color:'#E8C97A',
             fontSize:13, fontWeight:700, cursor:'pointer', opacity:(submitting||!valid)?0.5:1,
             letterSpacing:'0.5px', fontFamily:"'Jost',sans-serif" },
  };

  return (
    <div>
      <div style={S.row}>
        <div style={{ flex:1 }}>
          <label style={S.label}>Function</label>
          <select style={S.sel} value={form.function_type} onChange={e => set('function_type', e.target.value)}>
            <option value="">Select…</option>
            {FUNCTIONS.map(f => <option key={f} value={f}>{FN_EMOJI[f]} {f.charAt(0).toUpperCase()+f.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ flex:1 }}>
          <label style={S.label}>Style</label>
          <select style={S.sel} value={form.style} onChange={e => set('style', e.target.value)}>
            <option value="">Select…</option>
            {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex:1 }}>
          <label style={S.label}>Complexity</label>
          <select style={S.sel} value={form.complexity} onChange={e => set('complexity', e.target.value)}>
            <option value="">Select…</option>
            {COMPLEXITIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div style={S.row}>
        <div style={{ flex:1 }}>
          <label style={S.label}>Cost Min (₹)</label>
          <input style={S.input} type="number" value={form.cost_seed_min}
            onChange={e => set('cost_seed_min', e.target.value)} placeholder="e.g. 120000" />
        </div>
        <div style={{ flex:1 }}>
          <label style={S.label}>Cost Max (₹)</label>
          <input style={S.input} type="number" value={form.cost_seed_max}
            onChange={e => set('cost_seed_max', e.target.value)} placeholder="e.g. 250000" />
        </div>
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={S.label}>Notes (optional)</label>
        <input style={S.input} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Any notes about this image…" />
      </div>
      <button style={S.btn} disabled={submitting || !valid} onClick={() => onSubmit(form)}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

// ── Image Detail Drawer ───────────────────────────────────────────────────────
function ImageDrawer({ image, bypass, onClose, onLabelled }) {
  const pendingSuggestion = image.ai_label_suggestions?.find(s => s.status === 'pending') ?? null;

  const [tab, setTab]           = useState(pendingSuggestion ? 'suggestion' : 'manual');
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(pendingSuggestion);
  const [aiError, setAiError]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]           = useState('');

  async function handleManualLabel(form) {
    setSubmitting(true); setMsg('');
    try {
      await apiFetch('/api/labelling/label', {
        method: 'POST',
        body: JSON.stringify({ imageId: image.id, ...form }),
      });
      setMsg('✓ Labelled and added to training set.');
      onLabelled(image.id);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    finally { setSubmitting(false); }
  }

  async function handleAutoTag() {
    setAiLoading(true); setAiError('');
    try {
      const data = await apiFetch(`/api/labelling/autotag/${image.id}`, {
        method: 'POST',
        body: JSON.stringify({ bypass }),
      });
      if (bypass) {
        // Applied directly — done
        setMsg('✓ AI tagged and added to training set automatically.');
        onLabelled(image.id);
      } else {
        // Staged for review — show suggestion tab
        setSuggestion(data.suggestion);
        setTab('suggestion');
      }
    } catch (e) { setAiError(e.message); }
    finally { setAiLoading(false); }
  }

  async function handleSuggestion(action, overrides = {}) {
    if (!suggestion) return;
    setSubmitting(true); setMsg('');
    try {
      await apiFetch(`/api/labelling/suggestions/${suggestion.id}`, {
        method: 'PUT',
        body: JSON.stringify({ action, overrides }),
      });
      if (action === 'reject') {
        setMsg('Suggestion rejected. Image stays in queue.');
        setSuggestion(null);
        setTab('manual');
      } else {
        setMsg(`✓ ${action === 'edit' ? 'Edited and accepted' : 'Accepted'} — added to training set.`);
        onLabelled(image.id);
      }
    } catch (e) { setMsg(`Error: ${e.message}`); }
    finally { setSubmitting(false); }
  }

  const tabStyle = (active) => ({
    padding:'8px 16px', border:'none', borderRadius:6, cursor:'pointer',
    fontSize:12, fontWeight:600, fontFamily:"'Jost',sans-serif",
    background: active ? '#fff' : 'transparent',
    color: active ? '#7a1c1c' : '#888',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
  });

  const msgStyle = {
    padding:'10px 14px', borderRadius:8, fontSize:13, marginTop:14,
    background: msg.startsWith('Error') ? 'rgba(220,53,69,0.08)' : 'rgba(22,163,74,0.08)',
    color: msg.startsWith('Error') ? '#dc2626' : '#15803d',
    border: `1px solid ${msg.startsWith('Error') ? 'rgba(220,53,69,0.2)' : 'rgba(22,163,74,0.2)'}`,
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', justifyContent:'flex-end' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:640, background:'#fff', height:'100vh', overflow:'auto', boxShadow:'-8px 0 32px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #f0e8e0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:'#1a0a0a' }}>{image.title ?? 'Untitled image'}</div>
            <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
              {image.scrape_sources?.name} · {image.width_px}×{image.height_px}px
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#888' }}>✕</button>
        </div>

        {/* Image */}
        <img src={image.publicUrl} alt="" style={{ width:'100%', maxHeight:320, objectFit:'contain', background:'#f5f0eb' }}
          onError={e => { e.target.style.background='#eee'; e.target.removeAttribute('src'); }} />

        <div style={{ padding:'20px 24px' }}>
          <a href={image.source_url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize:11, color:'#7a1c1c', textDecoration:'none' }}>
            ↗ View original source
          </a>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, margin:'16px 0', background:'#f5f0eb', borderRadius:8, padding:4 }}>
            <button style={tabStyle(tab==='manual')} onClick={() => setTab('manual')}>Manual Label</button>
            <button style={tabStyle(tab==='ai')} onClick={() => setTab('ai')}>AI Auto-Tag</button>
            {suggestion && (
              <button style={tabStyle(tab==='suggestion')} onClick={() => setTab('suggestion')}>
                🔔 Review Suggestion
              </button>
            )}
          </div>

          {/* Manual tab */}
          {tab === 'manual' && (
            <LabelForm
              initial={image.image_labels?.[0] ?? {}}
              onSubmit={handleManualLabel}
              submitting={submitting}
            />
          )}

          {/* AI tab */}
          {tab === 'ai' && (
            <div>
              {/* Mode indicator */}
              <div style={{ background:'#f9f5ef', border:'1px solid #e8d5b0', borderRadius:10,
                padding:'12px 16px', marginBottom:16, fontSize:12, color:'#7a1c1c' }}>
                {bypass
                  ? '⚡ Auto-approve mode — tags will be applied directly to the training set.'
                  : '🔍 Review mode — tags will be staged for your sign-off before entering the dataset.'}
                <div style={{ fontSize:11, color:'#999', marginTop:3 }}>
                  Change mode using the toggle at the top of the page.
                </div>
              </div>

              <p style={{ fontSize:13, color:'#666', lineHeight:1.6, marginBottom:16 }}>
                Send this image to <strong>Claude Vision</strong> via OpenRouter. It will classify the
                function type, decor style, complexity tier and estimate a cost range.
              </p>

              {aiError && (
                <div style={{ padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:14,
                  background:'rgba(220,53,69,0.08)', color:'#dc2626', border:'1px solid rgba(220,53,69,0.2)' }}>
                  ⚠️ {aiError}
                </div>
              )}

              <button
                disabled={aiLoading}
                onClick={handleAutoTag}
                style={{ padding:'12px 24px', background:'linear-gradient(135deg,#1a1a2e,#16213e)', border:'none',
                  borderRadius:8, color:'#E8C97A', fontSize:13, fontWeight:700, cursor:'pointer',
                  opacity:aiLoading?0.6:1, fontFamily:"'Jost',sans-serif", letterSpacing:'0.5px' }}
              >
                {aiLoading ? '🧠 Analysing…' : bypass ? '🤖 Tag with AI (Auto-approve)' : '🤖 Tag with AI (Review first)'}
              </button>
              <div style={{ fontSize:11, color:'#999', marginTop:10 }}>
                Uses Claude Sonnet vision. ~₹0.05–0.15 per image via OpenRouter.
              </div>
            </div>
          )}

          {/* Review Suggestion tab */}
          {tab === 'suggestion' && suggestion && (
            <div>
              <div style={{ background:'#f9f5ef', border:'1px solid #e8d5b0', borderRadius:10, padding:'16px', marginBottom:16 }}>
                <div style={{ fontSize:11, letterSpacing:'1.5px', textTransform:'uppercase', color:'#7a1c1c', fontWeight:700, marginBottom:10 }}>
                  AI Suggestion — {Math.round((suggestion.confidence ?? 0) * 100)}% confident
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
                  {[
                    { label:'Function',   value:`${FN_EMOJI[suggestion.suggested_function]??''} ${suggestion.suggested_function}` },
                    { label:'Style',      value: suggestion.suggested_style },
                    { label:'Complexity', value:<span style={{color:COMPLEXITY_COLOR[suggestion.suggested_complexity]}}>{suggestion.suggested_complexity}</span> },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize:10, color:'#999', marginBottom:3 }}>{item.label}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#1a0a0a' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#999', marginBottom:3 }}>Cost Range</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#1a0a0a' }}>
                    {formatINR(suggestion.suggested_cost_min)} – {formatINR(suggestion.suggested_cost_max)}
                  </div>
                </div>
                {suggestion.reasoning && (
                  <div style={{ marginTop:10, fontSize:12, color:'#666', fontStyle:'italic', lineHeight:1.5,
                    borderTop:'1px solid #e8d5b0', paddingTop:10 }}>
                    "{suggestion.reasoning}"
                  </div>
                )}
                <div style={{ fontSize:10, color:'#aaa', marginTop:8 }}>
                  {suggestion.model_used} · {suggestion.tokens_used} tokens · ${suggestion.cost_usd}
                </div>
              </div>

              <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                <button onClick={() => handleSuggestion('accept')} disabled={submitting}
                  style={{ flex:1, padding:'10px', background:'#15803d', border:'none', borderRadius:7,
                    color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:submitting?0.5:1,
                    fontFamily:"'Jost',sans-serif" }}>
                  ✓ Accept
                </button>
                <button onClick={() => handleSuggestion('reject')} disabled={submitting}
                  style={{ padding:'10px 16px', background:'#dc2626', border:'none', borderRadius:7,
                    color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:submitting?0.5:1,
                    fontFamily:"'Jost',sans-serif" }}>
                  ✕ Reject
                </button>
              </div>

              <div style={{ borderTop:'1px solid #f0e8e0', paddingTop:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#333', marginBottom:10 }}>
                  Or edit before accepting:
                </div>
                <LabelForm
                  initial={{
                    function_type: suggestion.suggested_function,
                    style:         suggestion.suggested_style,
                    complexity:    suggestion.suggested_complexity,
                    cost_seed_min: suggestion.suggested_cost_min,
                    cost_seed_max: suggestion.suggested_cost_max,
                  }}
                  onSubmit={(form) => handleSuggestion('edit', form)}
                  submitting={submitting}
                  submitLabel="Edit & Accept"
                />
              </div>
            </div>
          )}

          {msg && <div style={msgStyle}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Main Labelling Page ───────────────────────────────────────────────────────
export default function AdminLabelling() {
  const [tab, setTab]         = useState('queue');
  const [images, setImages]   = useState([]);
  const [stats, setStats]     = useState({});
  const [total, setTotal]     = useState(0);
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  // Global bypass toggle — controls all AI actions on this page
  const [bypass, setBypass]   = useState(false); // default: sign-off required
  const [batchMode, setBatchMode]     = useState(false);
  const [batchSelected, setBatchSelected] = useState(new Set());
  const [batchMsg, setBatchMsg] = useState('');

  const LIMIT = 24;

  const loadStats = useCallback(async () => {
    try { setStats(await apiFetch('/api/labelling/stats')); } catch {}
  }, []);

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const status = tab === 'dataset' ? 'labelled' : 'raw';
      const params = new URLSearchParams({ limit: LIMIT, offset, status });
      const data   = await apiFetch(`/api/labelling/queue?${params}`);
      setImages(data.images ?? []);
      setTotal(data.total ?? 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [tab, offset]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadImages(); setSelected(null); }, [loadImages]);

  function handleLabelled(imageId) {
    setImages(imgs => imgs.map(img => img.id === imageId ? { ...img, status: 'labelled' } : img));
    loadStats();
    setSelected(null);
  }

  async function handleBatchAutoTag() {
    if (!batchSelected.size) return;
    setBatchMsg('');
    try {
      const data = await apiFetch('/api/labelling/autotag/batch', {
        method: 'POST',
        body: JSON.stringify({ imageIds: [...batchSelected], bypass }),
      });
      setBatchMsg(`✓ ${data.message}`);
      setBatchSelected(new Set());
      setBatchMode(false);
      if (bypass) loadImages();
      else loadStats();
    } catch (e) { setBatchMsg(`Error: ${e.message}`); }
  }

  const S = {
    topbar: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 },
    stats:  { display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 },
    tabs:   { display:'flex', gap:0, marginBottom:20, background:'#f5f0eb', borderRadius:8, padding:4 },
    tabBtn: (active) => ({
      padding:'8px 18px', border:'none', borderRadius:6, cursor:'pointer',
      fontSize:12, fontWeight:600, fontFamily:"'Jost',sans-serif",
      background: active ? '#fff' : 'transparent', color: active ? '#7a1c1c' : '#888',
      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
    }),
    grid:   { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:14 },
    pgBtn:  (disabled) => ({
      padding:'8px 16px', border:'1px solid #e0d5c5', borderRadius:7,
      background: disabled?'#f9f9f9':'#fff', color: disabled?'#ccc':'#7a1c1c',
      cursor: disabled?'default':'pointer', fontSize:12, fontWeight:600, fontFamily:"'Jost',sans-serif",
    }),
  };

  return (
    <div style={{ fontFamily:"'Jost',sans-serif" }}>
      {/* Header row */}
      <div style={S.topbar}>
        <div>
          <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:'#1a0a0a', margin:0 }}>
            🏷️ Labelling Queue
          </h1>
          <p style={{ color:'#888', fontSize:13, margin:'4px 0 0' }}>
            Tag scraped images to build the decor cost prediction dataset.
          </p>
        </div>

        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          {/* Global bypass toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'#fff',
            border:'1px solid #e0d5c5', borderRadius:8, padding:'8px 14px' }}>
            <div style={{ fontSize:12, color:'#555' }}>
              <div style={{ fontWeight:700, color: bypass ? '#7a1c1c' : '#555' }}>
                {bypass ? '⚡ Auto-approve' : '🔍 Review mode'}
              </div>
              <div style={{ fontSize:10, color:'#aaa' }}>
                {bypass ? 'AI → dataset directly' : 'AI → sign-off → dataset'}
              </div>
            </div>
            <div
              onClick={() => setBypass(b => !b)}
              style={{ width:44, height:24, borderRadius:12, cursor:'pointer', position:'relative', flexShrink:0,
                background: bypass ? '#7a1c1c' : '#ccc', transition:'background 0.2s' }}
            >
              <div style={{ position:'absolute', top:3, left: bypass ? 23 : 3, width:18, height:18,
                borderRadius:'50%', background:'#fff', transition:'left 0.2s',
                boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
          </div>

          <button
            onClick={() => { setBatchMode(!batchMode); setBatchSelected(new Set()); }}
            style={{ padding:'8px 16px', background: batchMode ? '#7a1c1c' : '#fff',
              border:'1px solid #e0d5c5', borderRadius:7, color: batchMode ? '#E8C97A' : '#7a1c1c',
              fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Jost',sans-serif" }}
          >
            {batchMode ? '✕ Cancel Batch' : '⚡ Batch AI Tag'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={S.stats}>
        <StatPill label="Awaiting Label"    value={stats.totalRaw}           color="#b45309" />
        <StatPill label="Labelled Images"   value={stats.totalLabelled}      color="#15803d" />
        <StatPill label="In Training Set"   value={stats.inTraining}         color="#7a1c1c" />
        <StatPill label="Pending Sign-off"  value={stats.pendingSuggestions} color="#6d28d9" />
      </div>

      {/* Batch bar */}
      {batchMode && (
        <div style={{ background:'#1a0a0a', color:'#E8C97A', padding:'12px 20px', borderRadius:10,
          display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontSize:13 }}>
            {batchSelected.size === 0
              ? 'Click images to select for batch AI tagging'
              : `${batchSelected.size} image${batchSelected.size > 1 ? 's' : ''} selected — mode: ${bypass ? 'auto-approve' : 'review'}`}
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {batchMsg && (
              <span style={{ fontSize:12, color: batchMsg.startsWith('Error') ? '#ff8080' : '#86efac' }}>
                {batchMsg}
              </span>
            )}
            <button
              disabled={!batchSelected.size}
              onClick={handleBatchAutoTag}
              style={{ padding:'8px 16px', background:'#E8C97A', border:'none', borderRadius:7,
                color:'#1a0a0a', fontSize:12, fontWeight:700,
                cursor: batchSelected.size ? 'pointer' : 'default',
                opacity: batchSelected.size ? 1 : 0.4, fontFamily:"'Jost',sans-serif" }}
            >
              🤖 Tag {batchSelected.size || ''} Images
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {[
          { key:'queue',   label:`Queue (${stats.totalRaw ?? 0})` },
          { key:'pending', label:`Pending Sign-off (${stats.pendingSuggestions ?? 0})` },
          { key:'dataset', label:`Dataset (${stats.totalLabelled ?? 0})` },
        ].map(t => (
          <button key={t.key} style={S.tabBtn(tab === t.key)}
            onClick={() => { setTab(t.key); setOffset(0); }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Image grid */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'48px', color:'#999', fontSize:14 }}>Loading images…</div>
      ) : images.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px', color:'#999' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>
            {tab === 'queue' ? '🎉' : tab === 'pending' ? '✨' : '📂'}
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:'#333', marginBottom:6 }}>
            {tab === 'queue' ? 'Queue is empty' : tab === 'pending' ? 'No pending sign-offs' : 'No labelled images yet'}
          </div>
          <div style={{ fontSize:12 }}>
            {tab === 'queue' ? 'Run the scraper to populate the queue.'
              : tab === 'pending' ? 'All AI suggestions have been reviewed.'
              : 'Label images to build the training set.'}
          </div>
        </div>
      ) : (
        <div style={S.grid}>
          {images.map(img => (
            <div key={img.id} style={{ position:'relative' }}
              onClick={() => {
                if (batchMode) {
                  setBatchSelected(sel => {
                    const next = new Set(sel);
                    next.has(img.id) ? next.delete(img.id) : next.add(img.id);
                    return next;
                  });
                } else {
                  setSelected(img);
                }
              }}
            >
              {batchMode && batchSelected.has(img.id) && (
                <div style={{ position:'absolute', top:8, left:8, zIndex:10, background:'#7a1c1c',
                  color:'#fff', borderRadius:'50%', width:22, height:22,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700 }}>✓</div>
              )}
              <ImageCard image={img} onClick={() => {}} selected={!batchMode && selected?.id === img.id} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:20, justifyContent:'center' }}>
          <button style={S.pgBtn(offset === 0)} disabled={offset === 0}
            onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>← Prev</button>
          <span style={{ fontSize:12, color:'#888' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button style={S.pgBtn(offset + LIMIT >= total)} disabled={offset + LIMIT >= total}
            onClick={() => setOffset(o => o + LIMIT)}>Next →</button>
        </div>
      )}

      {/* Drawer */}
      {selected && (
        <ImageDrawer
          image={selected}
          bypass={bypass}
          onClose={() => setSelected(null)}
          onLabelled={handleLabelled}
        />
      )}
    </div>
  );
}