import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getToken } from '../lib/tokenStore.js';

// Map URL path → default tab
const PATH_TO_TAB = {
  '/admin/artists':   'artists',
  '/admin/fb':        'meals',
  '/admin/logistics': 'logistics',
  '/admin/cities':    'cities',
  '/admin/audit':     'audit',
};

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed'); }
  return res.json();
}

function fmt(n) { return n ? '₹' + Number(n).toLocaleString('en-IN') : '—'; }

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditCell({ value, type = 'text', onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value);

  function handleKey(e) {
    if (e.key === 'Enter') { onSave(type === 'number' ? parseInt(val) : val); setEditing(false); }
    if (e.key === 'Escape') { setVal(value); setEditing(false); }
  }

  if (!editing) return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      style={{ cursor:'pointer', borderBottom:'1px dashed #ccc', paddingBottom:1 }}>
      {type === 'number' && typeof value === 'number' && value > 1000 ? fmt(value) : value}
    </span>
  );

  return (
    <input autoFocus value={val} type={type} onChange={e => setVal(e.target.value)} onKeyDown={handleKey}
      onBlur={() => { onSave(type === 'number' ? parseInt(val) : val); setEditing(false); }}
      style={{ width:'120px', padding:'3px 6px', border:'1px solid var(--gold,#c4973d)', borderRadius:4, fontSize:13 }} />
  );
}

// ── Generic table section ─────────────────────────────────────────────────────
function CostTable({ title, icon, rows, columns, onUpdate, onAdd, onDelete, addForm }) {
  const [saving, setSaving] = useState({});
  const [msg, setMsg]       = useState('');
  const [showAdd, setShowAdd] = useState(false);

  async function handleUpdate(id, field, value) {
    setSaving(s => ({ ...s, [id]: true }));
    setMsg('');
    try {
      await onUpdate(id, { [field]: value });
      setMsg('✓ Saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    finally { setSaving(s => ({ ...s, [id]: false })); }
  }

  const S = {
    section: { marginBottom:28 },
    header:  { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
    title:   { fontSize:14, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#333' },
    table:   { background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:12, overflow:'hidden', width:'100%', borderCollapse:'collapse' },
    th:      { padding:'10px 16px', textAlign:'left', fontSize:10, letterSpacing:'1px', textTransform:'uppercase', color:'#888', fontWeight:600, background:'#f9f5ef', borderBottom:'1px solid #f0e8e0' },
    td:      { padding:'12px 16px', borderBottom:'1px solid #f5f0eb', fontSize:13, verticalAlign:'middle' },
    addBtn:  { padding:'7px 14px', background:'var(--maroon,#7a1c1c)', border:'none', borderRadius:7, color:'#E8C97A', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' },
  };

  return (
    <div style={S.section}>
      <div style={S.header}>
        <div style={S.title}>{icon} {title}</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {msg && <span style={{ fontSize:12, color: msg.startsWith('Error') ? '#dc2626' : '#15803d' }}>{msg}</span>}
          {onAdd && <button style={S.addBtn} onClick={() => setShowAdd(!showAdd)}>{showAdd ? '✕ Cancel' : '+ Add'}</button>}
        </div>
      </div>

      {showAdd && addForm && (
        <div style={{ background:'#f9f5ef', border:'1px solid #e8d5b0', borderRadius:10, padding:'14px', marginBottom:12 }}>
          {addForm(() => setShowAdd(false))}
        </div>
      )}

      <table style={S.table}>
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}<th style={S.th}></th></tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              {columns.map(c => (
                <td key={c.key} style={S.td}>
                  {c.editable ? (
                    <EditCell value={row[c.key]} type={c.type ?? 'text'} onSave={v => handleUpdate(row.id, c.key, v)} />
                  ) : (
                    <span style={c.style?.(row) ?? {}}>{c.render ? c.render(row) : row[c.key]}</span>
                  )}
                  {saving[row.id] && <span style={{ fontSize:10, color:'#888', marginLeft:6 }}>saving…</span>}
                </td>
              ))}
              <td style={S.td}>
                {onDelete && (
                  <button onClick={() => onDelete(row.id)} style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:13 }}>✕</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} style={{ ...S.td, textAlign:'center', color:'#aaa' }}>No items</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
function AuditLog() {
  const [log, setLog]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/audit?limit=30').then(d => setLog(d.log ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const S = {
    th: { padding:'8px 14px', fontSize:10, letterSpacing:'1px', textTransform:'uppercase', color:'#888', fontWeight:600, background:'#f9f5ef', borderBottom:'1px solid #f0e8e0', textAlign:'left' },
    td: { padding:'10px 14px', borderBottom:'1px solid #f5f0eb', fontSize:12, verticalAlign:'top' },
  };

  return (
    <div>
      <div style={{ fontSize:14, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#333', marginBottom:12 }}>📋 Audit Log</div>
      {loading ? <div style={{ color:'#999', fontSize:13 }}>Loading…</div> : (
        <div style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:12, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Table','Operation','Changed By','When','Old → New'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {log.map(row => (
                <tr key={row.id}>
                  <td style={S.td}><code style={{ fontSize:11 }}>{row.table_name}</code></td>
                  <td style={S.td}><span style={{ color: row.operation==='UPDATE'?'#d97706':row.operation==='INSERT'?'#15803d':'#dc2626', fontWeight:700, fontSize:11 }}>{row.operation}</span></td>
                  <td style={S.td}>{row.profiles?.full_name ?? row.profiles?.email ?? '—'}</td>
                  <td style={S.td}>{new Date(row.changed_at).toLocaleString('en-IN')}</td>
                  <td style={S.td}>
                    {row.old_data && row.new_data && Object.keys(row.new_data).filter(k => !['updated_at','version','updated_by'].includes(k) && row.old_data[k] !== row.new_data[k]).slice(0,3).map(k => (
                      <div key={k} style={{ fontSize:11 }}>
                        <strong>{k}:</strong> <span style={{ color:'#dc2626', textDecoration:'line-through' }}>{String(row.old_data[k]).slice(0,20)}</span>
                        {' → '}<span style={{ color:'#15803d' }}>{String(row.new_data[k]).slice(0,20)}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={5} style={{ ...S.td, textAlign:'center', color:'#aaa' }}>No audit entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminCostData() {
  const location  = useLocation();
  const [activeTab, setActiveTab] = useState(() => PATH_TO_TAB[location.pathname] ?? 'artists');
  const [artists, setArtists]     = useState([]);
  const [cities, setCities]       = useState([]);
  const [meals, setMeals]         = useState([]);
  const [barTiers, setBarTiers]   = useState([]);
  const [counters, setCounters]   = useState([]);
  const [logistics, setLogistics] = useState(null);
  const [sfx, setSfx]             = useState([]);
  const [sundries, setSundries]   = useState(null);
  const [loading, setLoading]     = useState(true);

  // Sync tab when sidebar link changes (e.g. /admin/fb → meals)
  useEffect(() => {
    const mapped = PATH_TO_TAB[location.pathname];
    if (mapped) setActiveTab(mapped);
  }, [location.pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, m, b, co, l, s, sd] = await Promise.all([
        apiFetch('/api/admin/artists'), apiFetch('/api/admin/cities'),
        apiFetch('/api/admin/meals'), apiFetch('/api/admin/bar-tiers'),
        apiFetch('/api/admin/specialty-counters'), apiFetch('/api/admin/logistics'),
        apiFetch('/api/admin/sfx'), apiFetch('/api/admin/sundries'),
      ]);
      setArtists(a.artists ?? []); setCities(c.cities ?? []); setMeals(m.meals ?? []);
      setBarTiers(b.barTiers ?? []); setCounters(co.counters ?? []); setLogistics(l.logistics);
      setSfx(s.sfx ?? []); setSundries(sd.sundries);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateArtist(id, data) { await apiFetch(`/api/admin/artists/${id}`, { method:'PUT', body: JSON.stringify(data) }); setArtists(a => a.map(x => x.id===id ? {...x,...data} : x)); }
  async function deleteArtist(id) { if (!confirm('Deactivate?')) return; await apiFetch(`/api/admin/artists/${id}`, { method:'DELETE' }); setArtists(a => a.filter(x => x.id!==id)); }
  async function updateCity(id, data) { await apiFetch(`/api/admin/cities/${id}`, { method:'PUT', body: JSON.stringify(data) }); setCities(c => c.map(x => x.id===id ? {...x,...data} : x)); }
  async function updateMeal(id, data) { await apiFetch(`/api/admin/meals/${id}`, { method:'PUT', body: JSON.stringify(data) }); setMeals(m => m.map(x => x.id===id ? {...x,...data} : x)); }
  async function updateBarTier(id, data) { await apiFetch(`/api/admin/bar-tiers/${id}`, { method:'PUT', body: JSON.stringify(data) }); setBarTiers(b => b.map(x => x.id===id ? {...x,...data} : x)); }
  async function updateCounter(id, data) { await apiFetch(`/api/admin/specialty-counters/${id}`, { method:'PUT', body: JSON.stringify(data) }); setCounters(c => c.map(x => x.id===id ? {...x,...data} : x)); }
  async function updateLogistics(id, data) { const d = await apiFetch(`/api/admin/logistics/${id}`, { method:'PUT', body: JSON.stringify(data) }); setLogistics(d.logistics); }
  async function updateSfx(id, data) { await apiFetch(`/api/admin/sfx/${id}`, { method:'PUT', body: JSON.stringify(data) }); setSfx(s => s.map(x => x.id===id ? {...x,...data} : x)); }
  async function updateSundries(id, data) { const d = await apiFetch(`/api/admin/sundries/${id}`, { method:'PUT', body: JSON.stringify(data) }); setSundries(d.sundries); }

  async function addArtist(formData, onDone) {
    const data = await apiFetch('/api/admin/artists', { method:'POST', body: JSON.stringify(formData) });
    setArtists(a => [...a, data.artist]); onDone();
  }

  const TABS = ['artists','cities','meals','bar','counters','logistics','sfx','sundries','audit'];

  const tabStyle = (active) => ({
    padding:'8px 14px', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit',
    background: active ? '#fff' : 'transparent', color: active ? '#7a1c1c' : '#888',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
  });

  return (
    <div style={{ fontFamily:"'Jost',sans-serif" }}>
      <h1 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:'#1a0a0a', margin:'0 0 6px' }}>💰 Cost Data Management</h1>
      <p style={{ color:'#888', fontSize:13, marginBottom:20 }}>All edits are version-controlled and logged. Click any value to edit inline, press Enter to save.</p>

      <div style={{ display:'flex', gap:0, marginBottom:24, background:'#f5f0eb', borderRadius:8, padding:4, flexWrap:'wrap' }}>
        {TABS.map(t => <button key={t} style={tabStyle(activeTab===t)} onClick={() => setActiveTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
      </div>

      {loading && activeTab !== 'audit' ? (
        <div style={{ color:'#999', fontSize:13 }}>Loading…</div>
      ) : (
        <>
          {activeTab === 'artists' && (
            <CostTable
              title="Artists & Entertainment" icon="🎤"
              rows={artists}
              columns={[
                { key:'label',       label:'Artist / Tier', editable:true },
                { key:'artist_type', label:'Type' },
                { key:'cost_min',    label:'Fee Min (₹)', editable:true, type:'number' },
                { key:'cost_max',    label:'Fee Max (₹)', editable:true, type:'number' },
                { key:'version',     label:'Ver', render:r => `v${r.version}` },
              ]}
              onUpdate={updateArtist}
              onDelete={deleteArtist}
              onAdd={addArtist}
              addForm={(onDone) => <AddArtistForm onSave={(d) => addArtist(d, onDone)} />}
            />
          )}

          {activeTab === 'cities' && (
            <CostTable
              title="City Cost Multipliers" icon="🏙️"
              rows={cities}
              columns={[
                { key:'label',      label:'City' },
                { key:'region',     label:'Region' },
                { key:'multiplier', label:'Multiplier', editable:true, type:'number', render:r=>`${r.multiplier}×` },
                { key:'version',    label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateCity}
            />
          )}

          {activeTab === 'meals' && (
            <CostTable
              title="Meal Types (per head)" icon="🍽️"
              rows={meals}
              columns={[
                { key:'label',       label:'Meal Type' },
                { key:'cost_min_ph', label:'Min/Head (₹)', editable:true, type:'number' },
                { key:'cost_max_ph', label:'Max/Head (₹)', editable:true, type:'number' },
                { key:'version',     label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateMeal}
            />
          )}

          {activeTab === 'bar' && (
            <CostTable
              title="Bar Tiers (per head)" icon="🍸"
              rows={barTiers}
              columns={[
                { key:'label',       label:'Bar Tier' },
                { key:'cost_min_ph', label:'Min/Head (₹)', editable:true, type:'number' },
                { key:'cost_max_ph', label:'Max/Head (₹)', editable:true, type:'number' },
                { key:'version',     label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateBarTier}
            />
          )}

          {activeTab === 'counters' && (
            <CostTable
              title="Specialty Counters" icon="🍜"
              rows={counters}
              columns={[
                { key:'label',    label:'Counter' },
                { key:'cost_min', label:'Min (₹)', editable:true, type:'number' },
                { key:'cost_max', label:'Max (₹)', editable:true, type:'number' },
                { key:'version',  label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateCounter}
            />
          )}

          {activeTab === 'logistics' && logistics && (
            <CostTable
              title="Logistics Rates" icon="🚗"
              rows={[logistics]}
              columns={[
                { key:'guests_per_vehicle', label:'Guests/Vehicle', editable:true, type:'number' },
                { key:'vehicle_rate_min',   label:'Vehicle Min (₹)', editable:true, type:'number' },
                { key:'vehicle_rate_max',   label:'Vehicle Max (₹)', editable:true, type:'number' },
                { key:'ghodi_min',          label:'Ghodi Min (₹)', editable:true, type:'number' },
                { key:'ghodi_max',          label:'Ghodi Max (₹)', editable:true, type:'number' },
                { key:'dholi_unit_min',     label:'Dholi/Unit Min', editable:true, type:'number' },
                { key:'dholi_unit_max',     label:'Dholi/Unit Max', editable:true, type:'number' },
                { key:'version',            label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateLogistics}
            />
          )}

          {activeTab === 'sfx' && (
            <CostTable
              title="SFX Items" icon="🎆"
              rows={sfx}
              columns={[
                { key:'label',      label:'Item' },
                { key:'unit',       label:'Unit' },
                { key:'cost_fixed', label:'Cost (₹)', editable:true, type:'number' },
                { key:'version',    label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateSfx}
            />
          )}

          {activeTab === 'sundries' && sundries && (
            <CostTable
              title="Sundries & Extras Config" icon="🎁"
              rows={[sundries]}
              columns={[
                { key:'room_basket_min',          label:'Basket Min', editable:true, type:'number' },
                { key:'room_basket_max',          label:'Basket Max', editable:true, type:'number' },
                { key:'ritual_per_fn_min',        label:'Ritual/Fn Min', editable:true, type:'number' },
                { key:'ritual_per_fn_max',        label:'Ritual/Fn Max', editable:true, type:'number' },
                { key:'gift_per_guest_min',       label:'Gift/Guest Min', editable:true, type:'number' },
                { key:'gift_per_guest_max',       label:'Gift/Guest Max', editable:true, type:'number' },
                { key:'photography_min',          label:'Photo Min', editable:true, type:'number' },
                { key:'photography_max',          label:'Photo Max', editable:true, type:'number' },
                { key:'contingency_pct',          label:'Contingency %', editable:true, type:'number', render:r=>`${(r.contingency_pct*100).toFixed(0)}%` },
                { key:'version',                  label:'Ver', render:r=>`v${r.version}` },
              ]}
              onUpdate={updateSundries}
            />
          )}

          {activeTab === 'audit' && <AuditLog />}
        </>
      )}
    </div>
  );
}

function AddArtistForm({ onSave }) {
  const [f, setF] = useState({ label:'', artist_type:'DJ', cost_min:'', cost_max:'', is_named: false });
  const s = (k,v) => setF(x => ({...x,[k]:v}));
  const inputStyle = { padding:'8px 10px', border:'1px solid #e0d5c5', borderRadius:7, fontSize:13, fontFamily:'inherit', outline:'none' };

  return (
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
      <div><label style={{ fontSize:10, color:'#888', display:'block', marginBottom:4 }}>LABEL</label><input style={inputStyle} value={f.label} onChange={e=>s('label',e.target.value)} placeholder="Artist / tier name" /></div>
      <div><label style={{ fontSize:10, color:'#888', display:'block', marginBottom:4 }}>TYPE</label>
        <select style={inputStyle} value={f.artist_type} onChange={e=>s('artist_type',e.target.value)}>
          {['DJ','Band','Singer','Folk','Anchor','Choreo','Myra','Other'].map(t=><option key={t}>{t}</option>)}
        </select>
      </div>
      <div><label style={{ fontSize:10, color:'#888', display:'block', marginBottom:4 }}>MIN (₹)</label><input style={inputStyle} type="number" value={f.cost_min} onChange={e=>s('cost_min',e.target.value)} placeholder="50000" /></div>
      <div><label style={{ fontSize:10, color:'#888', display:'block', marginBottom:4 }}>MAX (₹)</label><input style={inputStyle} type="number" value={f.cost_max} onChange={e=>s('cost_max',e.target.value)} placeholder="150000" /></div>
      <button onClick={() => f.label && f.cost_min && f.cost_max && onSave({ ...f, cost_min:parseInt(f.cost_min), cost_max:parseInt(f.cost_max) })}
        style={{ padding:'8px 16px', background:'#7a1c1c', border:'none', borderRadius:7, color:'#E8C97A', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
        Add Artist
      </button>
    </div>
  );
}